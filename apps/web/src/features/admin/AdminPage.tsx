import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button, Card, CardContent } from '@/components/ui';
import { useProfile } from '@/features/auth';
import { useAdminTierFlip } from './useAdminTierFlip';

type AdminProfileRow = {
  id: string;
  display_name: string | null;
  email: string;
  tier: 'free' | 'pro' | 'admin';
  is_admin: boolean;
  created_at: string;
};

const TIER_CYCLE: Record<AdminProfileRow['tier'], AdminProfileRow['tier']> = {
  free: 'pro',
  pro: 'admin',
  admin: 'free',
};

export function AdminPage() {
  const { profile: caller } = useProfile();
  const [flashError, setFlashError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<AdminProfileRow[], Error>({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      // Direct `from('profiles')` returns only the caller's own row under
      // the SELECT-own RLS policy. The SECURITY DEFINER RPC checks
      // `is_admin = true` explicitly and bypasses the policy with an
      // audit trail (see migration 0018).
      const { data, error } = await supabase.rpc('list_admin_profiles', {
        p_limit: 50,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminProfileRow[];
    },
  });

  const flip = useAdminTierFlip();

  async function handleFlip(row: AdminProfileRow) {
    if (!caller) return;
    if (row.id === caller.id) return; // disabled in UI; guard anyway
    setFlashError(null);
    try {
      await flip.mutateAsync({
        targetUserId: row.id,
        newTier: TIER_CYCLE[row.tier],
        reason: 'admin cycle',
      });
    } catch (err) {
      const e = err as { message?: string };
      setFlashError(e.message ?? 'flip failed');
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <Link to="/app" className="text-sm underline">
          ← Back to dashboard
        </Link>
      </div>

      {flashError && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {flashError}
        </div>
      )}

      {isLoading && <p className="text-stone-600">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-red-700">
          {error?.message ?? 'Failed to load profiles'}
        </p>
      )}

      {data && (
        <ul className="space-y-3">
          {data.map((row) => {
            const isSelf = caller?.id === row.id;
            return (
              <li key={row.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {row.display_name ?? '(no name)'}
                      </p>
                      <p className="text-sm text-stone-500 truncate">{row.email}</p>
                    </div>
                    <span
                      aria-label="Tier"
                      className="rounded-full bg-peaty-green/10 px-2 py-0.5 text-xs font-medium text-peaty-green"
                    >
                      {row.tier}
                      {row.is_admin ? ' · admin' : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSelf || flip.isPending}
                      onClick={() => void handleFlip(row)}
                      aria-label={`Cycle tier for ${row.email}`}
                    >
                      → {TIER_CYCLE[row.tier]}
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
