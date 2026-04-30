import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';

type Attempt = {
  id: string;
  response_ms: number;
  correct: boolean;
  created_at: string;
};

type Props = {
  cardId: string;
  /** Page size; defaults to 20. */
  pageSize?: number;
};

export function CardComprehensionHistory({ cardId, pageSize = 20 }: Props) {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;
  const [limit, setLimit] = useState(pageSize);

  const { data, isLoading, isError, error } = useQuery<Attempt[], Error>({
    queryKey: ['card-comprehension-history', cardId, userId, limit],
    enabled: !!userId && !!cardId,
    queryFn: async () => {
      const res = await supabase
        .from('comprehension_attempts')
        .select('id, response_ms, correct, created_at')
        .eq('user_id', userId!)
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? []) as Attempt[];
    },
  });

  if (isLoading) return <p className="text-sm text-stone-500">Loading history…</p>;

  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Couldn’t load history: {error?.message ?? 'Unknown error'}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No attempts yet — this card hasn’t been answered in a comprehension session.
      </p>
    );
  }

  return (
    <div data-testid="card-comprehension-history" className="space-y-3">
      <ul className="space-y-2">
        {data.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-3 rounded border border-stone-200 bg-white px-3 py-2 text-sm"
          >
            <span
              className={
                a.correct
                  ? 'rounded-full bg-peaty-green/10 px-2 py-0.5 text-xs font-medium text-peaty-green'
                  : 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'
              }
            >
              {a.correct ? 'correct' : 'miss'}
            </span>
            <span className="font-mono tabular-nums text-stone-600">
              {(a.response_ms / 1000).toFixed(1)}s
            </span>
            <time
              dateTime={a.created_at}
              className="text-xs text-stone-500"
              title={a.created_at}
            >
              {new Date(a.created_at).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
      {data.length === limit && (
        <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + pageSize)}>
          Load more
        </Button>
      )}
    </div>
  );
}
