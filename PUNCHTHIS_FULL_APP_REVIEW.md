# PunchThis — Full Product, UX, Market, and Launch Review

**Review date:** 18 July 2026  
**Surfaces reviewed:** live web app, public early-access page, and `origin/main` at commit `d90a38d`  
**Primary user journey:** project setup → audit setup → capture → issue record → markup → report builder → PDF/export → settings/data management

## Executive verdict

**PunchThis has a real product inside it, but it is not ready for an unrestricted App Store/Google Play launch.**

The strongest wedge is not “construction management.” It is much narrower and better:

> **A fast, offline-first photo-to-report tool for solo inspectors, site managers, defect consultants, and small builders who need a professional PDF without enterprise setup.**

The capture, markup, issue tracking, and report flow is coherent and visibly polished. The product earns its tagline, **“Punch it. Prove it. Close it.”** The problem is that “close it” currently ends at a PDF. It does not yet create the collaborative closeout loop that makes products such as Fieldwire, PlanRadar, Procore, and ArchiSnapper sticky.

### Launch recommendation

- **Go:** controlled PWA/TestFlight early access for 10–20 solo operators, with a prominent “stored only on this device” warning and direct founder support.
- **No-go:** broad public mobile-store launch, paid team plan, or claims of secure backup/collaboration.
- **Gate public launch on:** production app identifiers; privacy/terms/support pages; true deletion of media files; native-device testing; removal of unfinished controls; honest marketing screenshots; accessibility repairs; and a backup/export safety net.

## Product snapshot

### What PunchThis currently does well

- Creates projects and repeat audits with reusable locations, assignees, company details, and report branding.
- Captures photos from camera or gallery and supports batch processing.
- Creates numbered issues with title, description, location, assignee, status, priority, and report inclusion.
- Provides a serious markup studio: select, arrow, circle, box, pen, text, number, blur, crop, colour, stroke controls, undo/redo, and preserved originals.
- Supports hit-list filtering/grouping, issue duplication, status changes, and CSV export.
- Produces three useful PDF styles: Executive, Site Walk, and Handover.
- Supports annotated/original photo choices, image size, timestamps, locations, completed issues, grouping, sorting, preview, PDF generation, share, and email.
- Detects stale reports after issue/photo/markup changes.
- Has good persistence-failure handling, file cleanup, and a future-sync outbox architecture.

### Intended audience vs. actual launch audience

The landing page names site managers, inspectors, project-delivery teams, and handover teams. The current product is genuinely useful for the first two. It is not yet a credible team product because there are no accounts, roles, shared projects, real-time sync, contractor responses, notifications, due dates, approval history, or closeout links.

**Launch positioning should therefore target:**

- Independent building and defect inspectors
- Site supervisors and foremen producing client reports
- Small residential/commercial builders
- Architects and consultants conducting site walks
- Specialist trades documenting QA work

Avoid leading with “teams” until collaboration exists.

## End-to-end UX audit

### 1. Launch page — **Healthy presentation, weak proof**

![PunchThis mobile landing hero](.audit-output/screenshots/21-landing-mobile-390.png)

**Strengths**

- The job-to-be-done is clear within seconds: document site issues and generate professional reports.
- Strong, restrained brand system; the cobalt/graphite palette feels credible for construction.
- One primary conversion action and a short email form reduce friction.

**Risks**

- The hero mockup shows a desktop dashboard with locations, progress metrics, and interaction patterns that differ materially from the live app. This reads as a future product, not an accurate product screenshot.
- The page says “Designed for iOS, Android and web,” but gives no App Store/Play links, release status, pricing, privacy, security, support, founder/company identity, or proof from users.
- “Professional reports” is generic. The page does not show an actual downloadable sample PDF or quantify speed saved.
- The early-access form has no privacy/terms link near submission.

### 2. Home/projects — **Strong**

![PunchThis app home](.audit-output/screenshots/02-app-home.png)

**Strengths**

- “Continue last audit” is the right primary return-user action.
- Search, one clear New Project action, project status, and the oversized Capture tab create a field-first hierarchy.
- The design feels calm and professional rather than like a generic construction SaaS dashboard.

**Risks**

- Demo data looks like real customer data and is not labelled as a sample project.
- “On device” is too subtle for the product’s most important data-safety constraint.
- The default sample contains mismatched evidence later in the flow, which damages trust.

### 3. New project — **Healthy**

![New project setup](.audit-output/screenshots/16-new-project.png)

**Strengths**

- Only Project Name is required; optional fields are clearly marked.
- Logo and cover photo make the report benefit visible during setup.
- Empty submission produces a specific inline error and keeps the user on the form.

