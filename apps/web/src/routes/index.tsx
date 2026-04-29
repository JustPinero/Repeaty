import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import SignupPage from '@/pages/Signup';
import LoginPage from '@/pages/Login';
import ConfirmEmailPage from '@/pages/ConfirmEmail';
import { RequireAuth } from '@/features/auth';
import { OnboardingGuard } from '@/features/onboarding';
import { Dashboard } from '@/features/dashboard';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/confirm', element: <ConfirmEmailPage /> },
  {
    path: '/app/*',
    element: (
      <RequireAuth>
        <OnboardingGuard>
          <Dashboard />
        </OnboardingGuard>
      </RequireAuth>
    ),
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
