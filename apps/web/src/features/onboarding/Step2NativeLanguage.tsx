import { useState, type FormEvent } from 'react';
import { COMMON_NATIVE_LANGUAGES } from '@repeaty/shared';

type Props = {
  initialValue?: string;
  onNext: (languageCode: string) => void;
  onBack: () => void;
};

export function Step2NativeLanguage({ initialValue = '', onNext, onBack }: Props) {
  const [value, setValue] = useState(initialValue);
  const isValid = value !== '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    onNext(value);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="onboarding-native" className="block text-sm font-medium">
          Native language
        </label>
        <select
          id="onboarding-native"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-peaty-green"
        >
          <option value="">Select your native language…</option>
          {COMMON_NATIVE_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
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
          disabled={!isValid}
          className="flex-1 rounded bg-peaty-green px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </form>
  );
}
