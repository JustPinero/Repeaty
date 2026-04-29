import { test, expect } from '@playwright/test';

// Phase-1 E2E spec — partial. Drives signup → auto-confirm (local) → /app.
// Onboarding wizard finishes the flow in Request 1.4. Tagged in
// e2e-manifest.json as "in-progress" until 1.4 completes.
//
// Requires a running web app + local Supabase with:
//   [auth.email] enable_confirmations = false  (set in supabase/config.toml)
//
// CI runs this spec only when the manifest entry is `complete`.

test.describe('@phase-1 signup-and-onboarding (partial)', () => {
  test('new user can sign up and reach /app placeholder', async ({ page }) => {
    const email = `e2e-test-${Date.now()}@example.com`;
    const password = 'longenoughpassword';

    await page.goto('/signup');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign up/i }).click();

    // Auto-confirmed locally; user lands on /app placeholder.
    await expect(page).toHaveURL(/\/app/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
  });
});
