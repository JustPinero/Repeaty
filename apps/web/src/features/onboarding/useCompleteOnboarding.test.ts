import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { useCompleteOnboarding, isSessionExpiredError } from './useCompleteOnboarding';

let lastQc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  lastQc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: lastQc }, children);
}

const validInput = {
  displayName: 'Ben',
  nativeLanguageCode: 'en-US',
  targets: [{ language_code: 'es', cefr_level: 'A1' as const }],
};

describe('useCompleteOnboarding', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('calls supabase.rpc with the mapped p_-prefixed parameter names', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

    await result.current.mutateAsync(validInput);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('complete_onboarding', {
      p_display_name: 'Ben',
      p_native_language_code: 'en-US',
      p_targets: [{ language_code: 'es', cefr_level: 'A1' }],
    });
  });

  it('invalidates the onboarding-status query on success', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });
    const invalidateSpy = vi.spyOn(lastQc, 'invalidateQueries');

    await result.current.mutateAsync(validInput);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['onboarding-status'] });
    });
  });

  it('maps Postgres 42501 to a session-expired error', async () => {
    rpcMock.mockResolvedValue({
      error: { code: '42501', message: 'not authenticated', details: '', hint: '' },
    });
    const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

    await expect(result.current.mutateAsync(validInput)).rejects.toThrowError(
      /session has expired/i,
    );
  });

  it('maps Postgres 22023 to a friendly validation error', async () => {
    rpcMock.mockResolvedValue({
      error: { code: '22023', message: 'display_name is required', details: '', hint: '' },
    });
    const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

    await expect(result.current.mutateAsync(validInput)).rejects.toThrowError(
      /double-check/i,
    );
  });

  it('passes through unknown error messages unchanged', async () => {
    rpcMock.mockResolvedValue({
      error: { code: 'XX000', message: 'network blew up', details: '', hint: '' },
    });
    const { result } = renderHook(() => useCompleteOnboarding(), { wrapper });

    await expect(result.current.mutateAsync(validInput)).rejects.toThrowError(
      /network blew up/i,
    );
  });

  it('isSessionExpiredError detects the mapped session-expired error', () => {
    const expired = new Error('SESSION_EXPIRED: Your session has expired. Please sign in again.');
    const other = new Error('something else');
    expect(isSessionExpiredError(expired)).toBe(true);
    expect(isSessionExpiredError(other)).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
  });
});
