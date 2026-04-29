import { Link } from 'react-router-dom';
import { SignupForm } from '@/features/auth';

export default function SignupPage() {
  return (
    <main className="min-h-full bg-peaty-cream text-stone-800 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-md p-6">
        <h1 className="text-2xl font-semibold mb-1">Create your Repeaty account</h1>
        <p className="text-sm text-stone-600 mb-4">Repeat after Peaty.</p>
        <SignupForm />
        <p className="mt-4 text-sm text-stone-600">
          Have an account? <Link to="/login" className="underline">Log in</Link>.
        </p>
      </div>
    </main>
  );
}
