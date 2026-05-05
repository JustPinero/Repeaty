/**
 * scripts/test-deploy-config.test.ts
 *
 * Regression tests for `.github/workflows/deploy.yml`. Asserts the deploy
 * pipeline's invariants from Request 8.2:
 *   - triggers off CI's success on main (workflow_run, conclusion == success)
 *   - migrations run before edge functions, edge functions before frontend
 *   - smoke runs after the deploy
 *   - rollback step is wired with `if: failure()` on the deploy step
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Step = { name?: string; id?: string; run?: string; uses?: string; if?: string; 'working-directory'?: string };
type Job = { 'runs-on'?: string; if?: string; steps?: Step[] };
type Workflow = { name?: string; on?: unknown; jobs?: Record<string, Job> };

const DEPLOY_YML = resolve(__dirname, '..', '.github', 'workflows', 'deploy.yml');

function loadDeploy(): Workflow {
  return load(readFileSync(DEPLOY_YML, 'utf8')) as Workflow;
}

function stepIndex(steps: Step[], match: (s: Step) => boolean): number {
  return steps.findIndex(match);
}

describe('deploy.yml — auto-deploy on merge to main', () => {
  it('exists and is named "Deploy"', () => {
    const w = loadDeploy();
    expect(w.name).toBe('Deploy');
  });

  it('triggers off the CI workflow completing on main', () => {
    const w = loadDeploy();
    const on = w.on as Record<string, Record<string, unknown>>;
    expect(on?.workflow_run).toBeDefined();
    expect(on.workflow_run.workflows).toEqual(['CI']);
    expect(on.workflow_run.branches).toEqual(['main']);
    expect(on.workflow_run.types).toContain('completed');
  });

  it('deploy job runs only when CI succeeded', () => {
    const job = loadDeploy().jobs!['deploy']!;
    expect(job.if).toBe(
      "github.event.workflow_run.conclusion == 'success'",
    );
  });

  it('orders steps: migrations → edge functions → frontend deploy → smoke', () => {
    const steps = loadDeploy().jobs!['deploy']!.steps!;
    const dbPush = stepIndex(steps, (s) => s.name === 'Push migrations');
    const fnDeploy = stepIndex(steps, (s) => s.name === 'Deploy Edge Functions');
    const vercelDeploy = stepIndex(steps, (s) => s.id === 'vercel-deploy');
    const smoke = stepIndex(steps, (s) => s.run === 'pnpm smoke');
    expect(dbPush).toBeGreaterThanOrEqual(0);
    expect(fnDeploy).toBeGreaterThan(dbPush);
    expect(vercelDeploy).toBeGreaterThan(fnDeploy);
    expect(smoke).toBeGreaterThan(vercelDeploy);
  });

  it('rollback step has `if: failure()` and runs after the deploy', () => {
    const steps = loadDeploy().jobs!['deploy']!.steps!;
    const rollback = steps.find((s) => s.name === 'Rollback on smoke failure');
    expect(rollback).toBeDefined();
    expect(rollback!.if).toBe(
      "failure() && steps.vercel-deploy.outcome == 'success'",
    );
    expect(rollback!.run).toMatch(/vercel.+rollback/);
  });

  it('uses --frozen-lockfile for reproducible installs', () => {
    const steps = loadDeploy().jobs!['deploy']!.steps!;
    const installStep = steps.find(
      (s) => s.run?.includes('pnpm install --frozen-lockfile'),
    );
    expect(installStep).toBeDefined();
  });
});
