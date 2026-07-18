/**
 * Generate licence-clear SAMPLE seed photos (PNG) without external deps.
 * Usage: node scripts/generate-seed-photos.mjs
 *
 * Each image is a solid construction-toned field with a SAMPLE watermark
 * encoded as a simple PNG (zlib). Glyphs/labels are approximated as large
 * letter blocks via filled rectangles + a text overlay written into the
 * filename metadata; for visual identity the SAMPLE band is high-contrast.
 */

import { deflateSync, constants as zlibConstants } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "assets", "seed");

const W = 1200;
const H = 900;

const ISSUES = [
  { file: "issue-01-paint.png", label: "PAINT", r: 196, g: 184, b: 168 },
  { file: "issue-02-sealant.png", label: "SEALANT", r: 184, g: 196, b: 200 },
  { file: "issue-03-cabling.png", label: "CABLING", r: 168, g: 176, b: 184 },
  { file: "issue-04-door.png", label: "DOOR", r: 176, g: 168, b: 156 },
  { file: "issue-05-membrane.png", label: "MEMBRANE", r: 156, g: 168, b: 160 },
  { file: "issue-06-linemark.png", label: "LINEMARK", r: 168, g: 160, b: 144 },
  { file: "issue-07-skirting.png", label: "SKIRTING", r: 180, g: 172, b: 160 },
  { file: "issue-08-switchboard.png", label: "SWITCHBOARD", r: 152, g: 160, b: 168 },
];

function crc(buf) {
  // node:zlib has no crc32 export in all versions — implement IEEE CRC-32
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function fillRect(rgba, w, h, x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y < y1; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= w) continue;
      const i = (y * w + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
}

/** Very small 5x7 bitmap font for uppercase labels. */
const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "11111", "10001", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "11100", "10010", "10001", "10001", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10010", "10001", "10001"],
  S: ["01111", "10000", "01110", "00001", "00001", "10001", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

function drawText(rgba, w, h, text, cx, cy, scale, r, g, b) {
  const chars = text.toUpperCase().split("");
  const charW = 6 * scale;
  const totalW = chars.length * charW;
  let x = Math.round(cx - totalW / 2);
  const y = Math.round(cy - (7 * scale) / 2);
  for (const ch of chars) {
    const rows = FONT[ch] || FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (rows[row][col] === "1") {
          fillRect(
            rgba,
            w,
            h,
            x + col * scale,
            y + row * scale,
            x + (col + 1) * scale,
            y + (row + 1) * scale,
            r,
            g,
            b,
          );
        }
      }
    }
    x += charW;
  }
}

function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const compressed = deflateSync(raw, { level: zlibConstants.Z_BEST_COMPRESSION });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

function makeImage({ label, r, g, b, isCover = false }) {
  const rgba = Buffer.alloc(W * H * 4);
  // gradient-ish vertical blend
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const rr = Math.round(r * (1 - t) + 70 * t);
    const gg = Math.round(g * (1 - t) + 80 * t);
    const bb = Math.round(b * (1 - t) + 90 * t);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      rgba[i] = rr;
      rgba[i + 1] = gg;
      rgba[i + 2] = bb;
      rgba[i + 3] = 255;
    }
  }
  // frame
  fillRect(rgba, W, H, 40, 40, W - 40, 48, 255, 255, 255, 255);
  fillRect(rgba, W, H, 40, H - 48, W - 40, H - 40, 255, 255, 255, 255);
  fillRect(rgba, W, H, 40, 40, 48, H - 40, 255, 255, 255, 255);
  fillRect(rgba, W, H, W - 48, 40, W - 40, H - 40, 255, 255, 255, 255);

  // centre glyph block
  fillRect(rgba, W, H, W / 2 - 80, H / 2 - 140, W / 2 + 80, H / 2 - 20, 28, 35, 43, 180);

  drawText(rgba, W, H, isCover ? "HARBOURVIEW" : label, W / 2, H / 2 + 40, 6, 28, 35, 43);
  if (isCover) {
    drawText(rgba, W, H, "STAGE 2", W / 2, H / 2 + 100, 5, 28, 35, 43);
  }
  // SAMPLE watermark
  fillRect(rgba, W, H, 200, H - 200, W - 200, H - 120, 201, 59, 59, 220);
  drawText(rgba, W, H, "SAMPLE", W / 2, H - 160, 8, 255, 255, 255);

  return encodePng(rgba, W, H);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const issue of ISSUES) {
    const buf = makeImage(issue);
    await writeFile(path.join(outDir, issue.file), buf);
    console.log("wrote", issue.file, `(${buf.length} bytes)`);
  }
  const cover = makeImage({ label: "COVER", r: 74, g: 85, b: 96, isCover: true });
  await writeFile(path.join(outDir, "cover.png"), cover);
  console.log("wrote cover.png", `(${cover.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
