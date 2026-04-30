import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFeedback, type FeedbackInput } from './useFeedback';

const baseInput: Omit<FeedbackInput, 'bucket'> = {
  kind: 'comprehension',
  targetText: 'hola',
  nativeText: 'hello',
  userResponse: 'helo',
  nativeLanguageCode: 'en-US',
};

function call(input: FeedbackInput) {
  return renderHook(() => useFeedback(input)).result.current;
}

describe('useFeedback', () => {
  it('returns null text for "perfect" bucket (no feedback needed)', () => {
    const { text, isLoading } = call({ ...baseInput, bucket: 'perfect' });
    expect(text).toBeNull();
    expect(isLoading).toBe(false);
  });

  it('returns canned encouraging text for "close" bucket', () => {
    const { text } = call({ ...baseInput, bucket: 'close' });
    expect(typeof text).toBe('string');
    expect(text!.length).toBeGreaterThan(0);
    expect(text).toMatch(/nearly|spelling|details/i);
  });

  it('returns canned coaching text for "miss" bucket', () => {
    const { text } = call({ ...baseInput, bucket: 'miss' });
    expect(typeof text).toBe('string');
    expect(text!.length).toBeGreaterThan(0);
  });

  it('honors the native language code when picking text — Spanish ≠ English', () => {
    const en = call({ ...baseInput, bucket: 'close', nativeLanguageCode: 'en-US' }).text;
    const es = call({ ...baseInput, bucket: 'close', nativeLanguageCode: 'es-ES' }).text;
    expect(en).not.toBe(es);
    expect(en).not.toBeNull();
    expect(es).not.toBeNull();
  });

  it('falls back to English for unsupported native languages', () => {
    const en = call({ ...baseInput, bucket: 'close', nativeLanguageCode: 'en-US' }).text;
    const xx = call({ ...baseInput, bucket: 'close', nativeLanguageCode: 'xx' }).text;
    expect(xx).toBe(en);
  });

  it('isLoading is always false in v1 (synchronous lookup)', () => {
    expect(call({ ...baseInput, bucket: 'perfect' }).isLoading).toBe(false);
    expect(call({ ...baseInput, bucket: 'close' }).isLoading).toBe(false);
    expect(call({ ...baseInput, bucket: 'miss' }).isLoading).toBe(false);
  });
});
