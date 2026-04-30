import { describe, expect, it } from 'vitest';
import { useFeedback } from './useFeedback';

const baseInput = {
  kind: 'comprehension' as const,
  targetText: 'hola',
  nativeText: 'hello',
  userResponse: 'helo',
  nativeLanguageCode: 'en-US',
};

describe('useFeedback', () => {
  it('returns null text for "perfect" bucket (no feedback needed)', () => {
    const { text, isLoading } = useFeedback({ ...baseInput, bucket: 'perfect' });
    expect(text).toBeNull();
    expect(isLoading).toBe(false);
  });

  it('returns canned encouraging text for "close" bucket', () => {
    const { text } = useFeedback({ ...baseInput, bucket: 'close' });
    expect(typeof text).toBe('string');
    expect(text!.length).toBeGreaterThan(0);
    expect(text).toMatch(/nearly|spelling|details/i);
  });

  it('returns canned coaching text for "miss" bucket', () => {
    const { text } = useFeedback({ ...baseInput, bucket: 'miss' });
    expect(typeof text).toBe('string');
    expect(text!.length).toBeGreaterThan(0);
  });

  it('honors the native language code when picking text — Spanish ≠ English', () => {
    const en = useFeedback({ ...baseInput, bucket: 'close', nativeLanguageCode: 'en-US' }).text;
    const es = useFeedback({ ...baseInput, bucket: 'close', nativeLanguageCode: 'es-ES' }).text;
    expect(en).not.toBe(es);
    expect(en).not.toBeNull();
    expect(es).not.toBeNull();
  });

  it('falls back to English for unsupported native languages', () => {
    const en = useFeedback({ ...baseInput, bucket: 'close', nativeLanguageCode: 'en-US' }).text;
    const xx = useFeedback({ ...baseInput, bucket: 'close', nativeLanguageCode: 'xx' }).text;
    expect(xx).toBe(en);
  });

  it('isLoading is always false in v1 (synchronous lookup)', () => {
    expect(useFeedback({ ...baseInput, bucket: 'perfect' }).isLoading).toBe(false);
    expect(useFeedback({ ...baseInput, bucket: 'close' }).isLoading).toBe(false);
    expect(useFeedback({ ...baseInput, bucket: 'miss' }).isLoading).toBe(false);
  });
});
