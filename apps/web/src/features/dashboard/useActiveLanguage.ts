import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ActiveLanguageState = {
  /** BCP-47 code of the language the user is currently studying. Null = no choice yet. */
  activeLanguageCode: string | null;
  setActiveLanguageCode: (code: string | null) => void;
};

export const useActiveLanguage = create<ActiveLanguageState>()(
  persist(
    (set) => ({
      activeLanguageCode: null,
      setActiveLanguageCode: (code) => set({ activeLanguageCode: code }),
    }),
    {
      name: 'repeaty:active-language',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
