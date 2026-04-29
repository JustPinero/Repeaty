// RED-phase stub — empty form. GREEN replaces with target + CEFR selects.
import type { TargetLanguage } from './useOnboardingState';

type Props = {
  initialTargets?: TargetLanguage[];
  onSubmit: (targets: TargetLanguage[]) => void;
  onBack: () => void;
  isSubmitting?: boolean;
};

export function Step3TargetLanguage(_props: Props) {
  return <form aria-label="Step 3: pick a target language"><p>placeholder</p></form>;
}
