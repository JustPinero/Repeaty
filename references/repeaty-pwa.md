# PWA + Capacitor Abstraction — Repeaty

Repeaty ships as a PWA in v1. Native iOS/Android via Capacitor is deferred ([DEBT-002](../audits/debt.md)) but the architecture is built so the wrap is mechanical, not a rewrite.

## Mascot

Peaty the parrot is the brand mascot. Pose specs live at [`assets/peaty/peaty-poses.md`](../assets/peaty/peaty-poses.md) (10 poses + app-icon + splash variants). Generated illustrations are saved both to `assets/peaty/` (design source-of-truth) and to `apps/web/public/peaty/` (served statically by Vite).

| Pose                          | File                       | Use case                                             | Lands in   |
| ----------------------------- | -------------------------- | ---------------------------------------------------- | ---------- |
| 1. Welcome Wave               | `peat-start.jpg`           | Dashboard greeting card (`<PeatyGreeting>`)          | Phase 1.5  |
| 2. Cheering Celebration       | `peaty-cheering.jpg`       | Correct answer / perfect pronunciation               | Phase 2 / 4 |
| 3. Encouraging Thumbs-Up      | `peaty-thumbs.jpg`         | Mid-range score feedback                             | Phase 3 / 4 |
| 4. Gentle Empathy             | `peaty-empathy.jpg`        | Low-score feedback                                   | Phase 3 / 4 |
| 5. Speaking with Mic          | `peaty-mic.jpg`            | Pronunciation mode header                            | Phase 4    |
| 6. Reading Book               | `peaty-book.jpg`           | Flashcards mode header                               | Phase 2    |
| 7. Speed Stopwatch            | `peaty-stopwatch.jpg`      | Comprehension mode header                            | Phase 3    |
| 8. Thinking Pose              | `peaty-thinking.jpg`       | Flashcard reveal / idle                              | Phase 2    |
| 9. Sleepy / Resting           | `peaty-sleepy.jpg`         | Streak broken / inactive state                       | Phase 6    |
| 10. AI Magic                  | `peaty-magic.jpg`          | Pro features / lesson generation                     | Phase 5    |
| App icon (192/512 + maskable) | `peaty-icon-{size}.png`    | PWA manifest                                         | Phase 6    |
| Splash                        | `peaty-splash.jpg`         | App launch                                           | Phase 6    |

The single Welcome Wave pose ships in Phase 1; later poses are generated from the same character reference (per the `peaty-poses.md` workflow note) and added to `apps/web/public/peaty/` as their phases land. Always include a meaningful `alt` describing what Peaty is doing — never `alt="Peaty"` alone.

## Platform abstraction

Anything that touches a platform-specific browser/native API lives in `apps/web/src/platform/`. Feature code imports `from '@/platform'` and never from `navigator.*`, `window.*`, or `@capacitor/*` directly.

```
apps/web/src/platform/
  ├── index.ts         // Active adapter selector (default: web)
  ├── types.ts         // PlatformAdapter contract
  ├── web.ts           // Web implementations: SpeechSynthesis (2.5) + MediaRecorder (4.1)
  ├── web.test.ts      // Mock-driven coverage for the web adapter
  └── capacitor.ts     // Lands when DEBT-002 activates
```

### `PlatformAdapter` interface (TTS live in 2.5, mic capture live in 4.1)

```ts
export type PlatformAdapter = {
  // TTS
  playTargetText(text: string, options: { lang: string; rate?: number }): Promise<void>;
  cancelSpeech(): void;
  canSpeak(): boolean;

  // Mic capture (Phase 4.1)
  canRecord(): boolean;
  requestMicPermission(): Promise<'granted' | 'denied' | 'prompt'>;
  startRecording(): Promise<RecordingHandle>;
  stopRecording(handle: RecordingHandle): Promise<Blob>;
  cancelRecording(handle: RecordingHandle): void;
  playRecordedAudio(blob: Blob): Promise<void>;
};
```

