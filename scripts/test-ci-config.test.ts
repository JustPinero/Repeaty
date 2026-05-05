/**
 * scripts/test-ci-config.test.ts
 *
 * Regression tests for `.github/workflows/ci.yml`. Asserts the shape of the
 * `live-smoke` job (renamed from `production-smoke` per DEBT-010) introduced
 * in Request 8.1 — so a careless edit to the workflow can't silently disable
 * the post-push smoke gate without tripping the test suite.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

type WorkflowJob = {
  name?: string;
  'runs-on'?: string;
  if?: string;
  needs?: string | string[];
  steps?: Array<{ name?: string; run?: string; uses?: string }>;
};

type Workflow = {
  jobs?: Record<string, WorkflowJob>;
};

const CI_YML = resolve(__dirname, '..', '.github', 'workflows', 'ci.yml');

function loadCi(): Workflow {
  return load(readFileSync(CI_YML, 'utf8')) as Workflow;
}

describe('ci.yml — live-smoke job', () => {
  it('is defined', () => {
    const ci = loadCi();
    expect(ci.jobs?.['live-smoke']).toBeDefined();
  });

  it('runs only on push to main, not on PRs or phase branches', () => {
    const job = loadCi().jobs!['live-smoke']!;
    expect(job.if).toBe(
      "github.ref == 'refs/heads/main' && github.event_name == 'push'",
    );
  });

  it('has no `needs` — runs in parallel with validate', () => {
    const job = loadCi().jobs!['live-smoke']!;
    expect(job.needs).toBeUndefined();
  });

  it('runs `pnpm smoke` exactly (the smoke step is the load-bearing one)', () => {
    const job = loadCi().jobs!['live-smoke']!;
    const smokeStep = job.steps?.find((s) => s.run === 'pnpm smoke');
    expect(smokeStep).toBeDefined();
  });

  it('uses pnpm + Node action chain consistent with the other jobs', () => {
    const job = loadCi().jobs!['live-smoke']!;
    const usedActions = (job.steps ?? [])
      .map((s) => s.uses)
      .filter((u): u is string => !!u);
    expect(usedActions).toEqual(
      expect.arrayContaining([
        'actions/checkout@v6',
        'pnpm/action-setup@v6',
        'actions/setup-node@v6',
      ]),
    );
  });
});
