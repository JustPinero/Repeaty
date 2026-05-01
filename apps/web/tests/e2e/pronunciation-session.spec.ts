import { test, expect } from '@playwright/test';

// Phase-4 E2E (DEBT-006 resolved attempt 2): signup → onboarding →
// dashboard → "Your decks" link → click Pronunciation on a bundled deck
// → record → stop → see the scored result panel.
//
// Mic capture in headless Chromium uses the launchOptions args from
// `playwright.config.ts` (`--use-fake-device-for-media-stream` +
// `--use-fake-ui-for-media-stream`). Storage uploads + the
// score-pronunciation Edge Function are intercepted via `page.route`.
//
// Two race fixes from attempt 1:
// 1. Click the dashboard "Your decks" link instead of `page.goto` —
//    same-app routing keeps the auth context warm.
// 2. Wait for the MicCapture's `data-testid="mic-recording"` testid
//    rather than the Stop button's accessible name. The state
//    transition happens before the button repaints, so the testid is
//    a stricter signal.

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

    // Mock the Edge Function — return a perfect score so we can
    // deterministically assert on the result panel UI.
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
    await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });

    // DEBT-006 fix #1: click the dashboard "Your decks" link instead of
    // `page.goto('/app/decks')`. Same-app routing keeps the auth context
    // warm and the bundled-decks query has time to settle before we
    // reach for the deck-list links.
    const decksLink = page.getByRole('link', { name: /Browse all decks/i });
    await expect(decksLink).toBeVisible({ timeout: 15_000 });
    await decksLink.click();
    await expect(page).toHaveURL(/\/app\/decks$/);
    await expect(page.getByRole('heading', { name: /your decks/i })).toBeVisible({
      timeout: 15_000,
    });

    const pronLink = page.getByRole('link', { name: /Pronunciation practice/i }).first();
    await expect(pronLink).toBeVisible({ timeout: 15_000 });
    await pronLink.click();

    await expect(page).toHaveURL(/\/app\/decks\/.+\/pronunciation/);
    const recordBtn = page.getByRole('button', { name: /start recording/i });
    await expect(recordBtn).toBeVisible();

    await recordBtn.click();

    // DEBT-006 fix #2: the MicCapture state machine writes a
    // `data-testid="mic-recording"` div as soon as the recording state
    // mounts — stricter than waiting for the Stop button's accessible
    // name (the button repaint can lag the state transition).
    await expect(page.getByTestId('mic-recording')).toBeVisible({ timeout: 10_000 });

    const stopBtn = page.getByRole('button', { name: /stop recording/i });
    await stopBtn.click();

    // The result panel renders the score we mocked (97).
    await expect(page.getByText(/97\s*\/\s*100/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: /view card history/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^next$/i })).toBeVisible();
  });
});
