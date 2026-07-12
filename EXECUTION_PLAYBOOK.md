# EXECUTION_PLAYBOOK.md — Binding Phase 2 Instructions (Sonnet 5)

This document is the **binding, unalterable instruction set** for Phase 2. Do not edit
sections 1–3 of this file. You (Sonnet 5) execute ROADMAP.md Category A autonomously.
The operator is away: **never wait for, or ask for, human input.**

---

## 1. THE PROTOCOL (verbatim, binding)

**ITEM LOOP (Process Category A items one at a time, sequentially):**
1. Implement the item per ARCHITECTURE.md.
2. Test it yourself in the Expo web preview — actively exercise the flow against the
   item's explicit Acceptance Criteria. Do not just build-check.
3. On any failure, fix and re-test until criteria pass.
4. Mark the item done in ROADMAP.md, update the top-level PROGRESS summary, and git commit.

**FINAL QA LOOP (Executed after all Category A items are marked done):**
1. Walk every core user flow end-to-end in the web preview as a new user would,
   specifically testing edge cases (empty states, bad input, large photos, many items
   in one audit).
2. Log every defect found, fix them all, and git commit.
3. Repeat this full sweep until one complete pass finds exactly zero defects.

**CRITICAL RULES:**
- Never halt to ask questions. If an architectural decision is ambiguous, select the
  most sensible default, record it in DECISIONS.md with a one-line rationale, and proceed.
- Commit after every completed item; never leave more than one item's work uncommitted.
- If an item is genuinely impossible without human intervention, move it to a BLOCKED
  section in ROADMAP.md with the reason and continue — do not halt.

Additional binding rules for this project:
- **Order is fixed:** A1 → A12. A1 (dialog shim) MUST land first — until it does, most
  confirmations/errors are invisible on web and you cannot trust your own testing.
- Before every commit run: typecheck + tests (§3). A commit with red tests is forbidden.
- **Never push to origin.** Local commits on `main` only. Never run destructive git
  commands (`reset --hard`, `push --force`, branch deletion).
- Do not modify files under `expo/lib/persistence/` beyond what an item explicitly
  requires; never change the `caiq:` storage key prefix.
- Do not start Category B items. Do not perform the app rename.
- Keep each item's diff scoped to the files its ROADMAP entry names (plus tests). If you
  must touch another file, say why in the commit body.

## 2. WORKSPACE

- Repo root: `C:\Users\Harry\Downloads\prymd\audit-snap-663` (git, branch `main`)
- App code: `expo/` subdirectory. Node 24 + bun 1.3 installed. `node_modules` already installed
  (`bun install` in `expo/` if ever missing).
- Reference docs: STATUS.md (defect details), ROADMAP.md (the work), ARCHITECTURE.md
  (how to build it), DECISIONS.md (append your decisions).
- Commit message style: `A<n>: <imperative summary>` e.g. `A1: add cross-platform dialog layer`.
  End with the standard Claude Code co-author trailer.

## 3. VERIFICATION COMMANDS (all from `expo/`)

```bash
bun install                              # only if node_modules missing
./node_modules/.bin/tsc.exe --noEmit     # typecheck (bare `npx tsc` does NOT work — bun shims)
bun run test                             # jest (13+ suites must stay green)
bun run lint                             # expo lint (fix new warnings you introduce)
```

## 4. WEB PREVIEW — how to run and DRIVE it (hard-won specifics, follow exactly)

### 4.1 Start
Use the Browser-pane tool: `preview_start {name: "clean-audit-iq-web"}` — the config
exists in `C:\Users\Harry\Downloads\prymd\.claude\launch.json` (npx expo start --web
--port 8091, cwd = the expo dir). Reuses a running server. First bundle ≈ 30–60s; watch
`preview_logs` for `Web Bundled`. NEVER start dev servers via raw Bash.

### 4.2 Ground rules learned in Phase 1
- **Coordinates for `computer` clicks are CSS pixels** (viewport 375×812 after
  `resize_window {preset: "mobile"}`), even though screenshots come back at 2×.
  Prefer measuring exact centers via `javascript_tool` + `getBoundingClientRect`.
- **URL never changes in the address bar, but deep links WORK**: navigate directly to
  `http://localhost:8091/project/<id>`, `/audit/<id>/hitlist`, `/audit/<id>/report`,
  `/audit/<id>/preview`, `/markup/<assetId>`, `/capture-session?auditId=<id>`, `/settings`.
- **Read app state directly from localStorage** (AsyncStorage web backend):
  keys `caiq:projects|audits|issues|assets|annotations|reports|outbox|settings` — use
  `javascript_tool` + `JSON.parse(localStorage.getItem('caiq:issues'))` to assert
  persistence in acceptance checks.
- **Buttons:** RN-web touchables sometimes miss raw clicks. Reliable tap helper
  (define once per page load via javascript_tool):
  ```js
  window.__tap = (tid) => { const b = document.querySelector(`[data-testid="${tid}"]`);
    if (!b) return 'NOT FOUND: '+tid; const r = b.getBoundingClientRect();
    const o = {bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerId:1,isPrimary:true};
    for (const [C,t] of [[PointerEvent,'pointerdown'],[MouseEvent,'mousedown'],[PointerEvent,'pointerup'],[MouseEvent,'mouseup'],[MouseEvent,'click']]) b.dispatchEvent(new C(t,o));
    return 'tapped '+tid; };
  ```
  Known testIDs: `start-capture`, `capture-done`, `capture-shutter`, `capture-gallery`,
  `save-next-photo`, `issue-title-input`, `markup-save`, `markup-close`, `markup-undo`,
  `tool-<name>`, `preview-report`, `generate-pdf`, `build-report`, `theme-<key>`.
  Add testIDs to new UI you build.
