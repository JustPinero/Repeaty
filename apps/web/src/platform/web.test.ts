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
