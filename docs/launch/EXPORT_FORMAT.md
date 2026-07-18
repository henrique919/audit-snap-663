# PunchThis — Export archive format (LP-05)

Implementation: `expo/lib/exportArchive.ts`. UI: Settings › Storage › **Export all data**.

## What this is

"Export all data" produces **one zip archive** containing every record PunchThis has stored on
this device (projects, locations, assignees, audits, issues, photo variants, annotations, report
exports) plus the app settings row and every media file those records still reference (original /
report / thumbnail / annotated photo variants where distinct, project cover photos, project and
brand logos, generated report PDFs).

It exists as the one dependable safety net before anyone relies on PunchThis for real
recordkeeping: local-only storage (see `lib/legalCopy.ts` `LOCAL_STORAGE_WARNING`) means losing
the device or clearing app data can permanently destroy everything, and this is the way to get a
complete copy out.

## Non-goal: this is not a restore/backup-and-recover feature

**The archive cannot be imported back into PunchThis.** There is no in-app restore, no
"reopen this .zip" flow, and no sync target it feeds into. It is explicitly **archival only** —
for cold storage, sending to a client/insurer, or manual recovery of individual files by a human
opening the zip. Any future in-app restore is tracked separately (master plan, Gate B+) and would
require its own format-compatibility and merge-conflict design; shipping "export" now does not
imply "import" is coming.

This fact is repeated in-app in three places, all sourced from the same exported string
constants in `lib/exportArchive.ts` (so wording drift is caught by
`lib/__tests__/exportArchive.test.ts`):

- Settings row sub-copy (`EXPORT_ROW_SUBCOPY`)
- The success dialog after a completed export (`buildExportSuccessMessage`)
- This document

## Archive structure

```
punchthis-export-<YYYYMMDD-HHmm>.zip
├── manifest.json
├── settings.json
├── records/
│   ├── projects.json
│   ├── locations.json
│   ├── assignees.json
│   ├── audits.json
│   ├── issues.json
│   ├── assets.json
│   ├── annotations.json
│   ├── reports.json
│   └── outbox.json
└── media/
    ├── asset-original_<assetId>.jpg
    ├── asset-report_<assetId>.jpg
    ├── asset-thumb_<assetId>.jpg
    ├── asset-annotated_<assetId>.jpg
    ├── project-cover_<projectId>.jpg
    ├── project-logo_<projectId>.png
    ├── report-pdf_<reportId>.pdf
    └── settings-logo_settings.png
```

- `records/<table>.json` — one file per table in `lib/store.ts` `Db`, each a raw JSON array of
  that table's rows exactly as persisted (including soft-deleted rows — the local persistence
  layer never hard-deletes, so the export doesn't either).
- `settings.json` — the full `AppSettings` object.
- `media/<role>_<id>.<ext>` — every media file above, sequentially read and embedded. `id` is the
  id of the owning record (asset/project/report id, or the literal string `settings` for the
  app-level brand logo). `role` identifies which field on that record the file came from (see
  `ExportMediaRole` in `lib/exportArchive.ts`). A given asset/project only contributes a role once
  even if two of its fields point at the same file (e.g. web photos where `originalUri` and
  `reportUri` are identical) — see `collectExportMedia`.
- `manifest.json` — written **last**, after every media read attempt has completed, so its
  `skipped` array is accurate for this run (see below).

### `manifest.json` shape

```json
{
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "createdAt": "2026-07-18T10:30:00.000Z",
  "counts": {
    "projects": 1,
    "locations": 3,
    "assignees": 2,
    "audits": 1,
    "issues": 12,
    "assets": 34,
    "annotations": 9,
    "reports": 1,
    "outbox": 0
  },
  "media": [
    { "id": "a1", "role": "asset-original", "filename": "asset-original_a1.jpg", "sourceUri": "file:///.../orig_a1.jpg" }
  ],
  "skipped": [
    { "id": "a7", "role": "asset-thumb", "filename": "asset-thumb_a7.jpg", "sourceUri": "file:///.../thumb_a7.jpg", "reason": "File no longer exists on this device." }
  ]
}
```

