import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock })),
  },
}));

import { logClientError, scrubPayload, __resetErrorLogRateLimit } from './error-log';

describe('scrubPayload', () => {
  it('drops password / token / api_key fields by name', () => {
    const out = scrubPayload({
      message: 'failed',
      extra: { password: 'hunter2', api_key: 'leaked', okay: 'ok' },
    });
    expect(out.extra).toEqual({ okay: 'ok' });
  });

  it('replaces sk- and sk-ant- patterns inside string fields with <scrubbed>', () => {
    const out = scrubPayload({
      message: 'leaked sk-ant-api03-AAAAAAAAAAAA in stack',
      stack: 'Error: tried sk-proj-1234567890 again',
    });
    expect(out.message).not.toContain('sk-ant-');
    expect(out.message).toContain('<scrubbed>');
    expect(out.stack).toContain('<scrubbed>');
  });

  it('caps stack at 8 KB and extra at 4 KB', () => {
    const huge = 'x'.repeat(20_000);
    const out = scrubPayload({ message: 'm', stack: huge, extra: { blob: huge } });
    expect((out.stack ?? '').length).toBeLessThanOrEqual(8 * 1024);
    expect(JSON.stringify(out.extra ?? {}).length).toBeLessThanOrEqual(4 * 1024);
  });
});

describe('logClientError', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    __resetErrorLogRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes to client_error_log with the scrubbed payload', async () => {
    logClientError({ message: 'boom', route: '/app' });
    // Microtask flush.
    await Promise.resolve();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom', route: '/app' }),
    );
  });

  it('never throws even when supabase rejects', async () => {
    insertMock.mockRejectedValueOnce(new Error('offline'));
    expect(() => logClientError({ message: 'boom' })).not.toThrow();
    await Promise.resolve();
  });

  it('rate-limits: drops after 5 inserts in 60s', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 7; i++) {
      logClientError({ message: `e${i}` });
      await Promise.resolve();
    }
    expect(insertMock).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(61_000);
    logClientError({ message: 'after-cooldown' });
    await Promise.resolve();
    expect(insertMock).toHaveBeenCalledTimes(6);
  });
});
