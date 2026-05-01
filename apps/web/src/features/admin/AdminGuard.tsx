import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useProfile } from '@/features/auth';

type Props = { children: ReactNode };

export function AdminGuard({ children }: Props) {
  const { profile, isLoading } = useProfile();

  if (isLoading) {
    return (
      <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
        <p className="text-stone-600">Checking…</p>
      </main>
    );
  }

  if (!profile?.is_admin) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
