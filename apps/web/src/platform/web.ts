// RED-phase stub. GREEN replaces with a real SpeechSynthesis-backed impl.
import type { PlatformAdapter, PlayTargetTextOptions } from './types';

export const webPlatform: PlatformAdapter = {
  async playTargetText(_text: string, _options: PlayTargetTextOptions): Promise<void> {
    throw new Error('webPlatform.playTargetText stub — replaced in GREEN');
  },
  cancelSpeech(): void {
    // no-op stub
  },
  canSpeak(): boolean {
    return false;
  },
};
