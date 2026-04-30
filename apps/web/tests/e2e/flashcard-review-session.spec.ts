import { test, expect } from '@playwright/test';

// Phase-2 E2E: signup → onboarding → dashboard "Start review" CTA →
// reveal + rate 3 bundled cards → progress counter shows 3 reviewed.
// CI runs this when the manifest entry is `complete`.

test.describe('@phase-2 flashcard-review-session', () => {
  test('new user can rate 3 bundled cards and see the progress counter advance', async ({
    page,
  }) => {
    const email = `e2e-flashcard-${Date.now()}@example.com`;
    const password = 'longenoughpassword';

    // Signup (auto-confirmed locally per supabase/config.toml).
    await page.goto('/signup');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign up/i }).click();

    // Onboarding wizard.
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

    // Dashboard renders with a Start-review CTA. The top deck depends on the
    // (unordered) per-deck aggregation; we just need _some_ start link to a
    // bundled deck's review path.
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
    const startCta = page.getByRole('link', { name: /start review/i }).first();
    await expect(startCta).toBeVisible({ timeout: 15_000 });
    await startCta.click();

    // Inside the review session.
    await expect(page).toHaveURL(/\/app\/decks\/.+\/review/);
    await expect(page.getByRole('button', { name: /reveal answer/i })).toBeVisible();

    // Rate 3 cards Good. After each rating, wait for the progress counter to
    // advance — that's a deterministic signal that submitRating finished and
    // the queue advanced (or completion screen rendered, which has its own
    // `Session complete` heading).
    for (let i = 1; i <= 3; i++) {
      await page.getByRole('button', { name: /reveal answer/i }).click();
      await page.getByRole('button', { name: /^good$/i }).click();
      await expect(page.getByText(new RegExp(`${i} reviewed`))).toBeVisible({ timeout: 15_000 });
    }
  });
});
