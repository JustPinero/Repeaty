import { test, expect } from '@playwright/test';

// Phase-1 E2E: signup → auto-confirm (local) → onboarding wizard → /app.
//
// Requires a running web app + local Supabase with:
//   [auth.email] enable_confirmations = false  (set in supabase/config.toml)
//
// CI runs this spec only when the manifest entry is `complete`. We mark it
// `complete` at /phase-complete time after Request 1.5 ships the dashboard.

test.describe('@phase-1 signup-and-onboarding', () => {
  test('new user can sign up, complete onboarding, and reach /app', async ({ page }) => {
    const email = `e2e-test-${Date.now()}@example.com`;
    const password = 'longenoughpassword';

    // Signup
    await page.goto('/signup');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign up/i }).click();

    // Onboarding wizard intercepts the /app navigation because the new user's
    // profile + user_languages are empty.
    await expect(page.getByRole('heading', { name: /Welcome to Repeaty/i })).toBeVisible({
      timeout: 15_000,
    });

    // Step 1 — name
    await page.getByLabel(/name|what should we call you/i).fill('Ben');
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2 — native language
    await page.getByLabel(/native language/i).selectOption('en-US');
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3 — target + CEFR
    await page.getByLabel(/target language|i want to learn/i).selectOption('es');
    await page.getByLabel(/level|cefr/i).selectOption('A1');
    await page.getByRole('button', { name: /finish|done|complete/i }).click();

    // Onboarding done → /app placeholder visible.
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
  });
});
