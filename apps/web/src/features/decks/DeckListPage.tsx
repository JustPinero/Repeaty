import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { DeckListItem } from './DeckListItem';

type DeckRow = {
  id: string;
  name: string;
  language_code: string;
  cefr_level: string;
  source: 'bundled' | 'ai_generated' | 'imported';
  cards: Array<{ count: number }>;
};

export default function DeckListPage() {
  const { user } = useAuthUser();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['decks', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<DeckRow[]> => {
      // RLS scopes the visible decks to: source = 'bundled' OR owner_id = auth.uid().
      // The supabase-js `cards(count)` syntax pulls a count of related rows in one round-trip.
      const result = await supabase
        .from('decks')
        .select('id, name, language_code, cefr_level, source, cards(count)')
        .is('deleted_at', null)
        .order('name', { ascending: true });
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []) as DeckRow[];
    },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Your decks</h1>

      {isLoading && <p className="text-stone-600">Loading…</p>}

      {isError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">We couldn’t load your decks</p>
          <p className="mt-1 text-sm text-red-700">{(error as Error).message}</p>
          <Button onClick={() => void refetch()} className="mt-3" size="sm">
            Retry
          </Button>
        </div>
      )}

      {data && data.length === 0 && !isError && (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-center text-stone-600">
          No decks yet — bundled starter decks land in Phase 2 and AI decks in Phase 5.
        </p>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((deck) => (
            <DeckListItem
              key={deck.id}
              id={deck.id}
              name={deck.name}
              languageCode={deck.language_code}
              cefrLevel={deck.cefr_level}
              cardCount={deck.cards[0]?.count ?? 0}
              source={deck.source}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
