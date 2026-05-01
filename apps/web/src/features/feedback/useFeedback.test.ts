import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const profileMock = vi.fn();
const invokeMock = vi.fn();

vi.mock('@/features/auth', () => ({
  useProfile: () => profileMock(),
  useAuthUser: () => ({ user: { id: 'u-1' }, isLoading: false }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

import { useFeedback, type FeedbackInput } from './useFeedback';

const baseInput: Omit<FeedbackInput, 'bucket'> = {
  kind: 'comprehension',
  targetText: 'hola',
  nativeText: 'hello',
  userResponse: 'helo',
  nativeLanguageCode: 'en-US',
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function call(input: FeedbackInput) {
  return renderHook(() => useFeedback(input), { wrapper: makeWrapper() });
}

const FREE_PROFILE = {
  id: 'u-1',
  display_name: 'Ben',
  email: 'b@e.com',
  native_language_code: 'en-US',
  tier: 'free' as const,
  is_admin: false,
};
const PRO_PROFILE = { ...FREE_PROFILE, tier: 'pro' as const };

describe('useFeedback (Phase-5 Claude swap)', () => {
  beforeEach(() => {
    profileMock.mockReset();
    invokeMock.mockReset();
  });

  // ── Canned-text fallback path (free tier / perfect bucket / no attemptId) ──

  it('free tier: returns canned text and never calls Edge Function', () => {
    profileMock.mockReturnValue({ profile: FREE_PROFILE, isLoading: false });
    const { result } = call({ ...baseInput, bucket: 'close', attemptId: 'a-1' });
    expect(result.current.text).not.toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Pro tier + perfect bucket: returns null text without calling Edge Function', () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    const { result } = call({ ...baseInput, bucket: 'perfect', attemptId: 'a-1' });
    expect(result.current.text).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('Pro tier + missing attemptId: falls back to canned text', () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    const { result } = call({ ...baseInput, bucket: 'close' });
    expect(result.current.text).not.toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('honors native-language code in the canned-text path (en ≠ es)', () => {
    profileMock.mockReturnValue({ profile: FREE_PROFILE, isLoading: false });
    const en = call({ ...baseInput, bucket: 'close', nativeLanguageCode: 'en-US' }).result.current.text;
    const es = call({ ...baseInput, bucket: 'close', nativeLanguageCode: 'es-ES' }).result.current.text;
    expect(en).not.toBe(es);
    expect(en).not.toBeNull();
    expect(es).not.toBeNull();
  });

  // ── Edge Function path (Pro tier + non-perfect + attemptId) ─────────────

  it('Pro tier + non-perfect + attemptId: invokes generate-feedback', async () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    invokeMock.mockResolvedValue({
      data: {
        data: { feedback_text: 'Try the second syllable.', cached: false },
        error: null,
      },
      error: null,
    });
    const { result } = call({ ...baseInput, bucket: 'miss', attemptId: 'a-1' });
    await waitFor(() => {
      expect(result.current.text).toBe('Try the second syllable.');
    });
    expect(invokeMock).toHaveBeenCalledWith('generate-feedback', {
      body: { kind: 'comprehension', attempt_id: 'a-1' },
    });
  });

  it('Edge Function transport error: returns null text without surfacing red', async () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    invokeMock.mockResolvedValue({ data: null, error: { message: 'network down' } });
    const { result } = call({ ...baseInput, bucket: 'miss', attemptId: 'a-1' });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.text).toBeNull();
  });

  it('Edge Function 429 RATE_LIMITED: falls back to canned text (not null)', async () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    invokeMock.mockResolvedValue({
      data: {
        data: null,
        error: { code: 'RATE_LIMITED', message: 'cap exceeded' },
      },
      error: null,
    });
    const { result } = call({ ...baseInput, bucket: 'miss', attemptId: 'a-1' });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(typeof result.current.text).toBe('string');
    expect(result.current.text!.length).toBeGreaterThan(0);
  });

  it('Edge Function UPSTREAM_TIMEOUT: returns null text (AI-down signal)', async () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    invokeMock.mockResolvedValue({
      data: {
        data: null,
        error: { code: 'UPSTREAM_TIMEOUT', message: 'aborted' },
      },
      error: null,
    });
    const { result } = call({ ...baseInput, bucket: 'miss', attemptId: 'a-1' });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.text).toBeNull();
  });

  it('caches per (kind, attemptId) — re-render with the same input does not re-fetch', async () => {
    profileMock.mockReturnValue({ profile: PRO_PROFILE, isLoading: false });
    invokeMock.mockResolvedValue({
      data: { data: { feedback_text: 'cached!', cached: false }, error: null },
      error: null,
    });
    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(
      (props: FeedbackInput) => useFeedback(props),
      {
        wrapper,
        initialProps: { ...baseInput, bucket: 'miss' as const, attemptId: 'a-1' },
      },
    );
    await waitFor(() => expect(result.current.text).toBe('cached!'));
    expect(invokeMock).toHaveBeenCalledTimes(1);

    rerender({ ...baseInput, bucket: 'miss' as const, attemptId: 'a-1' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
