# API Contracts — Repeaty Edge Functions

Three Edge Functions, each with one responsibility. All require a valid Supabase JWT in `Authorization: Bearer <token>`. Service-role calls bypass auth (used by cron and admin scripts only — never callable from the browser).

## Common shape

All Edge Functions return JSON with this shape:

```ts
type EdgeResponse<T> =
  | { data: T; error: null; meta?: { latency_ms: number; cost_usd?: number } }
  | { data: null; error: { code: string; message: string }; meta?: { latency_ms: number } };
```

HTTP status mirrors the error class:

| Status | When                                                             |
| ------ | ---------------------------------------------------------------- |
| 200    | Success                                                          |
| 400    | Validation failure (Zod parse failed on request body)            |
| 401    | Missing or invalid JWT                                           |
| 403    | Authenticated but not authorized (e.g. free user hitting Pro fn) |
| 404    | Referenced resource not found (e.g. `card_id` doesn't exist)    |
| 429    | Per-user rate limit exceeded                                     |
| 500    | Unexpected server error                                          |
| 504    | Upstream API (Whisper / Claude) timeout (15s AbortController)   |

Error `code` strings (string enum, defined in `packages/shared/src/edge-errors.ts`):

```
INVALID_PAYLOAD | UNAUTHENTICATED | FORBIDDEN_TIER | NOT_FOUND |
RATE_LIMITED | UPSTREAM_TIMEOUT | UPSTREAM_FAILED | INTERNAL
```

## `score-pronunciation` (Phase 4)

**Purpose:** transcribe a recorded audio blob with OpenAI Whisper and score it against the expected target text.

**Auth:** any authenticated user.

**Request:**
```ts
type ScorePronunciationRequest = {
  card_id: string;                    // UUID of the card being attempted
  audio_storage_path: string;         // path under bucket `pronunciation-audio`, must start with the user's UUID
};
```

**Server-side flow:**
1. Verify JWT → `user_id`.
2. Load card by `card_id` (RLS-respecting). 404 if not visible.
3. Verify `audio_storage_path` starts with `${user_id}/` (path-traversal guard).
4. Download audio from Storage.
5. POST to OpenAI Whisper (`/v1/audio/transcriptions`) with `language: card.language_code` and 15s AbortController.
6. Compute `similarity_score` via normalized Levenshtein on a Unicode-normalized (NFC + casefold) version of transcript vs `card.target_text`.
7. Insert into `pronunciation_attempts` (without `feedback_text` — that comes from `generate-feedback` if Pro).
8. Return.

**Response data:**
```ts
type ScorePronunciationResponse = {
  attempt_id: string;
  whisper_transcript: string;
  similarity_score: number;           // 0.0–1.0
  expected: string;                   // target_text echoed for client convenience
};
```

## `generate-lesson` (Phase 5, Pro only)

**Purpose:** generate a personalized deck for the user, given their context.

**Auth:** authenticated AND `profiles.tier IN ('pro','admin')`.

**Request:**
```ts
type GenerateLessonRequest = {
  language_code: string;              // BCP-47, must match a row in user_languages
  topic_hint?: string;                // optional user-supplied topic ("food", "office")
  card_count?: number;                // 5–25, default 12
};
```

**Server-side flow:**
1. Verify JWT, verify Pro/admin tier (else 403 `FORBIDDEN_TIER`).
2. Check rate limit (`rate_limits` table, bucket `lesson_generation`, daily cap 10). 429 if exceeded.
3. Load user context: `profiles.native_language_code`, `user_languages.cefr_level`, recent weak words from `reviews` + `pronunciation_attempts` + `comprehension_attempts`.
4. Build Claude prompt with structured JSON output schema (Zod-derived).
5. Call Claude with 15s AbortController and `response_format: { type: "json_object" }` (or equivalent — strip markdown fences in case the model wraps).
6. Parse + Zod-validate. On parse failure: return 502-ish `UPSTREAM_FAILED` with raw response logged server-side.
7. Insert deck (`source = 'ai_generated'`, `owner_id = user_id`) and cards.
8. Bump rate limit counter.
9. Return.

**Response data:**
```ts
type GenerateLessonResponse = {
  deck_id: string;
  deck_name: string;
  card_count: number;
  cost_estimate_usd: number;          // for monitoring; logged in meta as well
};
```

## `generate-feedback` (Phase 5, Pro only)

**Purpose:** level-appropriate AI coaching for a non-perfect attempt (comprehension or pronunciation).

**Auth:** authenticated AND Pro/admin.

**Request:**
```ts
type GenerateFeedbackRequest =
  | {
      kind: 'pronunciation';
      attempt_id: string;             // pronunciation_attempts.id
    }
  | {
      kind: 'comprehension';
      attempt_id: string;             // comprehension_attempts.id
    };
```

**Server-side flow:**
1. Verify JWT, verify Pro/admin.
2. Load attempt by id (RLS-respecting). 404 if not visible. 400 if score is in the "perfect" band (no feedback needed).
3. Compute `error_pattern` key:
   - **Pronunciation:** hash of (transcript-vs-target diff edits, sorted).
   - **Comprehension:** "wrong-translation" \| "right-but-slow" with a normalized response bucket.
4. Check `feedback_cache` for `(card_id, error_pattern, native_language_code)` — if hit, return cached.
5. Else call Claude with: card, attempt detail, native language, CEFR level. 15s AbortController. Structured JSON response.
6. Insert into `feedback_cache`. Update the source attempt's `feedback_text`.
7. Return.

**Response data:**
```ts
type GenerateFeedbackResponse = {
  feedback_text: string;
  cached: boolean;
  cost_estimate_usd: number;          // 0 when cached
};
```

## Logging contract

Every Edge Function logs one structured line per invocation, JSON to stdout:

```json
{
  "fn": "score-pronunciation",
  "user_id": "uuid",
  "latency_ms": 842,
  "status": 200,
  "cost_estimate_usd": 0.006,
  "request_id": "uuid-v4"
}
```

This is what `bughunt` and `optimize` audit against.
