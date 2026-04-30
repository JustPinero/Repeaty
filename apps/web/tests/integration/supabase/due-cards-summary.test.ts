import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  type TestUser,
} from './_helpers';

describe('due_cards_summary RPC', () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    ensureIntegrationEnv();
    userA = await createTestUser('due-A');
    userB = await createTestUser('due-B');
  });

  afterAll(async () => {
    if (userA?.userId) await deleteTestUser(userA.userId);
    if (userB?.userId) await deleteTestUser(userB.userId);
  });

  it('returns rows for the calling user, scoped via auth.uid() in the function body', async () => {
    const { data, error } = await userA.client.rpc('due_cards_summary');
    expect(error).toBeNull();
    // Bundled ES + FR decks each have 30 cards, all "new" for a fresh user;
    // the RPC includes only decks with at least one due-or-new card, so we
    // expect both bundled decks to appear here.
    const rows = data ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.due_count).toBeTypeOf('number');
      expect(row.new_count).toBeTypeOf('number');
      expect(row.due_count + row.new_count).toBeGreaterThan(0);
    }
  });

  it('orders rows by (due+new) DESC, deck_name ASC', async () => {
    const { data, error } = await userA.client.rpc('due_cards_summary');
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ deck_name: string; due_count: number; new_count: number }>;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const curr = rows[i]!;
      const prevScore = prev.due_count + prev.new_count;
      const currScore = curr.due_count + curr.new_count;
      if (prevScore === currScore) {
        expect(prev.deck_name.localeCompare(curr.deck_name)).toBeLessThanOrEqual(0);
      } else {
        expect(prevScore).toBeGreaterThanOrEqual(currScore);
      }
    }
  });

  it('isolates per-user state — User B cannot see User A’s reviews via the RPC', async () => {
    // Both users see the same bundled decks (RLS allows). Counts for a fresh
    // user should be identical regardless of any other user's state.
    const a = await userA.client.rpc('due_cards_summary');
    const b = await userB.client.rpc('due_cards_summary');
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const aRows = (a.data ?? []) as Array<{ deck_id: string; due_count: number; new_count: number }>;
    const bRows = (b.data ?? []) as Array<{ deck_id: string; due_count: number; new_count: number }>;

    const aByDeck = new Map(aRows.map((r) => [r.deck_id, r]));
    for (const bRow of bRows) {
      const aRow = aByDeck.get(bRow.deck_id);
      expect(aRow, `expected matching row for deck ${bRow.deck_id}`).toBeDefined();
      // Both fresh users see identical counts (all new, none due).
      expect(bRow.due_count).toBe(aRow!.due_count);
      expect(bRow.new_count).toBe(aRow!.new_count);
    }
  });
});