`RecordingHandle` is opaque (branded type); the web impl stashes the `MediaRecorder` + `MediaStream` + chunks inside. The Capacitor swap (DEBT-002) gets a different shape, but feature code never touches the internals.

Selection is at module load via `import.meta.env.VITE_PLATFORM` — defaults to `'web'`. `'capacitor'` lands when [DEBT-002](../audits/debt.md) activates; until then the index falls back to web with a console warning.

The Flashcard component reads `platform.canSpeak()` at render time and only shows the 🔊 Play button when both `languageCode` is supplied and the runtime can speak. SSR / no-SpeechSynthesis browsers see the card without the button — the textual answer is still there.

### Why this matters

- **No `if (Capacitor)` checks scattered through feature code.** Every native swap is one file.
- **Tests stub `@/platform`** with a fake adapter — no `MediaRecorder` in jsdom hell.
- **iOS Safari quirks** (mic must be triggered from user gesture, no `getUserMedia` in some PWA contexts) live in `web.ts`, not in feature components.

## PWA specifics

### Manifest (Phase 6)

`apps/web/public/manifest.webmanifest`:
- `name`: "Repeaty"
- `short_name`: "Repeaty"
- `start_url`: `/`
- `display`: `standalone`
- `theme_color`: TBD (Peaty green-yellow)
- `background_color`: warm cream to match Peaty illustration
- `icons`: 192px + 512px + maskable variants, all from the Peaty illustration in `assets/peaty/`

### Service worker (Workbox, Phase 6)

Three cache strategies:

1. **Static assets** (JS, CSS, fonts): `CacheFirst`, immutable hashed filenames. Workbox precaches at install.
2. **Bundled deck JSON + audio TTS metadata**: `StaleWhileRevalidate`. Updates next visit but works offline immediately.
3. **API calls** (Supabase queries, Edge Functions): `NetworkOnly` with optional offline queue (see below).

### Offline queue (Phase 2 lays the foundation)

Dexie holds three queues:
- `pending_reviews` — review ratings the user submitted while offline. On reconnect, replay in chronological order. Conflict resolution: server wins; client overwrites only when a review for the same card was strictly older.
- `pending_pronunciation_attempts` — recorded audio + intent. On reconnect, upload audio → call `score-pronunciation`.
- `pending_comprehension_attempts` — small JSON payloads. On reconnect, batch-insert.

The queue replay is a state machine, not a "fire and forget" — it must handle Supabase 401 (re-auth) without losing queued items.

### Install prompt (Phase 6)

Capture `beforeinstallprompt`, stash the event, surface a "Install Repeaty" pill in the dashboard once the user has completed at least one session. iOS Safari has no `beforeinstallprompt`; for iOS we render a subtle "Add to Home Screen" hint with the Share-icon SVG.

## iOS Safari quirks (Phase 4 to document fully)

- **Mic must be triggered from a user gesture.** Programmatic `getUserMedia` outside of a click/tap handler silently fails.
- **`MediaRecorder` outputs `audio/mp4` (AAC)** on iOS, not `audio/webm`. Whisper accepts both, but our Storage upload Content-Type matters for replay.
- **PWA-installed mode has different permission UX.** A re-prompt dialog can appear differently than in normal Safari. Document during Phase 4 testing.
- **No `beforeinstallprompt` event.** iOS users install via Share → Add to Home Screen. No JS hook for this.

## When DEBT-002 (Capacitor) activates

Mechanical steps, none touching feature code:
1. `pnpm add -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android`.
2. `npx cap init Repeaty com.repeaty.app`.
3. Implement `apps/web/src/platform/capacitor.ts` against `@capacitor/microphone`, `@capacitor/text-to-speech`, etc.
4. Set build-time `VITE_PLATFORM=capacitor` for native builds.
5. Configure Apple/Google signing.
6. Sync: `npx cap sync && npx cap open ios`.

If feature code needs a `Capacitor.isNativePlatform()` check, the abstraction has leaked and that's a bug, not a feature.
