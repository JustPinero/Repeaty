/**
 * Comprehension scoring — combines `similarity` (0–1) with response time
 * (ms) into a 0–100 score and a coarse bucket.
 *
 * Formula:
 *   - similarity ≤ 0  → 0
 *   - speedFactor:
 *       response ≤ 2_000 ms     → 1.0
 *       response  ≥ 30_000 ms   → 0.5 (floor — never below)
 *       between                 → linearly interpolated
 *   - score = round(min(100, similarity × speedFactor × 100))
 *
 * Buckets:
 *   ≥ 90 → 'perfect'   (celebratory)
 *   ≥ 60 → 'close'     (encouragement)
 *    < 60 → 'miss'      (gentle coaching)
 */

export type ScoreBucket = 'perfect' | 'close' | 'miss';

const FAST_THRESHOLD_MS = 2_000;
const SLOW_THRESHOLD_MS = 30_000;
const SPEED_FLOOR = 0.5;

export function comprehensionScore(similarity: number, responseMs: number): number {
  if (similarity <= 0) return 0;
  let speedFactor: number;
  if (responseMs <= FAST_THRESHOLD_MS) {
    speedFactor = 1;
  } else if (responseMs >= SLOW_THRESHOLD_MS) {
    speedFactor = SPEED_FLOOR;
  } else {
    const t = (responseMs - FAST_THRESHOLD_MS) / (SLOW_THRESHOLD_MS - FAST_THRESHOLD_MS);
    speedFactor = 1 - t * (1 - SPEED_FLOOR);
  }
  return Math.round(Math.min(100, Math.max(0, similarity * speedFactor * 100)));
}

export function bucket(score: number): ScoreBucket {
  if (score >= 90) return 'perfect';
  if (score >= 60) return 'close';
  return 'miss';
}
