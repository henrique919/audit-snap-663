/**
 * Entitlement stub (ARCHITECTURE.md §3). Local-only, everything unlocked —
 * `plan: "founder"` with every feature true. UI code must call `isEntitled`
 * only; never branch on `plan` or feature flags directly, so the real IAP
 * swap-in (B3) needs no component changes once `refreshEntitlements` talks
 * to RevenueCat/StoreKit and flips the stub default to "free".
 */

export type FeatureKey =
  | "csv_export"
  | "custom_themes"
  | "cloud_backup"
  | "multi_project"
  | "closeout_links";

export interface Entitlements {
  plan: "free" | "pro" | "founder";
  features: Record<FeatureKey, boolean>;
}

const STUB_ENTITLEMENTS: Entitlements = {
  plan: "founder",
  features: {
    csv_export: true,
    custom_themes: true,
    cloud_backup: true,
    multi_project: true,
    closeout_links: true,
  },
};

export function getEntitlements(): Entitlements {
  return STUB_ENTITLEMENTS;
}

/** Gates fail OPEN in the stub — every feature is unlocked until B3 lands. */
export function isEntitled(feature: FeatureKey): boolean {
  return getEntitlements().features[feature];
}

/** No-op until B3 (IAP) implements it against RevenueCat/StoreKit. */
export async function refreshEntitlements(): Promise<void> {
  return;
}
