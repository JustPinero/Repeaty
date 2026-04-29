import { Link } from 'react-router-dom';
import { LoginForm } from '@/features/auth';

export default function LoginPage() {
  return (
    <main className="min-h-full bg-peaty-cream text-stone-800 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-md p-6">
        <h1 className="text-2xl font-semibold mb-1">Welcome back</h1>
        <p className="text-sm text-stone-600 mb-4">Repeat after Peaty.</p>
        <LoginForm />
        <p className="mt-4 text-sm text-stone-600">
          New here? <Link to="/signup" className="underline">Create an account</Link>.
        </p>
      </div>
    </main>
  );
}
