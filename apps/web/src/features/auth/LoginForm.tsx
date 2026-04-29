import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginInput = z.infer<typeof loginSchema>;

export function LoginForm() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), mode: 'onSubmit' });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    navigate('/app', { replace: true });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} aria-label="Log in" noValidate className="space-y-3">
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="login-email"
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
        <label htmlFor="login-password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
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
        {isSubmitting ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
