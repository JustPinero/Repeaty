import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import SignupPage from '@/pages/Signup';
import LoginPage from '@/pages/Login';
import ConfirmEmailPage from '@/pages/ConfirmEmail';
import { RequireAuth } from '@/features/auth';
import { OnboardingGuard } from '@/features/onboarding';
import { Dashboard } from '@/features/dashboard';
import { DeckListPage } from '@/features/decks';
import { ReviewSessionPage } from '@/features/review';
import { ComprehensionSessionPage } from '@/features/comprehension';
import { PronunciationSessionPage } from '@/features/pronunciation';
import { AdminGuard } from '@/features/admin';
import CardDetailPage from '@/pages/CardDetail';

// Lazy-load Pro-only routes — keep them out of the main bundle. The
// Pro CTA on the dashboard hides them from free-tier users entirely; only
// admins (small set) and Pro users (Phase-5 beta = Ben + future signups)
// pay the dynamic-import cost on first hit.
const AdminPage = lazy(() =>
  import('@/features/admin').then((m) => ({ default: m.AdminPage })),
);
const GenerateLessonPage = lazy(() =>
  import('@/features/generate').then((m) => ({ default: m.GenerateLessonPage })),
);

function LazyFallback() {
  return (
    <main className="flex min-h-full items-center justify-center bg-peaty-cream p-6">
      <p className="text-stone-600">Loading…</p>
    </main>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/confirm', element: <ConfirmEmailPage /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <OnboardingGuard>
          <Outlet />
        </OnboardingGuard>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'decks', element: <DeckListPage /> },
      { path: 'decks/:deckId/review', element: <ReviewSessionPage /> },
      { path: 'decks/:deckId/comprehension', element: <ComprehensionSessionPage /> },
      { path: 'decks/:deckId/pronunciation', element: <PronunciationSessionPage /> },
      { path: 'decks/:deckId/cards/:cardId', element: <CardDetailPage /> },
      {
        path: 'admin',
        element: (
          <AdminGuard>
            <Suspense fallback={<LazyFallback />}>
              <AdminPage />
            </Suspense>
          </AdminGuard>
        ),
      },
      {
        path: 'generate',
        element: (
          <Suspense fallback={<LazyFallback />}>
            <GenerateLessonPage />
          </Suspense>
        ),
      },
      { path: '*', element: <Navigate to="/app" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