![New project validation](.audit-output/screenshots/17-new-project-validation.png)

**Risks**

- New users must understand “project,” “audit,” and “report theme” before capturing their first issue.
- “Client / Prepared for” mixes two concepts.
- There is no quick-start option for a one-off inspection.

### 4. Project overview — **Healthy for solo use**

![Project overview](.audit-output/screenshots/03-project-overview.png)

**Strengths**

- Counts, last updated time, current draft, locations, and assignees are easy to scan.
- Starting or continuing an audit is unambiguous.

**Risks**

- No overdue count, due dates, project health, recent activity, sent-report history, or collaborator state.
- Assignees are labels, not participants. Users may assume the assignee receives or can update the issue.

### 5. Audit setup — **Functional, one screen too early**

![New audit setup](.audit-output/screenshots/18-new-audit.png)

**Strengths**

- Useful defaults from the project reduce typing.
- Recent location chips are good field ergonomics.

**Risks**

- The default title uses US date formatting (`7/18/2026`) while the field below uses ISO and the seeded address is Australian.
- The title says Site Walk while the default report theme is Executive, creating a small but visible mismatch.
- Long project names clip in the header.
- The user still has not reached the camera after two setup screens.

### 6. Capture session — **Excellent core, visibly unfinished**

![Active capture session](.audit-output/screenshots/04-capture-session.png)

**Strengths**

- This is the product’s best screen: issue count, default location, save state, recent captures, gallery, and a dominant shutter.
- Dark mode creates good focus during a walkthrough.

**Risks**

- **Voice is a dead production control.** Tapping it only says the feature is coming later. Remove it or ship it.
- The recent-capture thumbnails are small and identified mostly by numbers; long walkthroughs need location/title context.
- No timer, progress target, or obvious “review all issues” path is visible until Done.

### 7. Issue record — **Good structure, critical demo failure**

![Issue detail](.audit-output/screenshots/05-issue-detail.png)

**Strengths**

- Status and priority are quick to change.
- Original preservation and separate markup storage are excellent trust cues.

**Critical trust defect**

- Issue #008 is titled “Temporary switchboard unsecured — signage non-compliant” but the evidence is an American flag. A launch reviewer or prospect will assume AI hallucination, broken photo linkage, or fake demo content.

**Other risks**

- Title editing is hidden behind “Tap to edit title.”
- Below-the-fold location/assignee fields are easy to miss.
- There is no due date, trade/contact detail, comment thread, activity log, verification evidence, or “before/after” pairing.

### 8. Markup studio — **Differentiated, accessibility-heavy**

![Markup studio](.audit-output/screenshots/19-markup-editor.png)

**Strengths**

- The toolset is unusually complete for a focused inspection app.
- Vector-style annotations, preserved originals, blur, numbering, and crop directly support report clarity.
- The full-screen dark environment feels purpose-built.

**Risks**

- Nine tools, colour swatches, stroke sizes, undo, redo, rotate, and erase create a steep first-use learning curve.
- Labels are tiny and several controls rely on icon recognition and colour alone.
- Code inspection found almost no accessibility labels/states across these controls.
- Blur wording must distinguish exported redaction from the original photo that remains on the device.

### 9. Reports and builder — **Powerful, over-configured**

![Reports tab](.audit-output/screenshots/07-reports-tab.png)

![Report builder](.audit-output/screenshots/08-report-builder.png)

![Report builder options](.audit-output/screenshots/10-report-builder-preview.png)

**Strengths**

- Three report presets map to real jobs rather than cosmetic themes.
- Options are comprehensive and grouped logically.
- Grouping by location/assignee and sorting by issue/capture order are useful.

**Risks**

- The builder exposes every switch before the user sees the result. Most users want “Site Walk,” “Client,” or “Handover,” then Preview.
- The selected preset does not summarize the exact effect on sections, density, or ordering.
- “Completed issues — Off = live/open issues only” is easy to misread because the switch state and helper text compete.

### 10. Preview/export — **Excellent confidence-building step**

![PDF preview](.audit-output/screenshots/11-report-preview.png)

![PDF export actions](.audit-output/screenshots/12-report-preview-actions.png)

**Strengths**

- The user sees approximate pages, file size, photo count, hit list, and item-page treatment before generating.
- Stale-report handling and explicit privacy-redaction messaging are strong details.
- Share and Email match the natural endpoint of a site walk.

**Risks**

