/**
 * Save-state indicator logic shared by Markup Studio and Capture Session.
 *
 * `persistStatus` is a global signal on the whole store (one debounced flush
 * covers every table), so a local "saved"/"saving" flag can go stale: the
 * screen thinks its own write finished while the background flush to disk
 * is still pending or has actually failed. A persistence error always wins
 * over local state — never claim "saved" while the store reports otherwise.
 */

import type { PersistStatus } from "@/lib/persistence/types";

export type SaveIndicatorState = "error" | "saving" | "dirty" | "saved";

export interface SaveIndicatorInput {
  persistStatus: PersistStatus;
  saving: boolean;
  dirty: boolean;
}

export function saveIndicatorState({ persistStatus, saving, dirty }: SaveIndicatorInput): SaveIndicatorState {
  if (persistStatus === "error") return "error";
  if (saving) return "saving";
  if (dirty) return "dirty";
  return "saved";
}

export const SAVE_INDICATOR_LABEL: Record<SaveIndicatorState, string> = {
  error: "Save issue — see banner",
  saving: "Saving…",
  dirty: "Unsaved changes",
  saved: "Saved on device",
};

/**
 * Toast text for a record the caller has just tried to persist. Call sites
 * flush the pending write (`flushPersistNow`) BEFORE showing this toast, so
 * the status passed here reflects the outcome of THIS save, not a stale
 * earlier one — never claim "saved on device" for a write that failed.
 */
export function savedToastMessage(label: string, persistStatus: PersistStatus): string {
  return persistStatus === "error"
    ? `${label} NOT saved — storage problem, see banner`
    : `${label} saved on device`;
}
