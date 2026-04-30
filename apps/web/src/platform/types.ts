/**
 * PlatformAdapter — the contract between feature code and platform-specific
 * APIs (browser DOM, SpeechSynthesis, MediaRecorder, future Capacitor plugins).
 *
 * Feature code imports `platform` from `@/platform` and never reaches into
 * `navigator.*`, `window.speechSynthesis`, or `@capacitor/*` directly.
 * Adding a Capacitor build target is then a single new file
 * (`apps/web/src/platform/capacitor.ts`) plus a build-time switch on
 * `import.meta.env.VITE_PLATFORM`.
 */

export type PlayTargetTextOptions = {
  /** BCP-47 language code, e.g. "es", "fr", "en-US". Required: voices are
   * picked per-language. */
  lang: string;
  /** Speech rate multiplier, default 1.0. Some browsers go too fast on ja/zh
   * by default — a future per-user pref can land here. */
  rate?: number;
};

/** Permission state — mirrors the Permissions API. */
export type MicPermission = 'granted' | 'denied' | 'prompt';

/** Opaque handle returned by startRecording, passed back to stop/cancel. */
export type RecordingHandle = {
  /** Internal — implementations stash MediaRecorder + MediaStream here. */
  __brand: 'RecordingHandle';
};

export type PlatformAdapter = {
  // ── Text-to-speech (Phase 2.5) ────────────────────────────────────────────

  /**
   * Speak the given target text in the given language. Resolves when speech
   * ends, rejects on synthesis error.
   */
  playTargetText(text: string, options: PlayTargetTextOptions): Promise<void>;

  /** Cancel any in-flight `playTargetText`. No-op if nothing is speaking. */
  cancelSpeech(): void;

  /** True iff the runtime can speak (gates the Flashcard's Play button). */
  canSpeak(): boolean;

  // ── Mic capture (Phase 4.1) ───────────────────────────────────────────────

  /**
   * True iff the runtime supports recording (`navigator.mediaDevices.getUserMedia`
   * + `window.MediaRecorder`). Use to gate the MicCapture component.
   */
  canRecord(): boolean;

  /**
   * Probe the current mic permission state via the Permissions API. Returns
   * `'prompt'` if the API isn't available — caller should call
   * `startRecording` to actually trigger the user-gesture-driven prompt.
   */
  requestMicPermission(): Promise<MicPermission>;

  /**
   * Start recording. Resolves with an opaque `RecordingHandle` once the
   * MediaRecorder is in the `recording` state. Rejects if permission is
   * denied or the platform can't open a mic stream.
   */
  startRecording(): Promise<RecordingHandle>;

  /**
   * Stop the recording and resolve with the final audio Blob (typically
   * `audio/webm;codecs=opus`, or `audio/mp4` on iOS Safari). Stops the
   * underlying MediaStream tracks.
   */
  stopRecording(handle: RecordingHandle): Promise<Blob>;

  /**
   * Abort the recording without resolving a Blob. Stops the stream.
   * Idempotent — safe to call after stopRecording.
   */
  cancelRecording(handle: RecordingHandle): void;

  /**
   * Play a recorded audio Blob through an `<audio>` element. Resolves on
   * `ended`. The caller is responsible for any UI affordance.
   */
  playRecordedAudio(blob: Blob): Promise<void>;
};
