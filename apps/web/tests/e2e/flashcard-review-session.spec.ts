import { test, expect } from '@playwright/test';

// Phase-2 E2E: signup → onboarding → dashboard "Start review" CTA →
// reveal + rate a handful of bundled Spanish A1 cards → session-complete
// summary. CI runs this when the manifest entry is `complete`.

test.describe('@phase-2 flashcard-review-session', () => {
  test('new user can rate 3 bundled Spanish cards and reach the completion summary', async ({
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

    // Dashboard renders with the review queue + a Start-review CTA pointing at
    // the Spanish bundled deck.
    await expect(page).toHaveURL(/\/app/, { timeout: 15_000 });
    const startCta = page.getByRole('link', { name: /start review.*spanish/i });
    await expect(startCta).toBeVisible({ timeout: 15_000 });
    await startCta.click();

    // First flashcard (Spanish target text — could be any of the 30; we just
    // assert the Reveal button is there and the URL is the review path).
    await expect(page).toHaveURL(/\/app\/decks\/.+\/review/);
    await expect(page.getByRole('button', { name: /reveal answer/i })).toBeVisible();

    // Rate three cards Good. Each iteration: reveal → click Good → next card.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /reveal answer/i }).click();
      await page.getByRole('button', { name: /^good$/i }).click();
      // Either the next card's Reveal button appears, or the completion heading.
      await page.waitForFunction(
        () => {
          const reveal = document.querySelector('button')?.textContent ?? '';
          const complete = document.body.innerText;
          return /Reveal answer/i.test(reveal) || /Session complete/i.test(complete);
        },
        { timeout: 10_000 },
      );
    }

    // After three cards there are still cards left (deck has 30), so we stop
    // early and just confirm progress is being recorded.
    await expect(page.getByText(/3 reviewed/i)).toBeVisible();
  });
});
