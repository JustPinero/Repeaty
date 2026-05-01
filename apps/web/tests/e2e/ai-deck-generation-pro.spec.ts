import { test, expect, request as playwrightRequest } from '@playwright/test';

// Phase-5 E2E (deferred from chore(5.0)): Pro user → /app/generate form →
// submit → land on /app/decks/<new-deck-id>/review. The Edge Function call
// is intercepted via `page.route` so the test does not require an Anthropic
// key. The Pro-tier flip uses the Supabase REST admin API
// (SUPABASE_SERVICE_ROLE_KEY) — same env var the supabase-migrations CI job
// already exports.

test.describe('@phase-5 ai-deck-generation-pro', () => {
  test('Pro user generates a lesson and lands on the new deck review page', async ({ page }) => {
    const email = `e2e-aigen-${Date.now()}@example.com`;
    const password = 'longenoughpassword';

    // Mock the Edge Function call. The synthetic deck_id needs to match the
    // post-redirect URL pattern; the redirect target page falls back to the
    // app's normal supabase calls (no mock for those — they'll just fail to
    // load deck contents, which is fine; we only assert URL match).
    const SYNTH_DECK_ID = '00000000-0000-0000-0000-0000000aigen';
    await page.route(/\/functions\/v1\/generate-lesson$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            deck_id: SYNTH_DECK_ID,
            deck_name: 'Spanish food basics',
            card_count: 8,
            cost_estimate_usd: 0.0042,
          },
          error: null,
        }),
      });
    });

    // Signup → onboarding → dashboard.
    await page.goto('/signup');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign up/i }).click();

    await expect(page.getByRole('heading', { name: /Welcome to Repeaty/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel(/name|what should we call you/i).fill('Ben');
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByLabel(/native language/i).selectOption('en-US');
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByLabel(/target language|i want to learn/i).selectOption('es');
    await page.getByLabel(/level|cefr/i).selectOption('A1');
    await page.getByRole('button', { name: /finish|done|complete/i }).click();
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });

    // Flip the user to tier='pro' via the Supabase REST admin API.
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const api = await playwrightRequest.newContext({
      baseURL: supabaseUrl,
      extraHTTPHeaders: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    const usersRes = await api.get(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
    expect(usersRes.ok()).toBeTruthy();
    const usersBody = (await usersRes.json()) as { users: Array<{ id: string }> };
    const userId = usersBody.users[0]!.id;
    const patch = await api.patch(
      `/rest/v1/profiles?id=eq.${userId}`,
      {
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        data: { tier: 'pro' },
      },
    );
    expect(patch.ok()).toBeTruthy();
    await api.dispose();

    // Refresh the dashboard so useProfile picks up the new tier.
    await page.reload();
    const cta = page.getByRole('link', { name: /generate a lesson/i });
    await expect(cta).toBeVisible({ timeout: 15_000 });
    await cta.click();

    await expect(page).toHaveURL(/\/app\/generate$/);
    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible();

    // Topic hint optional — leave blank, submit with default 12 cards.
    await page.getByRole('button', { name: /generate/i }).click();

    // Edge Function returns the synthetic deck_id; client navigates to the
    // review session for that deck.
    await expect(page).toHaveURL(new RegExp(`/app/decks/${SYNTH_DECK_ID}/review`), {
      timeout: 15_000,
    });
  });
});
