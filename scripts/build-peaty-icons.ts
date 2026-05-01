/**
 * scripts/build-peaty-icons.ts
 *
 * Generates the three properly-sized PWA icon binaries from the
 * existing welcome-pose JPG using `sharp`.
 *
 * Source:  apps/web/public/peaty/peat-start.jpg
 * Outputs: apps/web/public/peaty/peaty-icon-192.png         (192×192, purpose: any)
 *          apps/web/public/peaty/peaty-icon-512.png         (512×512, purpose: any)
 *          apps/web/public/peaty/peaty-icon-maskable.png    (512×512, 80% safe-zone, purpose: maskable)
 *
 * The maskable variant pads the source image to ~80% of the canvas
 * (~410×410 inside a 512×512 canvas) on a solid `#fff7e6` background —
 * the manifest's `background_color` — so adaptive-icon mask cropping
 * (Android, some PWA contexts) doesn't decapitate Peaty.
 *
 * Idempotent: rerunning produces byte-identical PNGs (sharp's PNG
 * encoder is deterministic for fixed inputs + options).
 *
 * Run via: `pnpm build:icons` (root or apps/web).
 *
 * `sharp` is a devDependency only — never imported from runtime code.
 * This script is invoked manually; it is NOT wired into `vite build`.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PUBLIC_PEATY = join(REPO_ROOT, 'apps', 'web', 'public', 'peaty');

export const SOURCE_JPG = join(PUBLIC_PEATY, 'peat-start.jpg');
export const ICON_192 = join(PUBLIC_PEATY, 'peaty-icon-192.png');
export const ICON_512 = join(PUBLIC_PEATY, 'peaty-icon-512.png');
export const ICON_MASKABLE = join(PUBLIC_PEATY, 'peaty-icon-maskable.png');

// Manifest's `background_color`. The maskable safe-zone fills the
// outer 10% with this so the adaptive-icon crop reads as one piece.
export const MASKABLE_BG = '#fff7e6';

// Sharp PNG options pinned for byte-stable output across runs/machines.
// Palette mode (8-bit indexed) keeps the three icons under ~200 KB total
// without visible quality loss for the parrot illustration's flat colors.
const PNG_OPTS = {
  compressionLevel: 9,
  palette: true,
  quality: 80,
  effort: 10,
  colors: 128,
} as const;

export type IconSpec = {
  out: string;
  size: number;
  // When true, render the source at 80% of the canvas centered on a
  // solid-color background (maskable safe-zone).
  maskable?: boolean;
};

export const ICON_SPECS: ReadonlyArray<IconSpec> = [
  { out: ICON_192, size: 192 },
  { out: ICON_512, size: 512 },
  { out: ICON_MASKABLE, size: 512, maskable: true },
];

export async function buildIcon(source: string, spec: IconSpec): Promise<void> {
  if (spec.maskable) {
    // 80% safe-zone: the source occupies the central 80% of the canvas
    // (~410px inside 512px), with the outer 10% padding filled by the
    // manifest background color.
    const inner = Math.round(spec.size * 0.8);
    const innerPng = await sharp(source)
      .resize(inner, inner, { fit: 'cover' })
      .png(PNG_OPTS)
      .toBuffer();

    await sharp({
      create: {
        width: spec.size,
        height: spec.size,
        channels: 4,
        background: MASKABLE_BG,
      },
    })
      .composite([{ input: innerPng, gravity: 'center' }])
      .png(PNG_OPTS)
      .toFile(spec.out);
    return;
  }

  await sharp(source)
    .resize(spec.size, spec.size, { fit: 'cover' })
    .png(PNG_OPTS)
    .toFile(spec.out);
}

export async function buildAllIcons(source: string = SOURCE_JPG): Promise<void> {
  for (const spec of ICON_SPECS) {
    await buildIcon(source, spec);
  }
}

async function main(): Promise<void> {
  await buildAllIcons();
  // eslint-disable-next-line no-console
  console.log(
    `✓ wrote PWA icons:\n  ${ICON_192}\n  ${ICON_512}\n  ${ICON_MASKABLE}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
