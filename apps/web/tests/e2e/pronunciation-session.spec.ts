import { test, expect } from '@playwright/test';

// Phase-4 E2E: signup → onboarding → pronunciation session for a bundled deck →
// record → stop → see the scored result panel.
//
// Mic capture in headless Chromium needs the `--use-fake-device-for-media-stream`
// + `--use-fake-ui-for-media-stream` flags (set under `use.launchOptions.args`
// in playwright.config.ts when this flow flips to `complete` in
// e2e-manifest.json). Storage uploads + the score-pronunciation Edge Function
// are intercepted via `page.route` so the test does not require an OpenAI key
// or a started Supabase Functions runtime.

test.describe('@phase-4 pronunciation-session', () => {
  test('new user can record one card and see the scored result panel', async ({ page }) => {
    const email = `e2e-pron-${Date.now()}@example.com`;
    const password = 'longenoughpassword';

    // Mock the Storage upload (any object PUT under pronunciation-audio).
    await page.route(/\/storage\/v1\/object\/pronunciation-audio\//, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ Key: 'pronunciation-audio/mocked-path' }),
      });
    });

    // Mock the Edge Function — return a perfect score so we can deterministically
    // assert on the result panel UI.
    await page.route(/\/functions\/v1\/score-pronunciation$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            attempt_id: '00000000-0000-0000-0000-0000000aaaaa',
            whisper_transcript: 'hola',
            similarity_score: 0.97,
            expected: 'hola',
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

    // Browse decks → click Pronunciation on the first bundled deck.
    // Wait for the post-onboarding /app dashboard to be ready (URL settled +
    // dashboard renders) so the auth context has fully hydrated before the
    // direct navigation to /app/decks. Then wait for the deck list page's
    // heading before reaching for the pronunciation link — DEBT-006 was a
    // race where the locator timed out before the bundled-decks query
    // settled.
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
    await page.goto('/app/decks');
    await expect(page.getByRole('heading', { name: /your decks/i })).toBeVisible({
      timeout: 15_000,
    });
    const pronLink = page.getByRole('link', { name: /Pronunciation practice/i }).first();
    await expect(pronLink).toBeVisible({ timeout: 15_000 });
    await pronLink.click();

    await expect(page).toHaveURL(/\/app\/decks\/.+\/pronunciation/);
    const recordBtn = page.getByRole('button', { name: /start recording/i });
    await expect(recordBtn).toBeVisible();

    // Record. With the playwright.config.ts fake-device flags, getUserMedia
    // resolves to a synthesised stream and `--use-fake-ui-for-media-stream`
    // auto-grants the permission prompt.
    await recordBtn.click();

    // Wait for the state machine to transition into 'recording'.
    const stopBtn = page.getByRole('button', { name: /stop recording/i });
    await expect(stopBtn).toBeVisible({ timeout: 10_000 });

    // Stop → onRecorded → submitRecording → uploadPronunciationBlob (route
    // mock) → score-pronunciation Edge Function (route mock) → pendingResult.
    await stopBtn.click();

    // The result panel renders the score we mocked (97).
    await expect(page.getByText(/97\s*\/\s*100/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /view card history/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^next$/i })).toBeVisible();
  });
});
