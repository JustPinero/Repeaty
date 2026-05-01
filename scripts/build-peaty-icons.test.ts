/**
 * scripts/build-peaty-icons.test.ts
 *
 * Smoke test for the generated PWA icon binaries. Does NOT execute
 * the build script (that would require disk writes during CI). Instead
 * it asserts the committed PNG files have the dimensions the manifest
 * claims, so a hand-edit that breaks them fails the suite.
 *
 * See `scripts/build-peaty-icons.ts` for the generator. Running
 * `pnpm build:icons` regenerates these PNGs from `peat-start.jpg`.
 */

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  ICON_192,
  ICON_512,
  ICON_MASKABLE,
  SOURCE_JPG,
} from './build-peaty-icons';

describe('build-peaty-icons (committed binaries)', () => {
  it('peat-start.jpg source is present (PeatyGreeting + the icon generator both depend on it)', () => {
    expect(existsSync(SOURCE_JPG)).toBe(true);
  });

  it('peaty-icon-192.png is 192×192 PNG', async () => {
    expect(existsSync(ICON_192)).toBe(true);
    const meta = await sharp(ICON_192).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(192);
    expect(meta.height).toBe(192);
  });

  it('peaty-icon-512.png is 512×512 PNG', async () => {
    expect(existsSync(ICON_512)).toBe(true);
    const meta = await sharp(ICON_512).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });

  it('peaty-icon-maskable.png is 512×512 PNG (safe-zone variant)', async () => {
    expect(existsSync(ICON_MASKABLE)).toBe(true);
    const meta = await sharp(ICON_MASKABLE).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  });
});
