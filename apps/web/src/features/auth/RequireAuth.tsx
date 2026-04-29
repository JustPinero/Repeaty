// RED-phase stub — renders children unconditionally (no redirect).
// GREEN replaces with proper auth check + redirect.
import type { ReactNode } from 'react';

export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
