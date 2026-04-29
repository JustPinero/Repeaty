import { useState, type FormEvent } from 'react';

type Props = {
  initialValue?: string;
  onNext: (displayName: string) => void;
};

export function Step1Name({ initialValue = '', onNext }: Props) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const isValid = trimmed.length > 0;
  const showError = touched && !isValid;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValid) return;
    onNext(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div>
        <label htmlFor="onboarding-name" className="block text-sm font-medium">
          What should we call you?
        </label>
        <input
          id="onboarding-name"
          type="text"
          autoComplete="given-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showError ? 'true' : 'false'}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-peaty-green"
        />
        {showError && (
          <p className="mt-1 text-sm text-red-700">Please enter your name.</p>
        )}
      </div>
      <button
        type="submit"
        disabled={!isValid}
        className="w-full rounded bg-peaty-green px-3 py-2 font-medium text-white disabled:opacity-50"
      >
        Next
      </button>
    </form>
  );
}
