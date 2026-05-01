import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, CardContent } from '@/components/ui';
import { FeedbackPanel } from '@/features/feedback';
import { MicCapture } from './MicCapture';
import {
  isDeckNotFoundError,
  isOfflinePronunciationError,
  usePronunciationSession,
} from './usePronunciationSession';

const NATIVE_LANG_PLACEHOLDER = 'en';

const BUCKET_HEADING: Record<string, string> = {
  perfect: 'Perfect — 100',
  close: 'Close',
  miss: 'Not quite',
};

export function PronunciationSessionPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const session = usePronunciationSession(deckId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Reset MicCapture + per-recording error when the card changes.
  useEffect(() => {
    setSubmitting(false);
    setRecordingError(null);
  }, [session.currentCard?.id]);

  async function handleRecorded(blob: Blob) {
    if (submitting) return;
    setSubmitting(true);
    setRecordingError(null);
    try {
      await session.submitRecording(blob);
    } catch (err) {
      const isOffline = isOfflinePronunciationError(err);
      setRecordingError(
        isOffline
          ? 'Pronunciation practice needs a connection. Reconnect and try again.'
          : err instanceof Error
            ? err.message
            : 'Recording failed. Try again.',
      );
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
          <p className="font-medium text-red-800">Couldn’t load this session</p>
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
            <h1 className="text-xl font-semibold">This deck is empty</h1>
            <p className="mt-2 text-sm text-stone-600">
              No cards yet — try a different deck.
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
        <div className="rounded-xl bg-white shadow-sm p-8 text-center max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">Session complete</h1>
          <p className="text-stone-700">
            You spoke {session.progress.reviewed} cards — average score{' '}
            {session.progress.averageScore}/100.
          </p>
          <Link to="/app" className="mt-2 inline-block underline">Back to dashboard</Link>
        </div>
      </main>
    );
  }

  const result = session.pendingResult;

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 bg-peaty-cream p-6">
      <p className="text-sm text-stone-600">
        {session.progress.reviewed} done · {session.progress.remaining} to go
      </p>

      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center space-y-6">
          <p className="text-3xl font-semibold tracking-tight">
            {session.currentCard?.target_text}
          </p>

          {result ? (
            <div className="space-y-3 animate-flip-in">
              <p className="text-lg font-semibold">
                {BUCKET_HEADING[result.bucket]} — {result.score}/100
              </p>
              <p className="text-sm text-stone-600">
                Whisper heard: <strong className="font-medium">{result.transcript || '(silent)'}</strong>
              </p>
              <p className="text-sm text-stone-600">
                Expected: <strong className="font-medium">{session.currentCard?.target_text}</strong>
              </p>
              <FeedbackPanel
                kind="pronunciation"
                bucket={result.bucket}
                targetText={session.currentCard?.target_text ?? ''}
                nativeText=""
                userResponse={result.transcript}
                nativeLanguageCode={NATIVE_LANG_PLACEHOLDER}
                attemptId={result.attemptId}
              />
              {session.currentCard && (
                <Link
                  to={`/app/decks/${deckId}/cards/${session.currentCard.id}`}
                  className="text-xs underline text-stone-500"
                >
                  View card history
                </Link>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <MicCapture
                key={session.currentCard?.id ?? 'no-card'}
                onRecorded={handleRecorded}
                onReset={() => setRecordingError(null)}
              />
              {recordingError && (
                <p
                  role="alert"
                  className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  {recordingError}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Button onClick={() => session.next()} variant="default">
          Next
        </Button>
      )}
    </main>
  );
}
