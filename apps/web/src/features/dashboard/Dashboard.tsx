import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuthUser, useProfile } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Header } from './Header';
import { PeatyGreeting } from './PeatyGreeting';
import { LanguageSelector } from './LanguageSelector';
import { ReviewQueue } from './ReviewQueue';

export default function Dashboard() {
  const { user } = useAuthUser();
  const { profile } = useProfile();
  const isPro = profile?.tier === 'pro' || profile?.tier === 'admin';

  // user_languages is a separate query because it lives in its own table
  // with a per-user fan-out — `useProfile` returns the single profile row,
  // and rolling that lookup into one combined RPC is Phase-6 polish.
  const { data: userLanguages, isError, error, refetch } = useQuery<string[]>({
    queryKey: ['dashboard-user-languages', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_languages')
        .select('language_code')
        .eq('user_id', user!.id);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => row.language_code as string);
    },
  });

  const displayName = profile?.display_name ?? null;

  return (
    <div className="min-h-full bg-peaty-cream text-stone-800">
      <Header displayName={displayName} />
      <main className="mx-auto max-w-2xl space-y-8 p-6">
        {isError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-center"
          >
            <p className="font-medium text-red-800">We couldn’t load your dashboard</p>
            <p className="mt-1 text-sm text-red-700">{(error as Error).message}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded bg-peaty-green px-3 py-1.5 text-sm font-medium text-white"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <PeatyGreeting displayName={displayName} />
            {userLanguages && userLanguages.length > 1 && (
              <div className="flex justify-center">
                <LanguageSelector targetLanguageCodes={userLanguages} />
              </div>
            )}
            <ReviewQueue />
            {isPro && (
              <div className="rounded-xl border border-peaty-green/30 bg-peaty-green/5 p-4 text-center">
                <p className="text-sm font-medium text-peaty-green">Pro feature</p>
                <p className="mt-1 text-sm text-stone-700">
                  Generate a custom lesson tailored to your weak spots.
                </p>
                <Link
                  to="/app/generate"
                  className="mt-3 inline-block rounded bg-peaty-green px-3 py-1.5 text-sm font-medium text-white hover:bg-peaty-green/90"
                >
                  Generate a lesson
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
