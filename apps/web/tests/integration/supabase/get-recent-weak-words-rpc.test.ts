import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestUser,
  deleteTestUser,
  ensureIntegrationEnv,
  getServiceClient,
  type TestUser,
} from './_helpers';

describe('get_recent_weak_words RPC', () => {
  let user: TestUser;
  let other: TestUser;
  let esCard1: string;
  let esCard2: string;
  let frCard: string;

  beforeAll(async () => {
    ensureIntegrationEnv();
    user = await createTestUser('weak-words');
    other = await createTestUser('weak-words-other');

    const service = getServiceClient();
    const esCards = await service
      .from('cards')
      .select('id, target_text, language_code')
      .eq('language_code', 'es')
      .limit(2);
    esCard1 = esCards.data![0]!.id;
    esCard2 = esCards.data![1]!.id;
    const frCards = await service
      .from('cards')
      .select('id, language_code')
      .eq('language_code', 'fr')
      .limit(1);
    frCard = frCards.data![0]!.id;
  });

  afterAll(async () => {
    if (user?.userId) await deleteTestUser(user.userId);
    if (other?.userId) await deleteTestUser(other.userId);
  });

  it('includes failed comprehension_attempts target_texts for the right language', async () => {
    const service = getServiceClient();
    await service.from('comprehension_attempts').insert({
      user_id: user.userId,
      card_id: esCard1,
      response_ms: 4000,
      correct: false,
    });
    const res = await user.client.rpc('get_recent_weak_words', {
      p_user_id: user.userId,
      p_language: 'es',
      p_limit: 50,
    });
    expect(res.error).toBeNull();
    type Row = { target_text: string; last_seen: string };
    const rows = (res.data as Row[]) ?? [];
    const targets = rows.map((r) => r.target_text);
    const expected = (
      await service.from('cards').select('target_text').eq('id', esCard1).single()
    ).data?.target_text;
    expect(targets).toContain(expected);
  });

  it('includes pronunciation_attempts where similarity_score < 0.6', async () => {
    const service = getServiceClient();
    await service.from('pronunciation_attempts').insert({
      user_id: user.userId,
      card_id: esCard2,
      audio_storage_path: `${user.userId}/${esCard2}/seed.webm`,
      whisper_transcript: 'oops',
      similarity_score: 0.3,
    });
    const res = await user.client.rpc('get_recent_weak_words', {
      p_user_id: user.userId,
      p_language: 'es',
      p_limit: 50,
    });
    expect(res.error).toBeNull();
    type Row = { target_text: string; last_seen: string };
    const targets = (res.data as Row[]).map((r) => r.target_text);
    const expected = (
      await service.from('cards').select('target_text').eq('id', esCard2).single()
    ).data?.target_text;
    expect(targets).toContain(expected);
  });

  it("filters out other users' weak words", async () => {
    const service = getServiceClient();
    await service.from('comprehension_attempts').insert({
      user_id: other.userId,
      card_id: esCard1,
      response_ms: 4000,
      correct: false,
    });
    const res = await user.client.rpc('get_recent_weak_words', {
      p_user_id: other.userId,
      p_language: 'es',
      p_limit: 50,
    });
    // Caller passes other's user_id but the RPC respects RLS — they can only
    // see their own attempts, so they get nothing for the other user.
    expect(res.error).toBeNull();
    expect((res.data as unknown[]).length).toBe(0);
  });

  it('filters by language_code server-side', async () => {
    const service = getServiceClient();
    await service.from('comprehension_attempts').insert({
      user_id: user.userId,
      card_id: frCard,
      response_ms: 4000,
      correct: false,
    });
    const resEs = await user.client.rpc('get_recent_weak_words', {
      p_user_id: user.userId,
      p_language: 'es',
      p_limit: 50,
    });
    const resFr = await user.client.rpc('get_recent_weak_words', {
      p_user_id: user.userId,
      p_language: 'fr',
      p_limit: 50,
    });
    type Row = { target_text: string; last_seen: string };
    const esCount = (resEs.data as Row[]).length;
    const frCount = (resFr.data as Row[]).length;
    expect(esCount).toBeGreaterThan(0);
    expect(frCount).toBeGreaterThan(0);
    // No cross-contamination — fr-only data not in es result and vice versa.
    const esText = (resEs.data as Row[]).map((r) => r.target_text);
    const frText = (resFr.data as Row[]).map((r) => r.target_text);
    expect(esText.every((t) => !frText.includes(t))).toBe(true);
  });
});
