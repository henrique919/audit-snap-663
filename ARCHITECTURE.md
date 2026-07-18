# ARCHITECTURE.md — How Blocked (Category B) Capabilities Slot In Later

Phase 2 implements Category A only, but must not paint over these seams.
Every section ends with mechanical swap-in steps for when the external blocker clears.

## 1. Guiding constraints

- Local-first is the product. Nothing here may make offline worse.
- The storage key prefix `caiq:` is permanently frozen until a migration exists (`expo/lib/store.ts` KEY_PREFIX via `expo/lib/persistence/asyncStorageDriver.ts`).
- Every record already carries sync fields (`syncStatus`, `localVersion`, `serverVersion`, `deletedAt` — `expo/types/models.ts` BaseRecord) and every mutation appends a compacted outbox entry. Do not remove or bypass these.

## 2. Storage — single interface, device-local default

**Already built (Wave 1):** `expo/lib/persistence/driver.ts` defines `StorageDriver`
(loadTable/saveTables/loadSettings/saveSettings/clearAll). Default driver:
`asyncStorageDriver.ts`. Swap hook: `setStorageDriver()` in `expo/lib/store.ts`.
`expo/lib/persistence/README.md` documents the SQLite plan.

**Cloud expansion (B1) — mechanical steps:**
1. Implement `sqliteDriver.ts` satisfying `StorageDriver` (expo-sqlite; one table per
   TABLE_NAMES entry, JSON column per record, indexed by id).
2. One-time migration on boot: if `caiq:projects` exists in AsyncStorage and SQLite is
   empty → copy all nine tables + settings, verify counts, mark
   `caiq:migrated-to-sqlite=1`, keep AsyncStorage data as backup for 2 releases.
3. `setStorageDriver(sqliteDriver)` in `app/_layout.tsx` before AppStoreProvider mounts.
4. Sync engine consumes `db.outbox` (already compacted: one entry per record, deletes
   preserved) + per-record `syncStatus`. Upload → set `synced`/bump `serverVersion`;
   the UI already renders SyncPill states and the Sync Centre screen (`app/sync.tsx`)
   already displays pending counts — replace its placeholder copy last.

## 3. Monetization — entitlement stub (created in A12, consumed later)

**Design (build exactly this in A12):** `expo/lib/entitlements.ts`
```ts
export type FeatureKey = "csv_export" | "custom_themes" | "cloud_backup" | "multi_project" | "closeout_links";
interface Entitlements { plan: "free" | "pro" | "founder"; features: Record<FeatureKey, boolean>; }
export function getEntitlements(): Entitlements  // stub: plan "founder", all true
export function isEntitled(f: FeatureKey): boolean
export async function refreshEntitlements(): Promise<void>  // stub: no-op
```
Rules: UI code may ONLY call `isEntitled`; no plan strings in components; gates fail
OPEN in the stub. **IAP swap-in (B3):** implement `refreshEntitlements` against
RevenueCat/StoreKit, persist last-known entitlements in settings for offline, flip
default plan to "free", add the paywall screen — no component changes needed if every
premium feature already routed through `isEntitled`.

## 4. Branding — one-file rename (plus manifest)

**Single source of truth exists:** `expo/constants/config.ts` `BrandConfig`
(appName, tagline, reportName, reportFooter, website, monogram, brandPrimary,
brandAccent). All screens/report HTML already read from it — verified: no hardcoded
product names in `app/` or `lib/` outside config (comments excepted).
`app.json` cannot import TS, so the manifest is the one extra file.

**Rename checklist (B5, when the name is final):**
1. `expo/constants/config.ts` — appName, tagline, reportName, reportFooter, website, monogram.
2. `expo/app.json` — `expo.name`, `expo.slug`, `expo.scheme`; iOS `bundleIdentifier` and
   Android `package` (currently `app.rork.fsowpwobeaoqe5smtpb03` placeholders — MUST
   change before store submission; requires new native builds).
3. `rork.json` (platform display name) and `expo/package.json` `name` (cosmetic).
4. Comment sweep: `grep -rin "clean audit iq\|cleanrun" expo/ --include="*.ts*"` (comments only — no behavior).
5. **Never** touch the `caiq:` storage prefix (see §1).
Name shortlist and status: ROADMAP.md B5.

## 5. Brand assets — drop-in placeholder contract

Current placeholders live in `expo/assets/images/` and are referenced ONLY by `expo/app.json`:

| File | Spec (replace 1:1, same filename) |
|---|---|
| `icon.png` | 1024×1024 px, square, no transparency (iOS) |
| `adaptive-icon.png` | 1024×1024 px foreground on transparent bg; keep key art in the central 66% safe zone (Android) |
| `splash-icon.png` | ~1024×1024 transparent PNG; shown centered, `resizeMode: contain`, bg `#ffffff` (set `expo.splash.backgroundColor` to brand color at swap) |
| `favicon.png` / `favicon-32.png` | 48×48 / 32×32 (web) |
| In-app logo | `BrandConfig.logoUri` (currently null → monogram tile renders). Set to a `require()` asset or URL; report covers and headers pick it up automatically (`lib/report.ts`, `components/BrandMark.tsx`) |

Swap-in = overwrite files with identical names/dimensions + set `logoUri`; no code changes.

## 6. Deferred feature seams (do not pre-build)

| Future feature | Existing seam — leave intact |
|---|---|
| Voice-to-issue (B7) | Dead "Voice" button in `capture-session.tsx`; fills the `DraftIssue` object |
| AI tagging (B8) | `openDraft(photos)` in `capture-session.tsx` is the single funnel for new captures |
| GPS evidence (B9) | `expo-location` dependency present; add capture in `processPickedPhoto` callers; report caption slot = `includePhotoLocations` option in `lib/report.ts` |
| Closeout links (B2) | `lib/report.ts` already groups by assignee; per-assignee export = filter `issues` before `buildReportHtml` |
| Due dates / assignee manager (B11) | `Assignee` model already has company/email/phone/trade; add UI only |

## 7. Testing architecture

jest-expo harness (`expo/jest.config.js`); pure logic lives in `expo/lib/*` and is unit
tested; screens are verified behaviorally in the web preview (EXECUTION_PLAYBOOK §4).
New pure logic (dialogs router, CSV builder, entitlements, web image pipeline helpers)
MUST ship with unit tests in the same commit. Native-only paths (FileSystem, Print,
Sharing) stay behind `Platform.OS` guards and are covered by the existing persistence/
media test mocks — follow the established mock patterns in `expo/lib/__tests__/`.
