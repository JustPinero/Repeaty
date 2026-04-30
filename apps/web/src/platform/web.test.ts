import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { webPlatform } from './web';

describe('webPlatform.playTargetText', () => {
  let originalSpeechSynthesis: SpeechSynthesis | undefined;
  let originalUtterance: typeof SpeechSynthesisUtterance | undefined;
  let speakCalls: SpeechSynthesisUtterance[] = [];
  let cancelCount = 0;

  beforeEach(() => {
    speakCalls = [];
    cancelCount = 0;
    originalSpeechSynthesis = window.speechSynthesis;
    originalUtterance = window.SpeechSynthesisUtterance;

    // Minimal mock SpeechSynthesisUtterance.
    class MockUtterance {
      text: string;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
      MockUtterance;

    // Minimal mock speechSynthesis.
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
      speak(u: SpeechSynthesisUtterance & { onend?: (() => void) | null }) {
        speakCalls.push(u);
        // Resolve on next microtask.
        queueMicrotask(() => {
          u.onend?.();
        });
      },
      cancel() {
        cancelCount += 1;
      },
      getVoices() {
        return [];
      },
      speaking: false,
      paused: false,
      pending: false,
    };
  });

  afterEach(() => {
    if (originalSpeechSynthesis !== undefined) {
      (window as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis =
        originalSpeechSynthesis;
    }
    if (originalUtterance !== undefined) {
      (window as unknown as { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance })
        .SpeechSynthesisUtterance = originalUtterance;
    }
  });

  it('canSpeak returns true when speechSynthesis is available', () => {
    expect(webPlatform.canSpeak()).toBe(true);
  });

  it('passes the text and language to a SpeechSynthesisUtterance', async () => {
    await webPlatform.playTargetText('hola', { lang: 'es' });
    expect(speakCalls).toHaveLength(1);
    expect(speakCalls[0]?.text).toBe('hola');
    expect(speakCalls[0]?.lang).toBe('es');
  });

  it('applies the rate option when provided', async () => {
    await webPlatform.playTargetText('konnichiwa', { lang: 'ja', rate: 0.7 });
    expect(speakCalls[0]?.rate).toBe(0.7);
  });

  it('resolves once the utterance finishes (onend fires)', async () => {
    const start = Date.now();
    await webPlatform.playTargetText('bonjour', { lang: 'fr' });
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('rejects when SpeechSynthesisUtterance fires onerror', async () => {
    const errorSynth = {
      speak(u: SpeechSynthesisUtterance) {
        queueMicrotask(() => {
          const onerror = (u as { onerror?: (e: unknown) => void }).onerror;
          onerror?.({ error: 'synthesis-failed' });
        });
      },
      cancel: () => undefined,
    };
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = errorSynth;
    await expect(webPlatform.playTargetText('x', { lang: 'es' })).rejects.toThrow();
  });

  it('cancelSpeech invokes speechSynthesis.cancel()', () => {
    webPlatform.cancelSpeech();
    expect(cancelCount).toBe(1);
  });
});

describe('webPlatform.canSpeak (no SpeechSynthesis)', () => {
  let original: SpeechSynthesis | undefined;

  beforeEach(() => {
    original = window.speechSynthesis;
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = undefined;
  });

  afterEach(() => {
    if (original !== undefined) {
      (window as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis = original;
    }
  });

  it('returns false when speechSynthesis is missing', () => {
    expect(webPlatform.canSpeak()).toBe(false);
  });
});

// ── Mic capture (Phase 4.1) ─────────────────────────────────────────────────

type MockListener = (e: unknown) => void;

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  private listeners = new Map<string, MockListener[]>();

  static isTypeSupported(_t: string) {
    return true;
  }

  constructor(_stream: MediaStream, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm';
  }

  addEventListener(type: string, fn: MockListener) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: MockListener) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((l) => l !== fn));
  }
  emit(type: string, payload?: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(payload as unknown);
  }
  start() {
    this.state = 'recording';
    queueMicrotask(() => this.emit('start'));
  }
  stop() {
    this.state = 'inactive';
    // Push a chunk + emit stop on next tick.
    queueMicrotask(() => {
      this.emit('dataavailable', { data: new Blob(['chunk'], { type: this.mimeType }), size: 5 });
      this.emit('stop');
    });
  }
}

function makeMockStream() {
  const tracks: Array<{ stop: () => void; stopped: boolean }> = [
    { stop() { this.stopped = true; }, stopped: false },
    { stop() { this.stopped = true; }, stopped: false },
  ];
  return {
    getTracks: () => tracks as unknown as MediaStreamTrack[],
    _tracks: tracks,
  } as unknown as MediaStream & { _tracks: typeof tracks };
}

describe('webPlatform mic capture', () => {
  let originalMediaDevices: MediaDevices | undefined;
  let originalMediaRecorder: typeof MediaRecorder | undefined;
  let originalPermissions: Permissions | undefined;
  let getUserMediaCalls = 0;
  let lastStream: ReturnType<typeof makeMockStream>;

  beforeEach(() => {
    getUserMediaCalls = 0;
    originalMediaDevices = navigator.mediaDevices;
    originalMediaRecorder = window.MediaRecorder;
    originalPermissions = (navigator as unknown as { permissions?: Permissions }).permissions;

    lastStream = makeMockStream();
    (navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return lastStream;
      },
    };
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = MockMediaRecorder;
  });

  afterEach(() => {
    if (originalMediaDevices !== undefined) {
      (navigator as unknown as { mediaDevices: MediaDevices }).mediaDevices = originalMediaDevices;
    }
    if (originalMediaRecorder !== undefined) {
      (window as unknown as { MediaRecorder: typeof MediaRecorder }).MediaRecorder = originalMediaRecorder;
    }
    if (originalPermissions !== undefined) {
      (navigator as unknown as { permissions: Permissions }).permissions = originalPermissions;
    } else {
      delete (navigator as unknown as { permissions?: Permissions }).permissions;
    }
  });

  it('canRecord returns true when getUserMedia + MediaRecorder are available', () => {
    expect(webPlatform.canRecord()).toBe(true);
  });

  it('canRecord returns false when MediaRecorder is missing', () => {
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = undefined;
    expect(webPlatform.canRecord()).toBe(false);
  });

  it('requestMicPermission returns "prompt" when the Permissions API is absent', async () => {
    delete (navigator as unknown as { permissions?: Permissions }).permissions;
    expect(await webPlatform.requestMicPermission()).toBe('prompt');
  });

  it('requestMicPermission propagates the Permissions API state', async () => {
    (navigator as unknown as { permissions: { query: (a: unknown) => Promise<{ state: string }> } }).permissions = {
      query: async () => ({ state: 'granted' }),
    };
    expect(await webPlatform.requestMicPermission()).toBe('granted');
  });

  it('startRecording calls getUserMedia and resolves a handle once the recorder starts', async () => {
    const handle = await webPlatform.startRecording();
    expect(getUserMediaCalls).toBe(1);
    expect(handle).toBeDefined();
  });

  it('stopRecording assembles a Blob from the recorder chunks and stops the stream tracks', async () => {
    const handle = await webPlatform.startRecording();
    const blob = await webPlatform.stopRecording(handle);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    for (const track of lastStream._tracks) {
      expect(track.stopped).toBe(true);
    }
  });

  it('cancelRecording stops the stream without resolving a Blob', async () => {
    const handle = await webPlatform.startRecording();
    webPlatform.cancelRecording(handle);
    for (const track of lastStream._tracks) {
      expect(track.stopped).toBe(true);
    }
  });
});
