import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, CardContent } from '@/components/ui';
import { useAuthUser, useProfile } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import {
  useGenerateLesson,
  type GenerateLessonError,
} from './useGenerateLesson';

const TOPIC_HINT_MAX = 200;
const MIN_CARDS = 5;
const MAX_CARDS = 25;
const DEFAULT_CARDS = 12;

type UserLanguageRow = { language_code: string; cefr_level: string };

export function GenerateLessonPage() {
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const { profile, isLoading: profileLoading } = useProfile();

  const [languageCode, setLanguageCode] = useState<string>('');
  const [topicHint, setTopicHint] = useState('');
  const [cardCount, setCardCount] = useState(DEFAULT_CARDS);
  const [submitError, setSubmitError] = useState<GenerateLessonError | null>(null);

  const { data: userLanguages, isLoading: langsLoading } = useQuery<UserLanguageRow[]>({
    queryKey: ['user-languages', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_languages')
        .select('language_code, cefr_level')
        .eq('user_id', user!.id);
      if (error) throw new Error(error.message);
      return (data ?? []) as UserLanguageRow[];
    },
  });

  // Default the language to the first one once they've loaded.
  useEffect(() => {
    if (!languageCode && userLanguages && userLanguages.length > 0) {
      setLanguageCode(userLanguages[0]!.language_code);
    }
  }, [languageCode, userLanguages]);

  const generate = useGenerateLesson();

  // Pro gate. While the profile is loading, render nothing rather than flash
  // the form. After it loads, free-tier users see the explainer.
  if (profileLoading) {
    return (
      <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
        <p className="text-stone-600">Loading…</p>
      </main>
    );
  }
  if (!profile) return <Navigate to="/app" replace />;
  const isPro = profile.tier === 'pro' || profile.tier === 'admin';
  if (!isPro) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Generate a lesson</h1>
        <p className="rounded border border-stone-200 bg-white p-4 text-sm text-stone-700">
          Custom AI-generated decks are a Pro feature. Repeaty is in private
          beta — message Justin to get bumped to Pro.
        </p>
        <Link to="/app" className="text-sm underline">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!languageCode || generate.isPending) return;
    setSubmitError(null);
    try {
      const out = await generate.mutateAsync({
        languageCode,
        topicHint: topicHint.trim() || undefined,
        cardCount,
      });
      navigate(`/app/decks/${out.deckId}/review`, { replace: true });
    } catch (err) {
      setSubmitError(err as GenerateLessonError);
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Generate a lesson</h1>
        <Link to="/app" className="text-sm underline">
          ← Back to dashboard
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="gen-lang" className="block text-sm font-medium">
                Target language
              </label>
              <select
                id="gen-lang"
                value={languageCode}
                disabled={langsLoading || generate.isPending}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-peaty-green"
              >
                {(userLanguages ?? []).map((row) => (
                  <option key={row.language_code} value={row.language_code}>
                    {row.language_code.toUpperCase()} · {row.cefr_level}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="gen-topic" className="block text-sm font-medium">
                Topic hint (optional)
              </label>
              <input
                id="gen-topic"
                type="text"
                value={topicHint}
                maxLength={TOPIC_HINT_MAX}
                disabled={generate.isPending}
                onChange={(e) => setTopicHint(e.target.value)}
                placeholder="e.g. food, office life, train station"
                className="w-full rounded border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-peaty-green"
              />
              <p className="text-xs text-stone-500">
                {topicHint.length} / {TOPIC_HINT_MAX}
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="gen-count" className="block text-sm font-medium">
                Card count: <span className="font-mono">{cardCount}</span>
              </label>
              <input
                id="gen-count"
                type="range"
                min={MIN_CARDS}
                max={MAX_CARDS}
                step={1}
                value={cardCount}
                disabled={generate.isPending}
                onChange={(e) => setCardCount(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {submitError && (
              <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {messageFor(submitError)}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm text-stone-500">
                {generate.isPending ? '✨ Peaty is writing your deck…' : 'Average run: 8–12 seconds.'}
              </p>
              <Button type="submit" disabled={!languageCode || generate.isPending}>
                {generate.isPending ? 'Generating…' : 'Generate'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function messageFor(err: GenerateLessonError): string {
  switch (err.code) {
    case 'RATE_LIMITED':
      return 'You\'ve used today\'s lesson generations — try again tomorrow.';
    case 'UPSTREAM_TIMEOUT':
      return 'The AI took too long. Try again in a moment.';
    case 'UPSTREAM_FAILED':
      return 'The AI returned something we couldn\'t parse. Try again or tweak your topic.';
    case 'FORBIDDEN_TIER':
      return 'Lesson generation is a Pro feature.';
    case 'INVALID_PAYLOAD':
      return err.message;
    default:
      return 'Something went wrong — try again.';
  }
}
