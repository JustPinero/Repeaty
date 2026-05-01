import { AuthProvider } from '@/features/auth';
import { AppRouter } from '@/routes';
import { useOfflineReplay } from '@/lib/useOfflineReplay';

function OfflineReplayMount() {
  useOfflineReplay();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <h1 className="sr-only">Repeat after Peaty.</h1>
      <OfflineReplayMount />
      <AppRouter />
    </AuthProvider>
  );
}
