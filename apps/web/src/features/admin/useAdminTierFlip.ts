import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EdgeErrorCode } from '@repeaty/shared';

export type FlipTierInput = {
  targetUserId: string;
  newTier: 'free' | 'pro' | 'admin';
  reason?: string;
};

export type FlipTierError = {
  code: EdgeErrorCode | 'NETWORK';
  message: string;
};

type EdgeBody<T> =
  | { data: T; error: null }
  | { data: null; error: { code: EdgeErrorCode; message: string } };

export function useAdminTierFlip() {
  const qc = useQueryClient();

  return useMutation<{ logId: string }, FlipTierError, FlipTierInput>({
    mutationFn: async ({ targetUserId, newTier, reason }) => {
      const { data, error } = await supabase.functions.invoke<EdgeBody<{ log_id: string }>>(
        'flip-tier',
        {
          body: {
            target_user_id: targetUserId,
            new_tier: newTier,
            reason: reason ?? null,
          },
        },
      );
      if (error) {
        throw { code: 'NETWORK' as const, message: error.message };
      }
      const body = data;
      if (!body || body.error) {
        throw {
          code: (body?.error?.code ?? 'INTERNAL') as EdgeErrorCode,
          message: body?.error?.message ?? 'flip-tier failed',
        };
      }
      return { logId: body.data.log_id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-profiles'] });
    },
  });
}
