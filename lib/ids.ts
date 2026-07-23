import * as Crypto from "expo-crypto";

/** UUID generated on-device so records can be created fully offline. */
export function newId(): string {
  try {
    return Crypto.randomUUID();
  } catch (e) {
    console.log("[ids] randomUUID failed, using fallback", e);
    return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
