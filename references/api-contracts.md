# API Contracts — Repeaty Edge Functions

Four Edge Functions, each with one responsibility. All require a valid Supabase JWT in `Authorization: Bearer <token>`. Service-role calls bypass auth (used by cron and admin scripts only — never callable from the browser).

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
| 403    | Authenticated but not authorized (tier-gated OR cross-resource — see `code`) |
| 404    | Referenced resource not found (e.g. `card_id` doesn't exist)    |
| 429    | Per-user rate limit exceeded                                     |
| 500    | Unexpected server error                                          |
| 504    | Upstream API (Whisper / Claude) timeout (15s AbortController)   |

Error `code` strings (string enum, defined in `packages/shared/src/edge-errors.ts` and mirrored in `supabase/functions/_shared/edge-errors.ts`):

```
INVALID_PAYLOAD | UNAUTHENTICATED | FORBIDDEN_TIER | FORBIDDEN_RESOURCE |
NOT_FOUND | RATE_LIMITED | UPSTREAM_TIMEOUT | UPSTREAM_FAILED | INTERNAL
```

Both 403 codes share an HTTP status; callers must branch on the `code`:

- `FORBIDDEN_TIER` — caller is on the wrong tier for this Edge Function (free user hitting `generate-lesson` / `generate-feedback`). UI prompt: upgrade.
- `FORBIDDEN_RESOURCE` — caller is on the right tier but is asking about a resource they don't own (e.g. an `audio_storage_path` that doesn't begin with their `user_id`). UI prompt: a generic "you can't access this" — not an upgrade flow.

## Non-Edge-Function operations

Some writes go directly via supabase-js (RLS-gated), with no Edge Function involved:

| Table                    | Phase | Write path                                                       |
| ------------------------ | ----- | ---------------------------------------------------------------- |
| `reviews`                | 2     | `useReviewSession.submitRating` upserts on each rating          |
| `comprehension_attempts` | 3     | `useComprehensionSession.submitResponse` inserts on each submit |

These rely on the table's RLS policies to enforce `auth.uid() = user_id`. The integration suites (`bundled-decks.test.ts` for review reads, `comprehension-attempts-rls.test.ts` for comprehension writes) verify the WITH-CHECK and cross-user isolation.

`pronunciation_attempts` (Phase 4), `feedback_cache` (Phase 5), and `rate_limits` (Phase 5) are written by Edge Functions only — never by the client.

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
3. Verify `audio_storage_path`'s first `/`-segment equals the caller's `user_id` and the path has at least three segments (path-traversal guard; matches the bucket's `(storage.foldername(name))[1]` policy). Returns `403 FORBIDDEN_RESOURCE` on failure.
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

> **Note (Phase 5.4 swap, landed):** The Phase-3 canned-text body of `useFeedback` was replaced with a `useQuery` call to this Edge Function in 5.4. The public hook types — `FeedbackInput` (`{ kind, bucket, targetText, nativeText, userResponse, nativeLanguageCode, attemptId? }`) and `FeedbackResult` (`{ text: string | null, isLoading: boolean }`) — were preserved (additive `attemptId`). `apps/web/src/features/feedback/canned-text.ts` is now a fallback used only on free-tier, perfect-bucket, missing `attemptId`, or transport / 429 / timeout cases — not the primary path.

## `flip-tier` (Phase 5, admin only)

**Purpose:** flip another user's `profiles.tier` (and write a `tier_change_log` audit row) from the in-app `/admin` route. Manual replacement for Stripe billing per [DEBT-001](../audits/debt.md).

**Auth:** authenticated AND `profiles.is_admin = true`. The Edge Function verifies the JWT; the SECURITY DEFINER `flip_tier` SQL RPC enforces the admin check + self-flip guard atomically.

**Request:**
```ts
type FlipTierRequest = {
  target_user_id: string;             // UUID; must NOT equal caller's auth.uid()
  new_tier: 'free' | 'pro' | 'admin'; // CHECK-constrained server-side
  reason?: string;                    // ≤ 500 chars; persisted to tier_change_log.reason
};
```

**Server-side flow:**
1. Verify JWT → caller's `user_id`.
2. Zod-parse the body (400 INVALID_PAYLOAD on failure).
3. Call `flip_tier(target_user_id, new_tier, reason)` under the *user* JWT (so SECURITY DEFINER's `auth.uid()` resolves to the actor inside the admin check).
4. Map RPC raise messages back to Edge error codes:
   - `NOT_ADMIN` → 403 `FORBIDDEN_TIER`
   - `SELF_FLIP_FORBIDDEN` → 403 `FORBIDDEN_RESOURCE`
   - `TARGET_NOT_FOUND` → 404 `NOT_FOUND`
   - `NO_CHANGE` / `INVALID_TIER` → 400 `INVALID_PAYLOAD`
   - `UNAUTHENTICATED` → 401
5. Return the inserted `tier_change_log.id` for audit-trail correlation.

**Response data:**
```ts
type FlipTierResponse = {
  log_id: string;                     // tier_change_log.id of the inserted audit row
};
```

**By design (single-user beta):** an admin can flip any non-self user to any of `{free, pro, admin}` — including elevating another user to admin. This is per the migration body's intentional permissiveness; tighten when Stripe activates DEBT-001.

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
