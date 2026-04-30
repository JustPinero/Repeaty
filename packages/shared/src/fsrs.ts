/**
 * FSRS scheduling — thin wrapper around ts-fsrs.
 *
 * The exported `FsrsState` is the shape persisted in `reviews.fsrs_state`
 * (JSONB). It carries a `v: 1` schema version so future migrations to
 * FSRS-5+ are versioned, not implicit. When that day comes, bump `v: 1`
 * to `v: 2` here and add a one-shot transformer.
 *
 * Rating contract:
 *   1 (Again)  forgot the answer
 *   2 (Hard)   correct but with significant effort
 *   3 (Good)   correct with normal effort
 *   4 (Easy)   trivial recall
 */

import {
  fsrs as createFsrs,
  generatorParameters,
  createEmptyCard,
  type Card as FsrsCard,
} from 'ts-fsrs';

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type Rating = (typeof Rating)[keyof typeof Rating];

export type FsrsState = {
  /** Schema version. Bump when the shape changes. */
  v: 1;
  /** ISO-8601 timestamp of the next review. */
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  /**
   * Lifecycle state — mirrors ts-fsrs's `State` enum.
   * 0 = New, 1 = Learning, 2 = Review, 3 = Relearning.
   */
  state: 0 | 1 | 2 | 3;
  /** ISO-8601 timestamp of the most recent review, or null for never-reviewed. */
  last_review: string | null;
};

// Singleton scheduler with default parameters. Per-user tuning is a
// post-v1 future feature (see references/architecture.md ADR-006).
const scheduler = createFsrs(generatorParameters());

function fromCard(card: FsrsCard): FsrsState {
  return {
    v: 1,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 0 | 1 | 2 | 3,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

function toCard(state: FsrsState): FsrsCard {
  const card: FsrsCard = {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.last_review ? new Date(state.last_review) : (undefined as unknown as Date),
  };
  return card;
}

export function initialState(now: Date = new Date()): FsrsState {
  const card = createEmptyCard(now);
  return fromCard(card);
}

export function schedule(
  state: FsrsState,
  rating: Rating,
  now: Date = new Date(),
): FsrsState {
  const card = toCard(state);
  const result = scheduler.next(card, now, rating);
  return fromCard(result.card);
}

export function dueAt(state: FsrsState): Date {
  return new Date(state.due);
}

export function isDue(state: FsrsState, now: Date = new Date()): boolean {
  return new Date(state.due) <= now;
}
