import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Flashcard } from '@/features/decks';
import { useReviewSession, isDeckNotFoundError } from './useReviewSession';
import { RatingButtons } from './RatingButtons';
import type { Rating } from '@repeaty/shared';

export default function ReviewSessionPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const session = useReviewSession(deckId ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function handleRate(rating: Rating) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await session.submitRating(rating);
    } finally {
      setSubmitting(false);
    }
  }

  if (session.isLoading) {
    return (
      <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
        <p className="text-stone-600">Loading session…</p>
      </main>
    );
  }

  if (session.isError) {
    if (isDeckNotFoundError(session.error)) {
      return (
        <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
          <div role="alert" className="rounded-xl border border-stone-200 bg-white shadow-sm p-6 max-w-md text-center">
            <h1 className="text-xl font-semibold">Deck not found</h1>
            <p className="mt-2 text-sm text-stone-600">
              This deck doesn’t exist or isn’t available to you.
            </p>
            <Link to="/app/decks" className="mt-4 inline-block underline">
              Back to your decks
            </Link>
          </div>
        </main>
      );
    }
    return (
      <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 max-w-md">
          <p className="font-medium text-red-800">Couldn’t load this review session</p>
          <p className="mt-1 text-sm text-red-700">{session.error?.message ?? 'Unknown error'}</p>
          <Link to="/app" className="mt-3 inline-block underline text-sm">Back to dashboard</Link>
        </div>
      </main>
    );
  }

  if (session.isComplete) {
    if (session.progress.total === 0) {
      return (
        <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
          <div className="rounded-xl bg-white shadow-sm p-6 text-center max-w-md">
            <h1 className="text-xl font-semibold">Nothing due</h1>
            <p className="mt-2 text-stone-600">This deck is empty — try again later.</p>
            <Link to="/app" className="mt-4 inline-block underline">Back to dashboard</Link>
          </div>
        </main>
      );
    }

    const accuracy =
      session.progress.reviewed > 0
        ? Math.round((session.progress.correct / session.progress.reviewed) * 100)
        : 0;

    return (
      <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
        <div className="rounded-xl bg-white shadow-sm p-8 text-center max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">Session complete</h1>
          <p className="text-stone-700">
            You reviewed {session.progress.reviewed} cards — {session.progress.correct} / {session.progress.reviewed} correct ({accuracy}%).
          </p>
          <Link to="/app" className="mt-2 inline-block underline">Back to dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 bg-peaty-cream p-6">
      <p className="text-sm text-stone-600">
        {session.progress.reviewed} reviewed · {session.progress.remaining} to go
      </p>

      {session.currentCard && (
        <Flashcard
          targetText={session.currentCard.target_text}
          nativeText={session.currentCard.native_text}
          ipa={session.currentCard.ipa}
          exampleTarget={session.currentCard.example_sentence_target ?? undefined}
          exampleNative={session.currentCard.example_sentence_native ?? undefined}
          languageCode={session.currentCard.language_code}
        />
      )}

      <div className="w-full max-w-md">
        <RatingButtons onRate={(r) => void handleRate(r)} disabled={submitting} />
        <p className="mt-2 text-center text-xs text-stone-500">
          Use 1 / 2 / 3 / 4 to rate quickly.
        </p>
      </div>
    </main>
  );
}
