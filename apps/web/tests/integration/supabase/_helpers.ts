import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function ensureIntegrationEnv(): void {
  const missing = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Integration tests require these env vars: ${missing.join(', ')}. ` +
        `Run \`supabase start\` and source the output, or run via the CI supabase-migrations job.`,
    );
  }
}

export function getServiceClient(): SupabaseClient {
  ensureIntegrationEnv();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getAnonClient(): SupabaseClient {
  ensureIntegrationEnv();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TestUser = {
  email: string;
  password: string;
  userId: string;
  client: SupabaseClient; // signed in as this user, RLS-respecting
};

export async function createTestUser(label = 'user'): Promise<TestUser> {
  ensureIntegrationEnv();

  const email = `repeaty-test-${label}-${randomUUID()}@example.com`;
  const password = 'pw-' + randomUUID();

  // Use the service client to admin-create the user with email pre-confirmed,
  // then sign in via the anon client to get a JWT-bearing client.
  const service = getServiceClient();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`createTestUser failed: ${createErr?.message ?? 'no user returned'}`);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(`createTestUser sign-in failed: ${signInErr.message}`);
  }

  return { email, password, userId: created.user.id, client };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const service = getServiceClient();
  await service.auth.admin.deleteUser(userId);
}
