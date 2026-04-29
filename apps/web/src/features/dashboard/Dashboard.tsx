import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Header } from './Header';
import { PeatyGreeting } from './PeatyGreeting';
import { LanguageSelector } from './LanguageSelector';
import { ReviewQueuePlaceholder } from './ReviewQueuePlaceholder';

type DashboardData = {
  displayName: string | null;
  targetLanguageCodes: string[];
};

export default function Dashboard() {
  const { user } = useAuthUser();

  const { data } = useQuery({
    queryKey: ['dashboard', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<DashboardData> => {
      const profile = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user!.id)
        .single();
      if (profile.error) throw new Error(profile.error.message);

      const userLangs = await supabase
        .from('user_languages')
        .select('language_code')
        .eq('user_id', user!.id);
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
        <PeatyGreeting displayName={data?.displayName ?? null} />
        {data && data.targetLanguageCodes.length > 1 && (
          <div className="flex justify-center">
            <LanguageSelector targetLanguageCodes={data.targetLanguageCodes} />
          </div>
        )}
        <ReviewQueuePlaceholder />
      </main>
    </div>
  );
}
