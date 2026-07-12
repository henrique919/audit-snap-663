/** Shared persistence result / status types. */

export type PersistResult = { ok: true } | { ok: false; error: string };

export type PersistStatus = "idle" | "saving" | "error";
