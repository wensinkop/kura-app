// Regenerate the PWA home-screen icons from the turtle source.
//
// Source of truth: assets/icon-only.svg (full-bleed green square turtle — the
// same art as the Android launcher icon). Output: public/icons/icon-<size>.webp
// (referenced by manifest.webmanifest + the apple-touch-icon link).
//
// sharp is NOT a project dependency (the icons are pre-generated and committed,
// so the build/runtime never needs it). To regenerate after changing the art:
//   npm install --no-save --no-package-lock sharp && node scripts/gen-icons.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'assets', 'icon-only.svg'))
const sizes = [48, 72, 96, 128, 192, 256, 512]

for (const size of sizes) {
  const out = join(root, 'public', 'icons', `icon-${size}.webp`)
  await sharp(svg).resize(size, size).webp({ quality: 92 }).toFile(out)
  console.log(`wrote icon-${size}.webp`)
}
