import { describe, expect, it } from 'vitest';
import { initialState, schedule, dueAt, isDue, Rating, type FsrsState } from './fsrs';

const now = new Date('2026-05-01T12:00:00.000Z');

describe('initialState', () => {
  it('returns a v:1 state with zero reps/lapses and due ≈ now', () => {
    const s = initialState(now);
    expect(s.v).toBe(1);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(0);
    expect(s.state).toBe(0); // New
    expect(s.last_review).toBeNull();
    expect(new Date(s.due).getTime()).toBeCloseTo(now.getTime(), -3);
  });

  it('returns a JSON-round-trippable state', () => {
    const s = initialState(now);
    const round = JSON.parse(JSON.stringify(s)) as FsrsState;
    expect(round).toEqual(s);
  });
});

describe('schedule', () => {
  it('Again on a new card schedules a re-review within 10 minutes', () => {
    const next = schedule(initialState(now), Rating.Again, now);
    const elapsedMs = new Date(next.due).getTime() - now.getTime();
    expect(elapsedMs).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it('Easy on a new card schedules a re-review at least 4 days out', () => {
    const next = schedule(initialState(now), Rating.Easy, now);
    const elapsedDays = (new Date(next.due).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(elapsedDays).toBeGreaterThanOrEqual(4);
  });

  it('repeated Good ratings produce monotonically increasing intervals', () => {
    let s = initialState(now);
    let cursor = now;
    const intervals: number[] = [];

    for (let i = 0; i < 5; i++) {
      const next = schedule(s, Rating.Good, cursor);
      const elapsedDays =
        (new Date(next.due).getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000);
      intervals.push(elapsedDays);
      s = next;
      cursor = new Date(next.due); // review at the scheduled time
    }
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i], `interval[${i}] not greater than interval[${i - 1}]`).toBeGreaterThan(
        intervals[i - 1]!,
      );
    }
  });

  it('Again on a mature card drops interval to ≤ 1 day', () => {
    // Build a mature state by walking Good 5x.
    let s = initialState(now);
    let cursor = now;
    for (let i = 0; i < 5; i++) {
      const next = schedule(s, Rating.Good, cursor);
      s = next;
      cursor = new Date(next.due);
    }
    // Mature = scheduled at least 30d out.
    expect(s.scheduled_days).toBeGreaterThanOrEqual(30);

    const lapsed = schedule(s, Rating.Again, cursor);
    const elapsedDays =
      (new Date(lapsed.due).getTime() - cursor.getTime()) / (24 * 60 * 60 * 1000);
    expect(elapsedDays).toBeLessThanOrEqual(1);
  });

  it('is deterministic — same (state, rating, now) always produces the same output', () => {
    const s = initialState(now);
    const a = schedule(s, Rating.Good, now);
    const b = schedule(s, Rating.Good, now);
    expect(a).toEqual(b);
  });

  it('always sets due strictly after the moment of review (causality)', () => {
    let s = initialState(now);
    let cursor = now;
    for (const r of [Rating.Good, Rating.Hard, Rating.Easy, Rating.Again]) {
      const next = schedule(s, r, cursor);
      expect(new Date(next.due).getTime()).toBeGreaterThan(cursor.getTime());
      s = next;
      cursor = new Date(next.due);
    }
  });
});

describe('dueAt', () => {
  it('returns the parsed Date from the due field', () => {
    const s = initialState(now);
    const d = dueAt(s);
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe(s.due);
  });
});

describe('isDue', () => {
  it('returns true when now ≥ due', () => {
    const s = initialState(now);
    expect(isDue(s, new Date(now.getTime() + 1000))).toBe(true);
  });

  it('returns false when now < due', () => {
    const s = initialState(now);
    const next = schedule(s, Rating.Easy, now);
    expect(isDue(next, new Date(now.getTime() + 60_000))).toBe(false);
  });
});
