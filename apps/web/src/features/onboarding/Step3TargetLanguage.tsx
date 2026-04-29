import { useState, type FormEvent } from 'react';
import {
  CEFR_LEVELS,
  SUPPORTED_TARGET_LANGUAGES,
  isCefrLevel,
  type CefrLevel,
} from '@repeaty/shared';
import type { TargetLanguage } from './useOnboardingState';

type Props = {
  initialTargets?: TargetLanguage[];
  onSubmit: (targets: TargetLanguage[]) => void;
  onBack: () => void;
  isSubmitting?: boolean;
};

export function Step3TargetLanguage({
  initialTargets,
  onSubmit,
  onBack,
  isSubmitting = false,
}: Props) {
  const initial = initialTargets?.[0];
  const [language, setLanguage] = useState<string>(initial?.language_code ?? '');
  const [level, setLevel] = useState<CefrLevel | ''>(initial?.cefr_level ?? '');

  const isValid = language !== '' && isCefrLevel(level);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    onSubmit([{ language_code: language, cefr_level: level as CefrLevel }]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="onboarding-target" className="block text-sm font-medium">
          I want to learn
        </label>
        <select
          id="onboarding-target"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-peaty-green"
        >
          <option value="">Pick a target language…</option>
          {SUPPORTED_TARGET_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label} ({lang.code})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="onboarding-level" className="block text-sm font-medium">
          Your level (CEFR)
        </label>
        <select
          id="onboarding-level"
          value={level}
          onChange={(e) => setLevel(e.target.value as CefrLevel | '')}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-peaty-green"
        >
          <option value="">Pick a level…</option>
          {CEFR_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-stone-300 px-3 py-2 font-medium text-stone-700"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="flex-1 rounded bg-peaty-green px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Finish'}
        </button>
      </div>
    </form>
  );
}
