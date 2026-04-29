import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type Props = {
  displayName: string | null;
};

export function Header({ displayName }: Props) {
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex items-center justify-between border-b border-stone-200 bg-white/70 px-4 py-3">
      <h1 className="text-lg font-semibold tracking-tight">Repeaty</h1>
      <div className="flex items-center gap-3">
        <span aria-label="Signed in as" className="text-sm text-stone-600">
          {displayName ?? 'You'}
        </span>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="rounded border border-stone-300 px-3 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
