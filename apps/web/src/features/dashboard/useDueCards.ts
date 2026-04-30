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

type Internal = {
  totalDue: number;
  totalNew: number;
  topDeck: DueDeck | null;
};

type DeckRow = { id: string; name: string; language_code: string };
type CardRow = { id: string; deck_id: string };
type DueRow = { card_id: string };

export function useDueCards(): DueCardsState {
  const { user } = useAuthUser();
  const userId = user?.id ?? null;

  const { data, isLoading, isError, error } = useQuery<Internal, Error>({
    queryKey: ['due-cards', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Internal> => {
      // 1. All visible decks (RLS scopes to bundled OR owner_id = auth.uid()).
      const decksRes = await supabase
        .from('decks')
        .select('id, name, language_code')
        .is('deleted_at', null);
      if (decksRes.error) throw new Error(decksRes.error.message);
      const decks = (decksRes.data ?? []) as DeckRow[];
      const deckById = new Map(decks.map((d) => [d.id, d]));

      if (decks.length === 0) {
        return { totalDue: 0, totalNew: 0, topDeck: null };
      }

      // 2. All cards under those decks.
      const cardsRes = await supabase
        .from('cards')
        .select('id, deck_id')
        .in('deck_id', decks.map((d) => d.id));
      if (cardsRes.error) throw new Error(cardsRes.error.message);
      const cards = (cardsRes.data ?? []) as CardRow[];

      // 3. Reviews due on or before now (user's own — RLS-enforced).
      const nowIso = new Date().toISOString();
      const dueRes = await supabase
        .from('reviews')
        .select('card_id')
        .eq('user_id', userId!)
        .lte('due_at', nowIso);
      if (dueRes.error) throw new Error(dueRes.error.message);
      const dueCardIds = new Set(((dueRes.data ?? []) as DueRow[]).map((r) => r.card_id));

      // 4. Aggregate per deck. A card is "new" if it has no review row at all
      //    — which we infer by: total cards - cards-with-any-review. We
      //    fetch only the due ones above; for accurate "new" we need the full
      //    review-row card ids too. Single round-trip:
      const reviewedRes = await supabase
        .from('reviews')
        .select('card_id')
        .eq('user_id', userId!);
      if (reviewedRes.error) throw new Error(reviewedRes.error.message);
      const reviewedCardIds = new Set(
        ((reviewedRes.data ?? []) as DueRow[]).map((r) => r.card_id),
      );

      const perDeck = new Map<string, { dueCount: number; newCount: number }>();
      for (const card of cards) {
        const bucket = perDeck.get(card.deck_id) ?? { dueCount: 0, newCount: 0 };
        if (dueCardIds.has(card.id)) bucket.dueCount += 1;
        else if (!reviewedCardIds.has(card.id)) bucket.newCount += 1;
        perDeck.set(card.deck_id, bucket);
      }

      let topDeck: DueDeck | null = null;
      let topScore = -1;
      let totalDue = 0;
      let totalNew = 0;
      for (const [deckId, counts] of perDeck.entries()) {
        totalDue += counts.dueCount;
        totalNew += counts.newCount;
        const score = counts.dueCount + counts.newCount;
        if (score > topScore) {
          const deck = deckById.get(deckId);
          if (deck) {
            topScore = score;
            topDeck = {
              deckId: deck.id,
              deckName: deck.name,
              languageCode: deck.language_code,
              dueCount: counts.dueCount,
              newCount: counts.newCount,
            };
          }
        }
      }

      // If the top deck has 0 of both, it's not really a "top" — null it out
      // so the queue UI shows the empty state instead of a misleading link.
      if (topDeck && topDeck.dueCount === 0 && topDeck.newCount === 0) {
        topDeck = null;
      }

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