- The preview is not a page-accurate PDF preview; it is a representative summary.
- Share and Email look active before a PDF exists, although the code generates one on demand.
- There is no issued-to/sent-to history, immutable version number, document revision, approval, delivery confirmation, or disclaimer.

### 11. Settings/data — **Honest copy, unsafe deletion semantics**

![Settings](.audit-output/screenshots/13-settings.png)

![Storage and data controls](.audit-output/screenshots/15-settings-about.png)

**Strengths**

- Branding, default inspector/company, report footer, and report theme are sensible.
- Local-first status is disclosed.
- Persistence failures and stale reports are handled more thoughtfully than in many early products.

**Critical risks**

- “Clear all data” clears the AsyncStorage records but does **not** immediately delete native media files. Those files become orphans and are eligible for later cleanup after a 24-hour age gate. The UI promise “Delete every project, audit and photo on this device” is therefore inaccurate.
- The app stores the full database as unencrypted JSON arrays in AsyncStorage. Native photos and reports live as files. This is not an appropriate basis for a blanket “secure” claim.
- “Cloud backup, multi-device sync and web access arrive in a future update” takes valuable settings space and makes the product feel unfinished.
- There is no version/build number, privacy policy, terms, support link, contact address, export-all/backup, or diagnostic information.

## Accessibility review

This is a **risk assessment, not a WCAG certification**. Screenshots cannot verify screen-reader output, dynamic type, keyboard order, focus trapping, or native permission flows.

### Confirmed or highly likely issues

- Shared buttons, chips, segmented controls, toggles, and most markup controls have no explicit accessibility roles, labels, hints, or selected/checked states in the code. Only a handful of isolated controls do.
- The shared `Field` comment says an error is marked invalid for accessibility, but the implementation only changes the border and adds text; it does not expose an invalid state.
- Colour contrast is a launch risk:
  - `#96A0A9` on white is about **2.66:1**.
  - Cobalt `#4C82FF` on white is about **3.53:1**, too low for normal-size text.
  - Amber `#E5A016` on white is about **2.24:1**.
- Status and priority rely heavily on coloured pills/dots.
- The 11px uppercase microcopy and dense markup toolbar will be difficult under zoom or large text settings.
- Camera, gallery, markup, destructive actions, and the report switches need physical-device screen-reader and switch-control testing.

### Accessibility priority

1. Fix shared primitives first: Button, Chip, ToggleRow, Segmented, Field, tabs, icon-only controls.
2. Add selected/checked/disabled/invalid states and descriptive labels.
3. Raise contrast for faint text and cobalt/amber text-on-light combinations.
4. Test VoiceOver and TalkBack through one complete capture-to-report journey.
5. Test 200% text scaling and keyboard navigation on web.

## Competitive teardown

