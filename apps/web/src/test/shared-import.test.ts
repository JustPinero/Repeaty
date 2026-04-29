import { describe, expect, it } from 'vitest';
import * as shared from '@repeaty/shared';

describe('@repeaty/shared', () => {
  it('exports a non-empty version string', () => {
    expect((shared as { version?: unknown }).version).toBeTypeOf('string');
    expect((shared as { version?: string }).version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
