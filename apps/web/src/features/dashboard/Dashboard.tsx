import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Header } from './Header';
import { PeatyGreeting } from './PeatyGreeting';
import { LanguageSelector } from './LanguageSelector';
import { ReviewQueue } from './ReviewQueue';

type DashboardData = {
  displayName: string | null;
  targetLanguageCodes: string[];
};

export default function Dashboard() {
  const { user } = useAuthUser();

  const { data, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<DashboardData> => {
      const [profile, userLangs] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', user!.id).single(),
        supabase.from('user_languages').select('language_code').eq('user_id', user!.id),
      ]);
      if (profile.error) throw new Error(profile.error.message);
      if (userLangs.error) throw new Error(userLangs.error.message);

      return {
        displayName: profile.data.display_name,
        targetLanguageCodes: (userLangs.data ?? []).map((row) => row.language_code),
      };
    },
  });

  return (
    <div className="min-h-full bg-peaty-cream text-stone-800">
      <Header displayName={data?.displayName ?? null} />
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
            <PeatyGreeting displayName={data?.displayName ?? null} />
            {data && data.targetLanguageCodes.length > 1 && (
              <div className="flex justify-center">
                <LanguageSelector targetLanguageCodes={data.targetLanguageCodes} />
              </div>
            )}
            <ReviewQueue />
          </>
        )}
      </main>
    </div>
  );
}
