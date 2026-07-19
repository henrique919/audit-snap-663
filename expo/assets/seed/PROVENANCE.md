# Seed photo provenance

The 9 photos in this folder (`cover.jpg` + `issue-01..08-*.jpg`) are the bundled SAMPLE demo data's photos — shown on every screenshot of the app used in marketing materials, watermarked "SAMPLE" and used only with the app's own fictional demo project ("Sample — Harbourview Apartments Stage 2"), never real customer data.

Previously these were procedurally generated flat-color placeholders (a script, now removed, drew a gradient + a label + the SAMPLE band with no external dependencies — chosen originally to guarantee no licensing risk). Replaced with real construction photos because the placeholders read as fake/synthetic in marketing screenshots.

## Sources

- `IMG_6766.jpg` → `issue-01-paint.jpg`, `issue-07-skirting.jpg` (two different crops)
- `IMG_6800.jpg` → `issue-02-sealant.jpg`, `issue-06-linemark.jpg` (two different crops)
- `IMG_6807.jpg` → `issue-04-door.jpg`
- `IMG_6810.jpg` → `issue-03-cabling.jpg`, `issue-08-switchboard.jpg` (two different crops)

  The four `IMG_*` photos above were supplied directly by the product operator (via `henrique919/punchthis-website` PR #2, "Photos for Claude") for use in this project.

- `daniel-wong-ygy6koDTctY-unsplash.jpg` (Daniel Wong) → `issue-05-membrane.jpg`
- `dillon-kydd-zVud6mfHdUs-unsplash.jpg` (Dillon Kydd) → `cover.jpg`

  Sourced from Unsplash (unsplash.com), used under the Unsplash License (free for commercial and non-commercial use, no permission or attribution required — credited here as good practice).

A third Unsplash photo (`athul-rv-zUmOLgmAoW8-unsplash.jpg`, an artistic night/neon shot) was supplied in the same batch but not used — it didn't read as a construction-site issue photo.

## How each file was produced

Each output is the source photo center-cropped to 1200×900 (4:3) with a "SAMPLE" band composited at the bottom, rendered via a one-off Playwright/Chromium script (HTML + CSS `object-fit: cover`, screenshotted as JPEG quality 78 — kept file sizes to ~60-210KB each, versus multi-MB originals). The compositing script itself isn't checked into this repo (it depended on source files outside it); reproduce by cropping any replacement photo to 1200×900 and adding a similar band if these ever need to change again.
