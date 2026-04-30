import type { PlatformAdapter, PlayTargetTextOptions } from './types';

function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { speechSynthesis?: SpeechSynthesis };
  return w.speechSynthesis ?? null;
}

function getUtteranceCtor():
  | (new (text: string) => SpeechSynthesisUtterance)
  | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechSynthesisUtterance?: new (text: string) => SpeechSynthesisUtterance };
  return w.SpeechSynthesisUtterance ?? null;
}

export const webPlatform: PlatformAdapter = {
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
    const synth = getSynth();
    synth?.cancel();
  },
  canSpeak(): boolean {
    return getSynth() !== null && getUtteranceCtor() !== null;
  },
};
