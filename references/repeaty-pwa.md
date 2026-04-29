# PWA + Capacitor Abstraction — Repeaty

Repeaty ships as a PWA in v1. Native iOS/Android via Capacitor is deferred ([DEBT-002](../audits/debt.md)) but the architecture is built so the wrap is mechanical, not a rewrite.

## Platform abstraction

Anything that touches a platform-specific browser/native API lives in `apps/web/src/platform/`. Feature code imports `from '@/platform'` and never from `navigator.*`, `window.*`, or `@capacitor/*` directly.

```
apps/web/src/platform/
  ├── index.ts         // Public API (re-exports active impl)
  ├── types.ts         // Interface definitions (PlatformAdapter)
  ├── web.ts           // Web implementations (active in v1)
  └── capacitor.ts     // Stubbed in v1; activated when DEBT-002 ships
```

### `PlatformAdapter` interface (Phase 4 lands the real version)

```ts
export interface PlatformAdapter {
  // Microphone
  requestMicPermission(): Promise<'granted' | 'denied' | 'prompt'>;
  startRecording(): Promise<RecordingHandle>;          // wraps MediaRecorder on web
  stopRecording(handle: RecordingHandle): Promise<Blob>;

  // Audio playback
  playTargetText(text: string, lang: string): Promise<void>;   // SpeechSynthesis on web
  playRecordedAudio(blob: Blob): Promise<void>;

  // Future (post-v1)
  scheduleLocalNotification?(opts: { title: string; at: Date }): Promise<void>;
}
```

Selection is at module load via `import.meta.env.VITE_PLATFORM` — defaults to `'web'`. Capacitor builds set `VITE_PLATFORM=capacitor` and replace the import path.

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
