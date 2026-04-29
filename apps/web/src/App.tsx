import { AuthProvider } from '@/features/auth';
import { AppRouter } from '@/routes';

export default function App() {
  return (
    <AuthProvider>
      <h1 className="sr-only">Repeat after Peaty.</h1>
      <AppRouter />
    </AuthProvider>
  );
}
