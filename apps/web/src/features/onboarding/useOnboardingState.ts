import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CefrLevel } from '@repeaty/shared';

export type WizardStep = 1 | 2 | 3;

export type TargetLanguage = {
  language_code: string;
  cefr_level: CefrLevel;
};

export type OnboardingState = {
  step: WizardStep;
  displayName: string;
  nativeLanguageCode: string;
  targets: TargetLanguage[];

  setStep: (step: WizardStep) => void;
  setDisplayName: (name: string) => void;
  setNativeLanguageCode: (code: string) => void;
  setTargets: (targets: TargetLanguage[]) => void;
  reset: () => void;
};

const initialState = {
  step: 1 as WizardStep,
  displayName: '',
  nativeLanguageCode: '',
  targets: [] as TargetLanguage[],
};

export const useOnboardingState = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialState,
      setStep: (step) => set({ step }),
      setDisplayName: (displayName) => set({ displayName }),
      setNativeLanguageCode: (nativeLanguageCode) => set({ nativeLanguageCode }),
      setTargets: (targets) => set({ targets }),
      reset: () => set(initialState),
    }),
    {
      name: 'repeaty:onboarding',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
