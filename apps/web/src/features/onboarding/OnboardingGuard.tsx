// RED-phase stub — always renders children, never the wizard.
// GREEN replaces with profile/user_languages query + branch.
import type { ReactNode } from 'react';

export function OnboardingGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
