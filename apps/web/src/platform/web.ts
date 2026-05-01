import type {
  MicPermission,
  PlatformAdapter,
  PlayTargetTextOptions,
  RecordingHandle,
} from './types';
import { supabase } from '@/lib/supabase';

// ── Pro-tier ja/zh TTS via the tts-jazh Edge Function (DEBT-003 active) ────

/** Cache key for the Pro TTS path. Same text+lang reused across review +
 * comprehension + pronunciation sessions hits the cache. */
function ttsCacheKey(text: string, lang: string): string {
  return `${lang}|${text}`;
}

/** LRU-bounded so a long study session can't grow the cache without bound.
 * 64 entries × ~25 KB-per-clip ≈ 1.6 MB worst case. Repeats inside a deck
 * still cache-hit; older entries fall out as new clips land. */
const TTS_CACHE_MAX = 64;
const ttsBlobCache = new Map<string, Blob>();
function ttsCacheGet(key: string): Blob | undefined {
  const v = ttsBlobCache.get(key);
  if (v !== undefined) {
    // Touch — move to most-recent by re-inserting.
    ttsBlobCache.delete(key);
    ttsBlobCache.set(key, v);
  }
  return v;
}
function ttsCacheSet(key: string, blob: Blob): void {
  if (ttsBlobCache.has(key)) ttsBlobCache.delete(key);
  ttsBlobCache.set(key, blob);
  while (ttsBlobCache.size > TTS_CACHE_MAX) {
    const oldest = ttsBlobCache.keys().next().value;
    if (oldest === undefined) break;
    ttsBlobCache.delete(oldest);
  }
}

function shouldUseProTts(lang: string): boolean {
  const prefix = lang.toLowerCase().split('-')[0];
  return prefix === 'ja' || prefix === 'zh';
}

async function fetchProTts(text: string, lang: string, signal: AbortSignal): Promise<Blob | null> {
  const key = ttsCacheKey(text, lang);
  const cached = ttsCacheGet(key);
  if (cached) return cached;

  // supabase-js's `functions.invoke` returns text/json by default; for binary
  // we fetch the URL directly with the auth header.
  const sessionRes = await supabase.auth.getSession();
  const accessToken = sessionRes.data.session?.access_token;
  if (!accessToken) return null;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts-jazh`;
  const lang2 = lang.toLowerCase().split('-')[0]!;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ text, lang: lang2 }),
      signal,
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    // 403 (free tier), 429 (rate-limited), 5xx, etc. — fall back to
    // SpeechSynthesis silently. The caller renders the same audio path
    // regardless.
    return null;
  }
  const blob = await response.blob();
  ttsCacheSet(key, blob);
  return blob;
}

async function playBlobThroughAudio(blob: Blob): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Audio playback unavailable');
  }
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => URL.revokeObjectURL(url);
    audio.addEventListener('ended', () => {
      cleanup();
      resolve();
    });
    audio.addEventListener('error', () => {
      cleanup();
      reject(new Error('TTS playback failed'));
    });
    audio.play().catch((err: unknown) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

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
    // Pro-tier ja/zh: try the Edge-Function-backed OpenAI TTS first. On any
    // failure (free tier → 403, rate-limited → 429, transport, parse) fall
    // through to SpeechSynthesis silently — the caller doesn't need to
    // distinguish.
    if (shouldUseProTts(options.lang)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const blob = await fetchProTts(text, options.lang, controller.signal);
        if (blob) {
          await playBlobThroughAudio(blob);
          return;
        }
      } finally {
        clearTimeout(timer);
      }
    }

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
      // play() rejects (without firing 'error') in three real cases: iOS
      // Safari outside a user gesture (NotAllowedError), autoplay-policy
      // block, codec mismatch. Without a catch the outer Promise hangs and
      // MicCapture's `playbackInFlight` stays true. URL.revokeObjectURL is
      // idempotent so racing with a later 'error' is safe.
      audio.play().catch((err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  },
};
