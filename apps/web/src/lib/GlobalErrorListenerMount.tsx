import { useGlobalErrorListeners } from './useGlobalErrorListeners';

export function GlobalErrorListenerMount(): null {
  useGlobalErrorListeners();
  return null;
}
