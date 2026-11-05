#!/usr/bin/env node
/**
 * Generates Tempo's PWA icons, favicon, and Open Graph share card.
 *
 * Design: near-black field, thick amber timer ring, and a short teal accent
 * arc at 12 o'clock. The maskable variant fills the canvas edge-to-edge and
 * keeps the ring inside the central 80% safe zone (a radius of 204.8 px on a
 * 512 px canvas). The 1200x630 share card pairs the ring with the wordmark
 * and tagline for Open Graph / Twitter previews.
 *
 * Run with: npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = join(ROOT, 'public')
const ICONS_DIR = join(PUBLIC_DIR, 'icons')

const SIZE = 512
const BG = '#0A0A0B'
const AMBER = '#F59E0B'
const TEAL = '#2DD4BF'

// `any` icons get a little breathing room around the ring. The maskable icon
// is smaller: radius + stroke / 2 = 186 px, comfortably inside the 204.8 px
// safe-zone radius.
const VARIANTS = {
  standard: { radius: 184, stroke: 44, arcSweep: 52 },
  maskable: { radius: 166, stroke: 40, arcSweep: 54 },
}

const PNG_TARGETS = [
  { file: 'icon-192.png', size: 192, variant: 'standard' },
  { file: 'icon-512.png', size: 512, variant: 'standard' },
  { file: 'icon-512-maskable.png', size: 512, variant: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, variant: 'standard' },
]

function pointOnCircle(cx, cy, radius, angleDegrees) {
  const angle = (angleDegrees * Math.PI) / 180
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
}

/** Clockwise arc path starting at `startDegrees` (SVG screen coordinates). */
function arcPath(cx, cy, radius, startDegrees, sweepDegrees) {
  const [x1, y1] = pointOnCircle(cx, cy, radius, startDegrees)
  const [x2, y2] = pointOnCircle(cx, cy, radius, startDegrees + sweepDegrees)
  const largeArc = sweepDegrees > 180 ? 1 : 0
  return (
    `M ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
    `A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
  )
}

function buildSvg(variantName) {
  const { radius, stroke, arcSweep } = VARIANTS[variantName]
  const center = SIZE / 2
  // Start at 12 o'clock and sweep clockwise over the upper-right quadrant.
  const accent = arcPath(center, center, radius, -90, arcSweep)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="Tempo">
  <title>Tempo</title>
  <rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>
  <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${AMBER}" stroke-width="${stroke}"/>
  <path d="${accent}" fill="none" stroke="${TEAL}" stroke-width="${stroke}" stroke-linecap="round"/>
</svg>
`
}

function buildOgImage() {
  const width = 1200
  const height = 630
  const cx = 890
  const cy = 315
  const radius = 170
  const stroke = 42
  const accent = arcPath(cx, cy, radius, -90, 52)
  const font = "Arial, 'Helvetica Neue', 'DejaVu Sans', sans-serif"

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${AMBER}" stroke-width="${stroke}"/>
  <path d="${accent}" fill="none" stroke="${TEAL}" stroke-width="${stroke}" stroke-linecap="round"/>
  <text x="80" y="270" font-family="${font}" font-size="96" font-weight="700" letter-spacing="12" fill="#F5F5F4">TEMPO</text>
  <text x="84" y="345" font-family="${font}" font-size="38" fill="#A1A1AA">Interval timer &amp; 4-7-8 breathing</text>
  <rect x="84" y="382" width="72" height="3" rx="1.5" fill="${TEAL}"/>
  <text x="84" y="442" font-family="${font}" font-size="28" fill="#71717A">40/20 &amp; 45/15 work-rest sets · guided breath</text>
</svg>
`
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true })

  for (const { file, size, variant } of PNG_TARGETS) {
    const outputPath = join(ICONS_DIR, file)
    const svg = Buffer.from(buildSvg(variant))

    await sharp(svg)
      // Render the 512-unit artwork, then downsample for clean small-size edges.
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(outputPath)

    const meta = await sharp(outputPath).metadata()
    if (meta.width !== size || meta.height !== size) {
      throw new Error(`${file}: expected ${size}x${size}, got ${meta.width}x${meta.height}`)
    }
    console.log(`wrote public/icons/${file} (${meta.width}x${meta.height})`)
  }

  await writeFile(join(PUBLIC_DIR, 'favicon.svg'), buildSvg('standard'), 'utf8')
  console.log('wrote public/favicon.svg (512x512 viewBox)')

  const ogPath = join(PUBLIC_DIR, 'og-image.png')
  await sharp(Buffer.from(buildOgImage()))
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(ogPath)

  const ogMeta = await sharp(ogPath).metadata()
  if (ogMeta.width !== 1200 || ogMeta.height !== 630) {
    throw new Error(`og-image.png: expected 1200x630, got ${ogMeta.width}x${ogMeta.height}`)
  }
  console.log('wrote public/og-image.png (1200x630)')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
