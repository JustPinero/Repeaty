import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type Status = 'verifying' | 'success' | 'error';

const VERIFY_GRACE_MS = 1500;

export default function ConfirmEmailPage() {
  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    function resolveSuccess() {
      if (cancelled) return;
      setStatus('success');
      navigate('/app', { replace: true });
    }

    // 1. Check the cached session synchronously-ish (from localStorage).
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setStatus('error');
        setErrorMsg(error.message);
        return;
      }
      if (data.session) resolveSuccess();
    });

    // 2. Subscribe so URL-hash-driven sign-ins also resolve us. Supabase's
    //    detectSessionInUrl runs on its own schedule; this is the
    //    deterministic path.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) resolveSuccess();
    });

    // 3. Grace-period timeout: if no session has materialized, surface an
    //    actionable error rather than spinning forever.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (!data.session) {
          setStatus('error');
          setErrorMsg('No active session found. Try signing in.');
        }
      });
    }, VERIFY_GRACE_MS);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <main className="min-h-full bg-peaty-cream text-stone-800 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl bg-white shadow-md p-6 text-center">
        <h1 className="text-2xl font-semibold mb-2">Confirming your email</h1>
        {status === 'verifying' && <p className="text-stone-600">One moment…</p>}
        {status === 'success' && <p className="text-stone-600">Redirecting…</p>}
        {status === 'error' && (
          <>
            <p role="alert" className="text-red-700 mb-3">{errorMsg}</p>
            <Link to="/login" className="underline">Back to login</Link>
          </>
        )}
      </div>
    </main>
  );
}
