# Fix — Bundled-decks idempotency assertion

## What's missing
Request 2.1's acceptance matrix lists "Re-running migrations is idempotent (no duplicates)" as a `bundled-decks.test.ts` integration assertion. The current spec asserts that exactly one ES and one FR deck exist, but doesn't directly verify that re-applying `0009_seed_bundled_decks.sql` doesn't produce duplicates or alter behavior. The guarantee currently relies on the SQL's `on conflict (id) do update` clauses being correct.

## Why it matters
A future regression in `seed-decks.ts` could swap `on conflict ... do update` for `do nothing` (or remove the conflict clause entirely), and the migration would still apply on a fresh DB and pass the existing assertions. But re-applying it (e.g. on a CI flow that runs `supabase db reset` between test groups, or any live-env redeploy) would break: with `do nothing`, a card with a regenerated UUID won't be updated. Without `on conflict` at all, re-apply errors with a unique-key violation that aborts the whole migration.

## Proposed test
Add to `apps/web/tests/integration/supabase/bundled-decks.test.ts`:

```ts
it('re-applying the seed migration is idempotent (no duplicate rows, no errors)', async () => {
  const service = getServiceClient();

  // Get baseline counts.
  const { count: deckBefore, error: e1 } = await service
    .from('decks')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'bundled');
  expect(e1).toBeNull();

  const { count: cardBefore, error: e2 } = await service
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .in('language_code', ['es', 'fr']);
  expect(e2).toBeNull();

  // Re-execute one of the canonical INSERT statements from the seed migration
  // (using the known bundled-deck UUID). Service role bypasses RLS.
  const { error: reapplyError } = await service.rpc('execute_bundled_seed_reapply');
  // OR: directly insert a known bundled card UUID (pinned in the migration)
  // and expect the conflict resolution to no-op rather than fail.

  // Re-count.
  const { count: deckAfter } = await service
    .from('decks')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'bundled');
  const { count: cardAfter } = await service
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .in('language_code', ['es', 'fr']);

  expect(deckAfter).toBe(deckBefore);
  expect(cardAfter).toBe(cardBefore);
});
```

Alternative (simpler): instead of an RPC, the test directly attempts `service.from('decks').upsert(...)` with the pinned bundled-deck UUID + an `onConflict: 'id'` and asserts no error + same row count. This covers the conflict behavior without needing a server-side helper.

## Files to touch
- `apps/web/tests/integration/supabase/bundled-decks.test.ts` — add one new `it()` block.

(No new RPC required if the simpler upsert-based approach is taken.)

## Acceptance criteria
- New test asserts deck and card counts are unchanged after re-applying a known bundled INSERT.
- Mutating `seed-decks.ts` to emit `on conflict (id) do nothing` (instead of `do update`) still passes (acceptable degradation), but mutating it to remove `on conflict` entirely causes the test to fail with a unique-key violation.
- The test runs in CI as part of the existing integration suite.
