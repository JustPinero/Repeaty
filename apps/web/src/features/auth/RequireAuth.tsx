import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthUser } from './useAuthUser';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuthUser();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
