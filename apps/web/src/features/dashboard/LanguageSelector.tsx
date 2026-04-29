import { useEffect } from 'react';
import { SUPPORTED_TARGET_LANGUAGES } from '@repeaty/shared';
import { useActiveLanguage } from './useActiveLanguage';

type Props = {
  targetLanguageCodes: string[];
};

export function LanguageSelector({ targetLanguageCodes }: Props) {
  const { activeLanguageCode, setActiveLanguageCode } = useActiveLanguage();

  // If the active language isn't in the user's target list (or is null), default
  // to the first available code so the select always has a valid value.
  useEffect(() => {
    if (
      activeLanguageCode === null ||
      !targetLanguageCodes.includes(activeLanguageCode)
    ) {
      const first = targetLanguageCodes[0];
      if (first) setActiveLanguageCode(first);
    }
  }, [activeLanguageCode, targetLanguageCodes, setActiveLanguageCode]);

  if (targetLanguageCodes.length <= 1) return null;

  const options = SUPPORTED_TARGET_LANGUAGES.filter((lang) =>
    targetLanguageCodes.includes(lang.code),
  );

  return (
    <div className="inline-flex flex-col">
      <label htmlFor="active-language" className="text-sm font-medium">
        Currently studying
      </label>
      <select
        id="active-language"
        value={activeLanguageCode ?? ''}
        onChange={(e) => setActiveLanguageCode(e.target.value)}
        className="mt-1 rounded border border-stone-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-peaty-green"
      >
        {options.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label} ({lang.code})
          </option>
        ))}
      </select>
    </div>
  );
}
