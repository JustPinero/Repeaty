import { useAuthUser } from '@/features/auth';
import { supabase } from '@/lib/supabase';

export default function AppPlaceholderPage() {
  const { user } = useAuthUser();
  return (
    <main className="min-h-full bg-peaty-cream text-stone-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl bg-white shadow-md p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Welcome{user?.email ? `, ${user.email}` : ''}.</h1>
        <p className="text-stone-600">
          The dashboard lands in Request 1.5 (Peaty greeting + review queue).
          Onboarding lands in 1.4.
        </p>
        <button
          type="button"
          className="mt-4 underline text-sm text-stone-700"
          onClick={() => void supabase.auth.signOut()}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
