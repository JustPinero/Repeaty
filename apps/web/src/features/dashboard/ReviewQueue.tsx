import { Link } from 'react-router-dom';
import { useDueCards } from './useDueCards';

export function ReviewQueue() {
  const { isLoading, isError, error, totalDue, totalNew, topDeck } = useDueCards();

  if (isLoading) {
    return (
      <section
        data-testid="review-queue"
        className="rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm"
      >
        <p className="text-stone-600">Loading…</p>
      </section>
    );
  }

  if (isError) {
    return (
      <section
        data-testid="review-queue"
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"
      >
        <p className="font-medium text-red-800">We couldn’t load your review queue</p>
        <p className="mt-1 text-sm text-red-700">{error?.message ?? 'Unknown error'}</p>
      </section>
    );
  }

  if (totalDue === 0 && totalNew === 0) {
    return (
      <section
        data-testid="review-queue"
        className="rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm"
      >
        <p className="text-lg font-medium">All caught up — nothing due.</p>
        <p className="mt-1 text-sm text-stone-600">
          New decks ship in Phase 6; AI-generated decks ship in Phase 5.
        </p>
        <Link to="/app/decks" className="mt-3 inline-block text-sm underline">
          Browse decks
        </Link>
      </section>
    );
  }

  return (
    <section
      data-testid="review-queue"
      className="rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm space-y-3"
    >
      <p className="text-2xl font-semibold">
        {totalDue} due · {totalNew} new
      </p>
      {topDeck ? (
        <>
          <p className="text-stone-600">
            Next up: <span className="font-medium">{topDeck.deckName}</span>
          </p>
          <Link
            to={`/app/decks/${topDeck.deckId}/review`}
            className="inline-block rounded bg-peaty-green px-4 py-2 font-medium text-white"
          >
            Start review — {topDeck.deckName}
          </Link>
        </>
      ) : (
        <Link to="/app/decks" className="text-sm underline">
          Browse decks
        </Link>
      )}
    </section>
  );
}
