/**
 * PlatformAdapter — the contract between feature code and platform-specific
 * APIs (browser DOM, SpeechSynthesis, future Capacitor plugins).
 *
 * Feature code imports `platform` from `@/platform` and never reaches into
 * `navigator.*`, `window.speechSynthesis`, or `@capacitor/*` directly.
 * Adding a Capacitor build target is then a single new file
 * (`apps/web/src/platform/capacitor.ts`) plus a build-time switch on
 * `import.meta.env.VITE_PLATFORM`.
 *
 * v1 only implements TTS (`playTargetText`). Mic capture + recording playback
 * land in Phase 4 (pronunciation mode); they're typed here as `unknown` so
 * the adapter signature stays stable.
 */

export type PlayTargetTextOptions = {
  /** BCP-47 language code, e.g. "es", "fr", "en-US". Required: voices are
   * picked per-language. */
  lang: string;
  /** Speech rate multiplier, default 1.0. Some browsers go too fast on ja/zh
   * by default — a future per-user pref can land here. */
  rate?: number;
};

export type PlatformAdapter = {
  /**
   * Speak the given target text in the given language. Resolves when speech
   * ends (or rejects if the platform has no voice for that language and
   * `lang.startsWith` doesn't match any installed voice either).
   */
  playTargetText(text: string, options: PlayTargetTextOptions): Promise<void>;

  /** Cancel any in-flight `playTargetText`. No-op if nothing is speaking. */
  cancelSpeech(): void;

  /**
   * True when the runtime can actually speak. False on server / SSR / hostile
   * browser environments. Used to gate the Flashcard's Play button.
   */
  canSpeak(): boolean;

  // ── Phase 4 (pronunciation mode) ──────────────────────────────────────────
  // requestMicPermission(): Promise<'granted' | 'denied' | 'prompt'>;
  // startRecording(): Promise<unknown>;
  // stopRecording(handle: unknown): Promise<Blob>;
  // playRecordedAudio(blob: Blob): Promise<void>;
};
