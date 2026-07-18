/**
 * Rasterize PunchThis Marked Frame brand assets for Expo.
 * Usage: node scripts/generate-brand-assets.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "assets", "images");

const INK = "#1C232B";
const STEEL = "#8B97A1";
const COBALT = "#4C82FF";

/** Marked Frame symbol — matches design lockup (viewBox 0 0 64 64). */
function markSvg({ frame = STEEL, chip = COBALT, stroke = 5 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <path d="M8 20 V14 a6 6 0 0 1 6-6 h6 M44 8 h6 a6 6 0 0 1 6 6 v6 M56 44 v6 a6 6 0 0 1 -6 6 h-6 M20 56 h-6 a6 6 0 0 1 -6-6 v-6" stroke="${frame}" stroke-width="${stroke}" stroke-linecap="round"/>
  <rect x="24" y="24" width="16" height="16" rx="4.5" fill="${chip}"/>
</svg>`;
}

/** Full app icon with ink tile + subtle radial lift. */
function appIconSvg(size) {
  const markPad = Math.round(size * 0.14);
  const markSize = size - markPad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="30%" cy="20%" r="90%">
      <stop offset="0%" stop-color="#2A3644"/>
      <stop offset="55%" stop-color="${INK}"/>
      <stop offset="100%" stop-color="#161C22"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
  <g transform="translate(${markPad} ${markPad}) scale(${markSize / 64})">
    <path d="M8 20 V14 a6 6 0 0 1 6-6 h6 M44 8 h6 a6 6 0 0 1 6 6 v6 M56 44 v6 a6 6 0 0 1 -6 6 h-6 M20 56 h-6 a6 6 0 0 1 -6-6 v-6" stroke="${STEEL}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <rect x="24" y="24" width="16" height="16" rx="4.5" fill="${COBALT}"/>
  </g>
</svg>`;
}

/**
 * Android adaptive foreground — mark only on transparent, inset so the
 * mark stays inside the ~66% safe zone when masked.
 */
function adaptiveForegroundSvg(size) {
  const inset = Math.round(size * 0.18);
  const markSize = size - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${inset} ${inset}) scale(${markSize / 64})">
    <path d="M8 20 V14 a6 6 0 0 1 6-6 h6 M44 8 h6 a6 6 0 0 1 6 6 v6 M56 44 v6 a6 6 0 0 1 -6 6 h-6 M20 56 h-6 a6 6 0 0 1 -6-6 v-6" stroke="${STEEL}" stroke-width="5.5" stroke-linecap="round" fill="none"/>
    <rect x="24" y="24" width="16" height="16" rx="4.5" fill="${COBALT}"/>
  </g>
</svg>`;
}

/** Splash mark — larger clear space on transparent for contain on ink bg. */
function splashSvg(size) {
  const inset = Math.round(size * 0.22);
  const markSize = size - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${inset} ${inset}) scale(${markSize / 64})">
    <path d="M8 20 V14 a6 6 0 0 1 6-6 h6 M44 8 h6 a6 6 0 0 1 6 6 v6 M56 44 v6 a6 6 0 0 1 -6 6 h-6 M20 56 h-6 a6 6 0 0 1 -6-6 v-6" stroke="${STEEL}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <rect x="24" y="24" width="16" height="16" rx="4.5" fill="${COBALT}"/>
  </g>
</svg>`;
}

/** Favicon — thickened frame + larger chip for 48px legibility. */
function faviconSvg(size) {
  const inset = Math.round(size * 0.12);
  const markSize = size - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="${INK}"/>
  <g transform="translate(${inset} ${inset}) scale(${markSize / 64})">
    <path d="M6 22 V15 a7 7 0 0 1 7-7 h7 M44 8 h7 a7 7 0 0 1 7 7 v7 M58 44 v7 a7 7 0 0 1 -7 7 h-7 M20 58 h-7 a7 7 0 0 1 -7-7 v-7" stroke="${STEEL}" stroke-width="7" stroke-linecap="round" fill="none"/>
    <rect x="22" y="22" width="20" height="20" rx="5.5" fill="${COBALT}"/>
  </g>
</svg>`;
}

async function pngFromSvg(svg, outPath) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(outPath, buf);
  console.log("wrote", path.relative(process.cwd(), outPath), `(${buf.length} bytes)`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  // Keep SVG masters alongside PNGs for future regenerations.
  await writeFile(path.join(outDir, "mark.svg"), markSvg());
  await writeFile(path.join(outDir, "icon.svg"), appIconSvg(1024));

  await pngFromSvg(appIconSvg(1024), path.join(outDir, "icon.png"));
  await pngFromSvg(adaptiveForegroundSvg(1024), path.join(outDir, "adaptive-icon.png"));
  await pngFromSvg(splashSvg(1024), path.join(outDir, "splash-icon.png"));
  await pngFromSvg(faviconSvg(48), path.join(outDir, "favicon.png"));

  console.log("PunchThis brand assets ready in assets/images/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
