import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';

export type DueDeck = {
  deckId: string;
  deckName: string;
  languageCode: string;
  dueCount: number;
  newCount: number;
};

export type DueCardsState = {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  totalDue: number;
  totalNew: number;
  topDeck: DueDeck | null;
};

type RpcRow = {
  deck_id: string;
  deck_name: string;
  language_code: string;
  due_count: number;
  new_count: number;
};

type Internal = {
  totalDue: number;
  totalNew: number;
  topDeck: DueDeck | null;
};

export function useDueCards(): DueCardsState {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;

  const { data, isLoading, isError, error } = useQuery<Internal, Error>({
    queryKey: ['due-cards', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Internal> => {
      // Single round-trip: see supabase/migrations/0010_due_cards_summary.sql.
      // Server-side ordered by (due+new) desc, deck_name asc — the first row is
      // always the top deck for this user.
      const { data, error } = await supabase.rpc('due_cards_summary');
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as RpcRow[];

      let totalDue = 0;
      let totalNew = 0;
      for (const r of rows) {
        totalDue += r.due_count;
        totalNew += r.new_count;
      }

      const topRow = rows[0];
      const topDeck: DueDeck | null = topRow
        ? {
            deckId: topRow.deck_id,
            deckName: topRow.deck_name,
            languageCode: topRow.language_code,
            dueCount: topRow.due_count,
            newCount: topRow.new_count,
          }
        : null;

      return { totalDue, totalNew, topDeck };
    },
  });

  return {
    isLoading,
    isError,
    error: (error as Error | null) ?? null,
    totalDue: data?.totalDue ?? 0,
    totalNew: data?.totalNew ?? 0,
    topDeck: data?.topDeck ?? null,
  };
}
