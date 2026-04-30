import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, CardContent } from '@/components/ui';
import {
  isDeckNotFoundError,
  useComprehensionSession,
} from './useComprehensionSession';
import { Timer } from './Timer';

const BUCKET_HEADING: Record<string, string> = {
  perfect: 'Perfect — 100',
  close: 'Close',
  miss: 'Not quite',
};

export default function ComprehensionSessionPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const session = useComprehensionSession(deckId ?? '');
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cardStartedAt, setCardStartedAt] = useState<number>(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset response + timer when the current card changes.
  useEffect(() => {
    setResponse('');
    setCardStartedAt(Date.now());
    inputRef.current?.focus();
  }, [session.currentCard?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !response.trim()) return;
    setSubmitting(true);
    try {
      await session.submitResponse(response.trim());
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    session.next();
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
    return (
      <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
        <div className="rounded-xl bg-white shadow-sm p-8 text-center max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">Session complete</h1>
          <p className="text-stone-700">
            You answered {session.progress.reviewed} cards — average score {session.progress.averageScore}/100, average response {(session.progress.averageResponseMs / 1000).toFixed(1)}s.
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
        {session.progress.reviewed} answered · {session.progress.remaining} to go
      </p>

      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center space-y-6">
          <p className="text-3xl font-semibold tracking-tight">
            {session.currentCard?.target_text}
          </p>

          {result ? (
            <div className="space-y-2 animate-flip-in">
              <p className="text-lg font-semibold">
                {BUCKET_HEADING[result.bucket]} — {result.score}/100
              </p>
              <p className="text-sm text-stone-600">
                You said: <strong className="font-medium">{result.response || '(empty)'}</strong>
              </p>
              <p className="text-sm text-stone-600">
                Correct answer: <strong className="font-medium">{session.currentCard?.native_text}</strong>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="w-full space-y-3">
              <label htmlFor="comp-response" className="block text-sm font-medium text-left">
                Type your answer
              </label>
              <input
                ref={inputRef}
                id="comp-response"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-peaty-green"
              />
              <div className="flex items-center justify-between">
                <Timer startedAt={cardStartedAt} paused={submitting} />
                <Button
                  type="submit"
                  disabled={submitting || !response.trim()}
                >
                  Submit
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {result && (
        <Button onClick={handleNext} variant="default">
          Next
        </Button>
      )}
    </main>
  );
}
