import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

type Status = 'idle' | 'verifying' | 'success' | 'error';

export default function ConfirmEmailPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function run() {
      // Supabase Auth handles email-confirmation tokens client-side via
      // detectSessionInUrl. After landing on /auth/confirm with the magic
      // hash/query, the SDK consumes it and a SIGNED_IN event fires.
      // We just check whether a session exists once the URL is processed.
      setStatus('verifying');
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error) {
        setStatus('error');
        setErrorMsg(error.message);
        return;
      }
      if (data.user) {
        setStatus('success');
        navigate('/app', { replace: true });
      } else {
        setStatus('error');
        setErrorMsg('No active session found. Try signing in.');
      }
    }
    void run();
    return () => {
      cancelled = true;
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
