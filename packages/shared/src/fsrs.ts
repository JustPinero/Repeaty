// RED-phase stub — schedule() returns the input unchanged so tests fail.
// GREEN replaces with a thin ts-fsrs wrapper that produces FSRS-correct
// state transitions. The exported FsrsState shape is versioned (v: 1) so
// future migrations to FSRS-5+ are straightforward.

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

export function initialState(_now: Date = new Date()): FsrsState {
  throw new Error('initialState stub — replaced in GREEN');
}

export function schedule(state: FsrsState, _rating: Rating, _now: Date = new Date()): FsrsState {
  return state;
}

export function dueAt(state: FsrsState): Date {
  return new Date(state.due);
}

export function isDue(state: FsrsState, now: Date = new Date()): boolean {
  return new Date(state.due) <= now;
}