- **Drawing in Markup Studio:** `left_click_drag` does NOT register (missing buttons
  flag). Dispatch a stepped sequence of pointer+mouse events with `buttons:1` on moves
  (≥3 intermediate points, ~30ms apart) targeting `document.elementFromPoint` — see the
  working example in the Phase 1 transcript pattern; verify success by the header
  flipping to "UNSAVED CHANGES".
- **Text input:** click the input, then `computer type` real keystrokes (form_input alone
  may not update React state for validation paths — always verify the observable outcome).

### 4.3 Data reset
Settings → "Reset demo data" (after A1, its confirm dialog works on web), or
`javascript_tool`: `Object.keys(localStorage).filter(k=>k.startsWith('caiq:')).forEach(k=>localStorage.removeItem(k)); location.reload()` — fresh boot re-seeds the demo.

### 4.4 Console & network
After every flow: `read_console_messages {onlyErrors:true}` must be clean (the two known
deprecation warnings disappear after A8). Remote demo photos come from unsplash/picsum —
if offline they 404; that is environmental, not a defect.

### 4.5 Injecting files into the web file picker (for A6/A11 testing)
The OS file dialog cannot be driven. Instead, after clicking Gallery, locate the hidden
`<input type="file">` and inject programmatically:
```js
const dt = new DataTransfer();
const canvas = Object.assign(document.createElement('canvas'), {width: 1200, height: 900});
const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c1440e'; ctx.fillRect(0,0,1200,900);
ctx.fillStyle = '#fff'; ctx.font = '48px sans-serif'; ctx.fillText('TEST PHOTO', 40, 80);
const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
dt.items.add(new File([blob], 'test-photo.jpg', {type: 'image/jpeg'}));
const input = [...document.querySelectorAll('input[type=file]')].pop();
input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true}));
```
If no input exists in the DOM, expo-image-picker creates one on demand — trigger the
Gallery button first, then look again (it may be detached; query within 2s).

### 4.6 Verifying popup-gated browser APIs (window.open, etc.)
Confirmed in A2: real browsers require a *trusted* user gesture to allow `window.open()`.
Neither the synthetic `dispatchEvent`-based `window.__tap` helper (§4.2) nor this Browser
pane's `computer left_click`/ref-click reliably produce one here — clicks land (confirmed
via `getBoundingClientRect`/`read_page`) but the resulting `window.open()` call is silently
refused, exactly like a real popup blocker. Do not conclude a feature is broken from this
alone — it is an environment/browser-security limitation, not an app bug, and is itself
worth testing (the app's own popup-blocked fallback should fire safely with no side effects).
To verify the SUCCESS path of code that calls `window.open()`, inject a fake before tapping:
```js
window.open = () => ({
  document: { open(){}, write: (h) => { window.__capturedHtml = h; }, close(){}, readyState: 'complete' },
  addEventListener(){}, focus(){}, print: () => { window.__printCalled = true; }, close(){},
});
```
Then use `window.__tap(...)` (not `computer` clicks) and assert on `window.__capturedHtml` /
`window.__printCalled` afterward. This exercises the real app code path (state, data
resolution, HTML generation) without fighting the browser's popup policy. Separately, verify
the blocked-path fallback for real by tapping WITHOUT the fake installed and confirming the
app's own alert/guard fires with no destructive side effects (e.g. no bogus DB record).

## 5. PER-ITEM NOTES

- **A1:** grep count first (`grep -rn "Alert.alert" app components | wc -l`), convert
  mechanically, keep native behavior via the shim's native branch. The action-sheet modal
  is the only new UI — reuse `components/ui.tsx` Card/AppButton patterns.
- **A2:** decide the web ReportExport-record question yourself and log it in DECISIONS.md.
- **A3:** `git fetch origin` then `git cherry-pick 20d59277a58fa8b4fd74653e50bb97290878ff64`.
- **A6:** keep web images ≤1800px/0.72 JPEG data URIs; verify reload persistence via §4.3 keys.
- **A12:** CSV must pass an escaping unit test (commas, quotes, newlines in descriptions).

## 6. FINAL QA LOOP — flow checklist (each pass, in order)

1. Fresh data (§4.3) → home renders demo, no console errors.
2. New Project (all fields) → New Audit (defaults verified) → Start Capture.
3. Add photo via §4.5 injection → issue sheet → fill → Save & Next → Save & Review.
4. Hit list: filters, group modes, quick actions (status change, duplicate, exclude,
   delete with confirm) — all effective, counts update.
5. Markup: draw arrow + box + text + blur → save → reopen (elements editable) → hit-list
   thumbnail badge present.
6. Report Builder: each theme; toggle originals; Preview → Generate (A2 behavior);
   modify an issue → stale-report warning appears → regenerate.
7. Reports tab shows history (A9 behavior). Settings: edit branding fields, reset demo.
8. Edge cases: empty audit report guard, 0-photo issue, 120-char title, 2000-char
   description, 12+ issues in one audit (duplicate repeatedly), search no-results.
9. `bun run test` + typecheck + lint — all green.
Zero defects in one complete pass = done. Then make a final commit updating ROADMAP
PROGRESS to all-done and append a QA summary section to STATUS.md.
