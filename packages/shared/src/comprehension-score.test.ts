import { describe, expect, it } from 'vitest';
import { comprehensionScore, bucket } from './comprehension-score';

describe('comprehensionScore', () => {
  it('perfect accuracy + fast response → ≥ 95', () => {
    expect(comprehensionScore(1, 1_000)).toBeGreaterThanOrEqual(95);
  });

  it('perfect accuracy + slow response (30s) → ≥ 50, ≤ 100', () => {
    const score = comprehensionScore(1, 30_000);
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('zero accuracy → 0 regardless of speed', () => {
    expect(comprehensionScore(0, 100)).toBe(0);
    expect(comprehensionScore(0, 5_000)).toBe(0);
    expect(comprehensionScore(-0.1, 1_000)).toBe(0);
  });

  it('partial accuracy 0.7 + 5s → in [40, 70]', () => {
    const score = comprehensionScore(0.7, 5_000);
    expect(score).toBeGreaterThanOrEqual(40);
    expect(score).toBeLessThanOrEqual(70);
  });

  it('is deterministic — same input always produces the same score', () => {
    expect(comprehensionScore(0.85, 3_500)).toBe(comprehensionScore(0.85, 3_500));
  });

  it('clamps to [0, 100]', () => {
    expect(comprehensionScore(2, 0)).toBeLessThanOrEqual(100);
    expect(comprehensionScore(1, 0)).toBeLessThanOrEqual(100);
    expect(comprehensionScore(-5, 0)).toBe(0);
  });

  it('speedFactor floor — past 30s the score does not keep dropping', () => {
    const at30 = comprehensionScore(1, 30_000);
    const at60 = comprehensionScore(1, 60_000);
    expect(at60).toBe(at30);
  });
});

describe('bucket', () => {
  it('≥ 90 → "perfect"', () => {
    expect(bucket(100)).toBe('perfect');
    expect(bucket(90)).toBe('perfect');
  });

  it('60..89 → "close"', () => {
    expect(bucket(89)).toBe('close');
    expect(bucket(60)).toBe('close');
  });

  it('< 60 → "miss"', () => {
    expect(bucket(59)).toBe('miss');
    expect(bucket(0)).toBe('miss');
  });
});
