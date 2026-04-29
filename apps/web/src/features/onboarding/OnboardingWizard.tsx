import { useNavigate } from 'react-router-dom';
import { Step1Name } from './Step1Name';
import { Step2NativeLanguage } from './Step2NativeLanguage';
import { Step3TargetLanguage } from './Step3TargetLanguage';
import { useCompleteOnboarding } from './useCompleteOnboarding';
import { useOnboardingState, type TargetLanguage } from './useOnboardingState';

export function OnboardingWizard() {
  const navigate = useNavigate();
  const {
    step,
    displayName,
    nativeLanguageCode,
    targets,
    setStep,
    setDisplayName,
    setNativeLanguageCode,
    setTargets,
    reset,
  } = useOnboardingState();
  const { mutateAsync, isPending, error } = useCompleteOnboarding();

  async function handleSubmit(finalTargets: TargetLanguage[]) {
    setTargets(finalTargets);
    await mutateAsync({
      displayName,
      nativeLanguageCode,
      targets: finalTargets,
    });
    reset();
    navigate('/app', { replace: true });
  }

  return (
    <main className="min-h-full bg-peaty-cream text-stone-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl bg-white shadow-md p-6">
        <h1 className="text-xl font-semibold mb-1">Welcome to Repeaty</h1>
        <p className="text-sm text-stone-600 mb-4">Step {step} of 3</p>
        {step === 1 && (
          <Step1Name
            initialValue={displayName}
            onNext={(name) => {
              setDisplayName(name);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <Step2NativeLanguage
            initialValue={nativeLanguageCode}
            onNext={(code) => {
              setNativeLanguageCode(code);
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3TargetLanguage
            initialTargets={targets}
            isSubmitting={isPending}
            onSubmit={handleSubmit}
            onBack={() => setStep(2)}
          />
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error.message}
          </p>
        )}
      </div>
    </main>
  );
}
