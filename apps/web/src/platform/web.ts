import type {
  MicPermission,
  PlatformAdapter,
  PlayTargetTextOptions,
  RecordingHandle,
} from './types';

// ── SpeechSynthesis helpers ───────────────────────────────────────────────────

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { speechSynthesis?: SpeechSynthesis };
  return w.speechSynthesis ?? null;
}

function getUtteranceCtor():
  | (new (text: string) => SpeechSynthesisUtterance)
  | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtterance;
  };
  return w.SpeechSynthesisUtterance ?? null;
}

// ── Mic helpers ───────────────────────────────────────────────────────────────

type InternalHandle = RecordingHandle & {
  recorder: MediaRecorder;
  stream: MediaStream;
  chunks: Blob[];
};

function getMediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.mediaDevices ?? null;
}

function getMediaRecorderCtor(): typeof MediaRecorder | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { MediaRecorder?: typeof MediaRecorder };
  return w.MediaRecorder ?? null;
}

function pickMimeType(): string | undefined {
  const Recorder = getMediaRecorderCtor();
  if (!Recorder?.isTypeSupported) return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (Recorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const webPlatform: PlatformAdapter = {
  // TTS

  async playTargetText(text: string, options: PlayTargetTextOptions): Promise<void> {
    const synth = getSynth();
    const Utterance = getUtteranceCtor();
    if (!synth || !Utterance) {
      throw new Error('SpeechSynthesis is not available in this environment');
    }

    return new Promise<void>((resolve, reject) => {
      const utterance = new Utterance(text);
      utterance.lang = options.lang;
      if (options.rate !== undefined) utterance.rate = options.rate;
      utterance.onend = () => resolve();
      utterance.onerror = (event: Event) => {
        const err = event as unknown as { error?: string };
        reject(new Error(`Speech failed: ${err.error ?? 'unknown error'}`));
      };
      synth.speak(utterance);
    });
  },

  cancelSpeech(): void {
    getSynth()?.cancel();
  },

  canSpeak(): boolean {
    return getSynth() !== null && getUtteranceCtor() !== null;
  },

  // Mic

  canRecord(): boolean {
    const md = getMediaDevices();
    return !!md?.getUserMedia && getMediaRecorderCtor() !== null;
  },

  async requestMicPermission(): Promise<MicPermission> {
    if (typeof navigator === 'undefined') return 'prompt';
    const perm = (navigator as unknown as { permissions?: Permissions }).permissions;
    if (!perm?.query) return 'prompt';
    try {
      const status = await perm.query({ name: 'microphone' as PermissionName });
      // PermissionState is 'granted' | 'denied' | 'prompt' on modern browsers;
      // older Safari may return 'unknown' — treat that as 'prompt'.
      const state = status.state as MicPermission | string;
      if (state === 'granted' || state === 'denied' || state === 'prompt') return state;
      return 'prompt';
    } catch {
      // Not all browsers support 'microphone' as a PermissionName; fall through.
      return 'prompt';
    }
  },

  async startRecording(): Promise<RecordingHandle> {
    const md = getMediaDevices();
    const Recorder = getMediaRecorderCtor();
    if (!md?.getUserMedia || !Recorder) {
      throw new Error('Recording is not supported in this environment');
    }

    const stream = await md.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    const recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream);
    const chunks: Blob[] = [];

    recorder.addEventListener('dataavailable', (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });

    return new Promise<RecordingHandle>((resolve, reject) => {
      const onStart = () => {
        recorder.removeEventListener('start', onStart);
        const handle: InternalHandle = {
          __brand: 'RecordingHandle',
          recorder,
          stream,
          chunks,
        };
        resolve(handle);
      };
      const onError = (event: Event) => {
        recorder.removeEventListener('error', onError);
        const err = event as unknown as { error?: { message?: string } };
        reject(new Error(`Recording failed: ${err.error?.message ?? 'unknown error'}`));
      };
      recorder.addEventListener('start', onStart);
      recorder.addEventListener('error', onError);
      recorder.start();
    });
  },

  async stopRecording(handle: RecordingHandle): Promise<Blob> {
    const h = handle as InternalHandle;
    if (!h.recorder) throw new Error('Invalid recording handle');

    return new Promise<Blob>((resolve, reject) => {
      const onStop = () => {
        h.recorder.removeEventListener('stop', onStop);
        for (const track of h.stream.getTracks()) track.stop();
        const mimeType = h.recorder.mimeType || 'audio/webm';
        const blob = new Blob(h.chunks, { type: mimeType });
        resolve(blob);
      };
      const onError = (event: Event) => {
        h.recorder.removeEventListener('error', onError);
        const err = event as unknown as { error?: { message?: string } };
        reject(new Error(`Recording stop failed: ${err.error?.message ?? 'unknown error'}`));
      };
      h.recorder.addEventListener('stop', onStop);
      h.recorder.addEventListener('error', onError);
      // If already inactive, stop() is a no-op and `stop` event won't fire —
      // resolve directly.
      if (h.recorder.state === 'inactive') {
        h.recorder.removeEventListener('stop', onStop);
        h.recorder.removeEventListener('error', onError);
        for (const track of h.stream.getTracks()) track.stop();
        resolve(new Blob(h.chunks, { type: h.recorder.mimeType || 'audio/webm' }));
        return;
      }
      h.recorder.stop();
    });
  },

  cancelRecording(handle: RecordingHandle): void {
    const h = handle as InternalHandle;
    if (!h.recorder) return;
    if (h.recorder.state !== 'inactive') {
      try {
        h.recorder.stop();
      } catch {
        // already stopped
      }
    }
    for (const track of h.stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // already stopped
      }
    }
  },

  async playRecordedAudio(blob: Blob): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Audio playback unavailable');
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        URL.revokeObjectURL(url);
      };
      audio.addEventListener('ended', () => {
        cleanup();
        resolve();
      });
      audio.addEventListener('error', (event) => {
        cleanup();
        const err = event as unknown as { error?: { message?: string } };
        reject(new Error(`Playback failed: ${err.error?.message ?? 'unknown error'}`));
      });
      void audio.play();
    });
  },
};
