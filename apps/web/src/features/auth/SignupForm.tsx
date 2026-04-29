import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const signupSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type SignupInput = z.infer<typeof signupSchema>;

export function SignupForm() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema), mode: 'onSubmit' });

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    // Auto-confirmed locally → session present → /app.
    // Prod (confirmations enabled) → no session yet → /auth/confirm interstitial.
    if (data?.session) {
      navigate('/app', { replace: true });
    } else {
      navigate('/auth/confirm', { replace: true });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} aria-label="Sign up" noValidate className="space-y-3">
      <div>
        <label htmlFor="signup-email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? 'true' : 'false'}
          {...register('email')}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-peaty-green"
        />
        {errors.email && (
          <p className="mt-1 text-sm text-red-700">{errors.email.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? 'true' : 'false'}
          {...register('password')}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-peaty-green"
        />
        {errors.password && (
          <p className="mt-1 text-sm text-red-700">{errors.password.message}</p>
        )}
      </div>
      {serverError && (
        <p role="alert" className="text-sm text-red-700">
          {serverError}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded bg-peaty-green px-3 py-2 font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Signing up…' : 'Sign up'}
      </button>
    </form>
  );
}
