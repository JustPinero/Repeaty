/**
 * Active platform adapter. Selected at module load:
 *   - default → web (SpeechSynthesis, MediaRecorder)
 *   - VITE_PLATFORM=capacitor → capacitor.ts (lands when DEBT-002 activates)
 *
 * Feature code imports from `@/platform`, not from the per-platform modules
 * directly. Anything that does the latter is a regression that drift-audit
 * should flag.
 */

import { webPlatform } from './web';
import type { PlatformAdapter } from './types';

const selected = (import.meta.env.VITE_PLATFORM as string | undefined) ?? 'web';

let active: PlatformAdapter;
if (selected === 'web') {
  active = webPlatform;
} else {
  // Future: capacitorPlatform when DEBT-002 activates.
  // eslint-disable-next-line no-console
  console.warn(
    `Unknown VITE_PLATFORM "${selected}", falling back to web adapter`,
  );
  active = webPlatform;
}

export const platform: PlatformAdapter = active;
export type {
  PlatformAdapter,
  PlayTargetTextOptions,
  MicPermission,
  RecordingHandle,
} from './types';