| Competitor | What it has that PunchThis lacks | What PunchThis can exploit |
|---|---|---|
| **Fieldwire** | Plan/drawing pins, due dates, comments, notifications, checklists/templates, automated reports, configurable statuses, two-step verification, real-time team sync, offline projects | Fieldwire’s reporting/export tier starts at **US$39/user/month billed annually**. PunchThis can be dramatically simpler for one inspector who does not need full field management. [Official pricing](https://www.fieldwire.com/pricing/) · [Punch-list features](https://www.fieldwire.com/punch-list-app/) |
| **PlanRadar** | Plans/BIM, photo/video/voice, QR/NFC access, deadlines, signatures, conditional/checklist fields, approval workflows, document management, MFA/biometric controls, free subcontractor viewers | PunchThis has a cleaner photo-to-PDF workflow. Avoid copying the platform; beat it on time-to-first-report. [Official pricing/features](https://www.planradar.com/us/pricing/) · [Snagging product](https://www.planradar.com/gb/product/snagging-software/) |
| **SafetyCulture** | Inspection templates, conditional logic, corrective actions, schedules, analytics, permissions, team management, training, integrations, IoT | PunchThis is more specialized and visually stronger for defect evidence and client-ready reports. [Official product](https://safetyculture.com/iauditor) |
| **ArchiSnapper** | Clone the previous report, checklist/category templates, floor-plan observations, contractor-specific links/emails, free contractor feedback, sign-off, sent history, Dropbox/Google Drive backup | PunchThis has a more modern interface and richer markup experience. [Contractor distribution](https://docs.archisnapper.com/reference/how-to-send-every-contractor-his-own-items) · [Plan issues](https://docs.archisnapper.com/reference/add-issues-on-drawings) |
| **Procore** | Due dates, notifications, roles/permissions, action history, drawing pins, QR quick capture, voice/video capture, live assignee responses | PunchThis should not compete head-on with Procore. It should be the lightweight specialist tool that produces a polished report without an enterprise rollout. [Official punch-list product](https://www.procore.com/en/project-management/punch-list) |

### The missing capability that matters most

It is **not AI** and it is not BIM. It is the **contractor closeout loop**:

1. Inspector assigns an issue.
2. Contractor receives only their items without buying a seat.
3. Contractor adds a completion photo and marks ready for review.
4. Inspector verifies or rejects.
5. The report and audit trail update automatically.

That loop creates retention, collaboration, and defensibility. Today PunchThis exports a document and exits the workflow.

## Market fit

### Strong market-fit hypothesis

There is room below enterprise platforms for a product that gives a solo operator:

- A first issue in under 60 seconds
- No account or rollout project
- Reliable offline use
- Clear photo markup
- A professional, branded PDF before leaving site
- Predictable non-seat-based pricing

### Weak market-fit hypothesis

PunchThis is not yet credible as a shared system of record for project-delivery or handover teams. Those buyers expect central backup, permissions, an audit trail, collaboration, due dates, notifications, and integrations.

### Product category recommendation

Position it as **“site inspection reporting”** or **“photo punch reporting”**, not broad construction management. The landing page already moves in the right direction.

## Launch risk analysis

### P0 — must fix before public store submission

1. **Production identity is unfinished.** iOS bundle ID, Android package, and URL scheme remain Rork placeholders (`app.rork.fsowpwobeaoqe5smtpb03`, `rork-app`).
2. **No privacy policy in the app or launch site.** Apple requires an accessible in-app privacy-policy link and App Store Connect metadata; Google Play requires an in-app/public policy and an accurate Data Safety declaration—even for apps claiming no collection. [Apple guideline 5.1.1](https://developer.apple.com/app-store/review/guidelines/) · [Google User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
3. **Deletion promise is inaccurate on native.** Clear All Data leaves media files until later garbage collection. Fix deletion before writing a retention/deletion policy.
4. **No Terms, Support, or accountable publisher identity.** Add legal entity/developer name, contact, support URL, privacy, terms, version, and build.
5. **Plain local storage with no backup.** AsyncStorage JSON and device files are acceptable for an early-access offline tool only if the risk is prominent. Add export-all/backup or cloud backup before selling it as dependable recordkeeping.
6. **Native acceptance testing is missing from the evidence.** Test camera permissions, photo-library limited access, very large galleries, low storage, backgrounding during a save, app upgrade, PDF generation, email/share, deletion, and restore across current iOS/Android devices.
7. **Remove unfinished UI and false product proof.** Remove Voice, reduce future-sync UI, replace mismatched demo photos, and use screenshots of the actual app on the landing page.
8. **Accessibility remediation.** App Review may reject a visibly broken experience even when accessibility is not the stated reason.
9. **No automated CI workflow.** The repository contains strong unit-test claims but no GitHub Actions workflow enforcing tests, typecheck, or lint on every merge.
10. **Name clearance.** “PunchThis” is more distinctive than “Punch,” but the category already contains Punch Construction, Punch time tracking, and FastPunch. Perform formal Australian and target-market clearance before investing in store assets. IP Australia itself recommends searching similar spellings/sounds, not only exact matches. [IP Australia search guidance](https://search.ipaustralia.gov.au/trademarks/)

### Security/privacy risks

- Photos can contain faces, addresses, number plates, access controls, plans, client branding, and safety defects.
- Inspector/assignee/company data can be personal information.
- Email/share exports leave the app and inherit the security of the recipient channel.
- Original photos remain on-device even when exported copies are blurred.
- Future cloud sync will require authentication, authorization, tenant separation, encryption in transit/at rest, deletion, incident response, backup/restore, and cross-border disclosure review.
- If accounts are added, Apple requires in-app account deletion and Google requires both an in-app path and a public web deletion route. [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app) · [Google account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- For Australian launch, review the current APP Guidelines and applicability to the operating entity rather than assuming the employee-records exemption covers subcontractor/client data. [OAIC APP Guidelines](https://www.oaic.gov.au/__data/assets/pdf_file/0019/258121/Consolidated-APP-guidelines.pdf)

### Recommended in-app/store wording

Disclaimers do not “avoid bans.” They must match actual behaviour and sit alongside real controls.

**Product scope**

> PunchThis is a documentation and workflow tool. It does not certify regulatory compliance, workmanship, safety, completion, or contractual performance. Users remain responsible for professional judgment, verification, and distribution of records.

**Local-storage warning**

> Until cloud backup is enabled, projects, photos, and reports are stored only on this device. Losing the device, deleting the app, or clearing data may permanently remove them. Export important records regularly.

**Camera/photo permission**

> PunchThis uses your camera and selected photos to attach site evidence to inspection items. Content stays on this device unless you choose to share or email it.

**Blur/redaction**

> Blur is permanently applied to generated/exported copies. The original source photo remains on this device until you delete it.

**Report footer option**

> Prepared from information recorded by the named inspector on the stated date. Review the report and source evidence before relying on it.

## Three high-impact UX/retention changes

### 1. Add “Quick Walk” and make first evidence the onboarding

From Capture, offer **Quick Walk**: choose an existing project or type a project name, then open the camera. Create the audit in the background with sensible defaults. Ask for client, branding, and report preset after the first saved issue.

**Target:** first issue saved in under 60 seconds.

### 2. Turn Done into the closeout hub

After Done, show one screen with:

- Missing title/location/assignee warnings
- Open/assigned/in-progress/completed counts
- Duplicate/weak-photo checks
- “Send assignee packs”
- “Preview client report”

This bridges capture and reporting and creates a reason to return.

### 3. Replace report switches with presets + Advanced

Make Site Walk, Client Report, and Handover the primary choices. Show a one-line summary and a miniature preview. Put the current switches under **Advanced options**. Remember the choice per project.

## Retention roadmap

### Highest leverage

1. Contractor closeout links with completion photo and Verify/Reject.
2. Due dates, overdue views, reminders, and two-step completion.
3. Clone previous audit/report and reusable defect/checklist templates.
4. Backup/sync with explicit offline state and conflict handling.
5. Issued-report history: recipient, version, sent time, source record, and stale/current status.

### Valuable later

- Floor-plan pinning
- QR codes per room/asset
- Voice-to-issue
- AI title/trade suggestions
- Analytics across projects
- Integrations

Do not build AI before the closeout loop and data safety are solved.

## Monetization recommendation

The code currently grants a founder plan with every entitlement and has no real IAP/paywall. Treat monetization as unimplemented.

### Early-access offer

- **Founding Inspector:** one-time A$149–199, local-first, unlimited projects/reports, custom branding, CSV, and all report themes.
- Include 12 months of updates, not a promise of lifetime cloud service.
- Use this to validate willingness to pay before building billing infrastructure.

### Post-sync packaging

- **Free:** one active project, limited reports, sample branding.
- **Solo Pro:** A$19–29/month or discounted annual; unlimited local projects, custom branding, templates, backup.
- **Team:** A$59–99/month including 3 internal users; contractor links free; due dates, verification, cloud sync, permissions, issued-report history.

Avoid per-subcontractor pricing. “Send the fix list without buying every trade a seat” is a strong future wedge.

## Three launch USPs

### 1. From first photo to client-ready PDF—before you leave site

PunchThis is not another project-management rollout. Capture, mark up, organise, preview, and share one professional record in the same walk.

### 2. Mark the evidence so the fix is unmissable

Arrows, boxes, numbers, text, crop, and privacy blur produce clear instructions while preserving the source photo.

### 3. Built for the inspector, not priced like an enterprise platform

Fast offline capture, branded reports, and simple solo pricing—without paying per user just to produce a defect report.

## Prioritised action plan

### Before any public paid launch

- Replace bundle/package/scheme identifiers and complete native manifests.
- Fix Clear All Data to delete every owned media/report/logo file immediately.
- Add privacy, terms, support, developer identity, version/build, and export/backup.
- Replace all mismatched demo evidence and label the demo project.
- Remove Voice and future-feature controls from production.
- Replace the landing mockup with real app screenshots and a sample PDF.
- Repair shared accessibility primitives and colour contrast.
- Add CI for test, typecheck, and lint.
- Run a physical-device release-candidate matrix.

### Next product milestone

- Quick Walk
- Due dates and verification
- Contractor closeout links
- Clone/templates
- Report issue/sent history

### Then

- Cloud sync/auth/roles
- Monetization
- Plans/QR/voice/AI as validated by customers

## Evidence limits

- The live app was audited through its web build at a 390×844 viewport. Native camera permission sheets, photo-library permission modes, haptics, background saves, file protection, PDF sharing, email composition, and app-upgrade migration were not directly verified.
- The early-access form was inspected but not submitted, because submission would create an external side effect.
- Accessibility findings combine visible evidence and repository inspection; they are not a formal WCAG audit.
- Competitor claims come from current official product/help/pricing pages and should be rechecked before using prices in public marketing.
- This is product/compliance risk guidance, not legal advice or trademark clearance.
