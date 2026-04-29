import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';

describe('ESLint config', () => {
  it('applies jsx-a11y rules to .tsx files in apps/web/src', async () => {
    const eslint = new ESLint({ cwd: path.resolve(__dirname, '../..') });
    const config = await eslint.calculateConfigForFile(
      path.resolve(__dirname, '../App.tsx'),
    );
    const ruleNames = Object.keys(config.rules ?? {});
    const a11yRules = ruleNames.filter((r) => r.startsWith('jsx-a11y/'));
    expect(a11yRules.length).toBeGreaterThan(0);
  });
});
