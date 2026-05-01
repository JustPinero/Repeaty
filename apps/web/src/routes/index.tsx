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
import { AdminGuard, AdminPage } from '@/features/admin';
import { GenerateLessonPage } from '@/features/generate';
import CardDetailPage from '@/pages/CardDetail';

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
      { path: 'admin', element: <AdminGuard><AdminPage /></AdminGuard> },
      { path: 'generate', element: <GenerateLessonPage /> },
      { path: '*', element: <Navigate to="/app" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
