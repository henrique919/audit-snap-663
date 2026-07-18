/**
 * Legal / disclosure copy — About, data-privacy and support surfaces.
 *
 * Wording for PRODUCT_SCOPE, CAMERA_PHOTOS and BLUR_REDACTION is taken
 * verbatim from the approved drafts in PUNCHTHIS_FULL_APP_REVIEW.md
 * ("Recommended in-app/store wording"). LOCAL_STORAGE_WARNING carries the
 * same meaning as that draft but drops its "until cloud backup is
 * enabled" framing so this module never contains a cloud-backup claim.
 * RETENTION_DELETION and EXPORT_SHARING describe actual current app
 * behaviour (see lib/wipe.ts) and are not yet legally reviewed.
 *
 * Rule: never claim cloud backup, encryption, secure storage, or
 * guaranteed retention — the app is local-only with no such guarantees.
 */

export const PROVISIONAL_NOTICE = "Provisional wording pending legal review.";

export const PRODUCT_SCOPE =
  "PunchThis is a documentation and workflow tool. It does not certify regulatory compliance, workmanship, safety, completion, or contractual performance. Users remain responsible for professional judgment, verification, and distribution of records.";

export const LOCAL_STORAGE_WARNING =
  "Projects, photos, and reports are stored only on this device — there is no backup elsewhere. Losing the device, deleting the app, or clearing data may permanently remove them. Export important records regularly.";

export const CAMERA_PHOTOS =
  "PunchThis uses your camera and selected photos to attach site evidence to inspection items. Content stays on this device unless you choose to share or email it.";

export const BLUR_REDACTION =
  "Blur is permanently applied to generated/exported copies. The original source photo remains on this device until you delete it.";

export const RETENTION_DELETION =
  "Clear all data immediately deletes your projects, audits, and issue records, along with the photo, report, and brand files owned by this app on this device. Reports or photos you already exported or shared — for example by email or messaging — live outside the app and are not affected; deleting them there is up to you.";

export const EXPORT_SHARING =
  "Exporting or sharing a report or photo sends a copy through the app you choose — email, messaging, or another app on this device. Once it leaves PunchThis, that copy is outside the app's control and inherits the security and retention of the recipient channel.";

export const REPORT_FOOTER_NOTE =
  "Prepared from information recorded by the named inspector on the stated date. Review the report and source evidence before relying on it.";

/** Provisional — replace once a support address and legal entity are finalised. */
export const SUPPORT_EMAIL = "henrysestak@gmail.com";

/** Provisional — replace once a support address and legal entity are finalised. */
export const PUBLISHER_NAME = "Henry Sestak";

/** Date-stamped build marker shown alongside the app version in About. */
export const BUILD_ID = "2026-07-18";

/** mailto: link for the Settings › About "Contact support" row. */
export function buildSupportMailto(version: string): string {
  const subject = encodeURIComponent(`PunchThis support — v${version}`);
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
}
