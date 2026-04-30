import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui';
import { CardComprehensionHistory } from '@/features/comprehension/CardComprehensionHistory';

type CardRow = {
  id: string;
  target_text: string;
  native_text: string;
  ipa: string | null;
  example_sentence_target: string | null;
  example_sentence_native: string | null;
  language_code: string;
};

export default function CardDetailPage() {
  const { deckId, cardId } = useParams<{ deckId: string; cardId: string }>();
  const { user } = useAuthUser();

  const { data: card, isLoading, isError, error } = useQuery<CardRow | null, Error>({
    queryKey: ['card-detail', cardId, user?.id],
    enabled: !!user?.id && !!cardId,
    queryFn: async () => {
      const res = await supabase
        .from('cards')
        .select('id, target_text, native_text, ipa, example_sentence_target, example_sentence_native, language_code')
        .eq('id', cardId!)
        .maybeSingle();
      if (res.error) throw new Error(res.error.message);
      return (res.data ?? null) as CardRow | null;
    },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <p className="text-sm">
        <Link to={`/app/decks/${deckId}`} className="underline">
          ← Back to deck
        </Link>
      </p>

      {isLoading && <p className="text-stone-600">Loading…</p>}

      {isError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">Couldn’t load this card</p>
          <p className="mt-1 text-sm text-red-700">{error?.message ?? 'Unknown error'}</p>
        </div>
      )}

      {!isLoading && !isError && !card && (
        <div role="alert" className="rounded-xl border border-stone-200 bg-white p-6 text-center">
          <p className="font-medium">Card not found</p>
        </div>
      )}

      {card && (
        <>
          <Card>
            <CardContent className="p-6 space-y-2">
              <h1 className="text-2xl font-semibold">{card.target_text}</h1>
              <p className="text-stone-700">{card.native_text}</p>
              {card.ipa && <p className="text-sm italic text-stone-500">/{card.ipa}/</p>}
              {card.example_sentence_target && (
                <p className="mt-3 text-sm italic text-stone-600">
                  {card.example_sentence_target}
                </p>
              )}
              {card.example_sentence_native && (
                <p className="text-sm text-stone-500">{card.example_sentence_native}</p>
              )}
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Comprehension history</h2>
            <CardComprehensionHistory cardId={card.id} />
          </section>
        </>
      )}
    </main>
  );
}