- `media` lists every file the export **attempted** to include, whether or not it actually made it
  into `media/` (cross-reference against `skipped` to know which ones didn't).
- `skipped` lists every media entry that could **not** be read, with a human-readable `reason`.
  A file being missing, unreadable, or platform-unavailable (e.g. a web-preview report PDF, which
  is never a real file — see `WEB_PRINT_SENTINEL` in `lib/reportPrintWeb.ts`) never silently
  drops the file from the archive as a whole; it is always recorded here instead. The export still
  reports success in this case (see "Failure semantics" below) — a few unreadable photos is not
  the same as the export itself failing — but the success dialog states the skipped count and the
  manifest names exactly which files and why.

## `formatVersion` rules

- `formatVersion` is a single incrementing integer, currently `1` (`EXPORT_FORMAT_VERSION` in
  `lib/exportArchive.ts`).
- Bump it whenever the **shape** of `manifest.json`, `records/<table>.json`, `settings.json`, or
  the `media/` naming scheme changes in a way that a hand-written script reading an old archive
  would need to change to handle (renamed/removed fields, changed table list, changed media
  filename scheme, etc.).
- Do **not** bump it for additive, backward-compatible changes that a reasonable reader already
  tolerates (e.g. a new optional field appearing in a record — the same "no migration needed for
  an optional field" rule the app itself uses for `AppSettings`).
- Because there is no in-app reader of this format, "compatibility" here means: a human or a
  future migration script can always tell which shape they're looking at from `formatVersion`
  alone, without guessing from field presence.

## Failure semantics

- **Success** means the archive was fully built and fully handed to the share sheet (native) or
  the browser download (web). A run can still succeed with entries in `manifest.skipped` — missing
  individual files does not invalidate the rest of the archive, and the success dialog always
  states the skipped count so it is never presented as a silent, complete success.
- **Failure** (zip generation error, write error, share error, sharing unavailable on the device,
  any unexpected exception) shows an honest failure dialog (`lib/dialogs.ts` `showAlert`, never
  `Alert.alert` directly) and leaves **no partial file behind** — any temp zip already written to
  `cacheDirectory` is deleted before the failure is reported. There is no "partially exported"
  state a user can be misled by.
- Every read is attempted **strictly sequentially** — never in parallel — so a slow or failing
  file cannot corrupt or race against another file's read; see "Scale limits" below for why.

## Scale limits (stated, not hidden)

[JSZip](https://stuk.github.io/jszip/) has no streaming API on either platform used here: every
file added to the archive is held in memory as part of the `JSZip` instance, and the final
`generateAsync()` call materialises the **entire compressed archive** as one more in-memory
buffer (a base64 string on native, a `Blob` on web) before it can be written or downloaded. There
is no way to flush partial archive content to disk as it's built.

Practical consequence: total addressable memory is **much more** than
`(sum of all media file sizes) + (final zip buffer size)` — see measurement below; JSZip keeps
intermediate base64/compression buffers alive well beyond the raw input size while
`generateAsync()` runs. Sequential (non-parallel) reads keep the "extra" beyond that floor to one
file at a time during the add phase, but do not reduce the cost of the final `generateAsync()`
call, which is the actual peak.

**Measured, not guessed.** A standalone script (`new JSZip()`, sequential `zip.file(path, base64,
{ base64: true })` adds — the exact `lib/exportArchive.ts` pattern — then one
`generateAsync({ type: "base64", compression: "DEFLATE" })`, same as the native path) was run
under plain Node/V8 on the dev machine with binary-random (incompressible, JPEG-like) payloads to
find the actual peak process memory at increasing total media size:

| Raw media size | Peak process RSS during `generateAsync` | Elapsed |
|---|---|---|
| 10 MB | ~445 MB | 2.1 s |
| 50 MB | ~1.42 GB | 12.2 s |
| 100 MB | ~2.46 GB | 24.9 s |
| 200 MB | ~3.6 GB | 53.2 s |
| 300 MB | **`FATAL ERROR: Reached heap limit — JavaScript heap out of memory`** (crashed) |

That's roughly a **12–18× memory multiplier** over the raw media size at peak, and the process
crashed outright once total media reached the 200–300 MB range even on a desktop Node process
with a generous (~4 GB) default heap. Two platform caveats on top of that:

- This was measured on desktop V8, not the device this app actually runs on. Mobile Safari/Chrome
  tabs and React Native's Hermes engine typically have **far smaller** usable heaps than a
  desktop Node process (often in the low hundreds of MB to ~1–2 GB before the tab/app is killed),
  so the real on-device ceiling is very likely **lower** than these numbers, not higher.
- These payloads were incompressible random bytes, chosen deliberately because real JPEG/PDF
  content is already near-maximum entropy (compression buys almost nothing) — this is a fair
  stand-in for actual photo/report payload, not a worst case exaggerated beyond reality.

**Conclusion stated plainly:** a project whose combined referenced media (all photo variants +
report PDFs) is above roughly **100 MB is already at real, non-hypothetical risk of the export
failing outright on typical mobile hardware or a mobile browser tab**, well before any thousands
or even hundreds of full-resolution photos are involved. There is no hard cap enforced by the
code — the app will attempt the export regardless of size — but this is not a hidden defect,
it's a known, load-bearing limitation of holding the whole archive in memory via JSZip with no
streaming path on either platform. The failure path above (honest dialog, temp file cleaned up,
no partial/corrupted archive) is exactly what a user sees if this ceiling is hit. Removing the
ceiling would require a streaming rewrite (e.g. writing zip entries incrementally straight to a
file) and is out of scope for LP-05.

## Out of scope (tracked separately)

- In-app restore/import of an archive.
- Any cloud upload/sync of the archive.
- Per-project selective export.
- Auto-scheduled/background backups.
