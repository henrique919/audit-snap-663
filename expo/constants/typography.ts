/**
 * PunchThis typography system.
 *
 *   - Space Grotesk  (400 / 500 / 600 / 700) — headings, titles, wordmark
 *   - Hanken Grotesk (400 – 800)             — body copy, labels, UI chrome
 *
 * Wordmark rule: “Punch” = Space Grotesk 700 · “This” = Space Grotesk 400.
 * Never set both at the same weight.
 *
 * Loaded via @expo-google-fonts. Every StyleSheet references `fontFamily`
 * constants — never hard-code a font family string in a screen.
 */

import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from "@expo-google-fonts/hanken-grotesk";
import { useFonts } from "expo-font";

/**
 * Central font family constants. Every StyleSheet in the app references these
 * — never hard-code a font family string in a screen or component.
 */
export const fontFamily = {
  /** Space Grotesk 400 — wordmark “This”, light display. */
  headingRegular: "SpaceGrotesk_400Regular",
  /** Space Grotesk 500 — secondary headings. */
  headingMedium: "SpaceGrotesk_500Medium",
  /** Space Grotesk 600 — smaller headings, section headers. */
  headingSemi: "SpaceGrotesk_600SemiBold",
  /** Space Grotesk 700 — card titles, screen titles, wordmark “Punch”. */
  heading: "SpaceGrotesk_700Bold",
  /** Space Grotesk 700 — display titles / brand (no 800 cut in family). */
  headingHeavy: "SpaceGrotesk_700Bold",
  /** Hanken Grotesk 400 — body copy. */
  body: "HankenGrotesk_400Regular",
  /** Hanken Grotesk 500 — secondary text. */
  bodyMedium: "HankenGrotesk_500Medium",
  /** Hanken Grotesk 600 — emphasised body, chips. */
  bodySemibold: "HankenGrotesk_600SemiBold",
  /** Hanken Grotesk 700 — buttons, labels, pills. */
  bodyBold: "HankenGrotesk_700Bold",
  /** Hanken Grotesk 800 — uppercase micro-labels, badges. */
  bodyHeavy: "HankenGrotesk_800ExtraBold",
} as const;

/** CSS font stacks for HTML/PDF output (report generation).
 * PDF path ships these system stacks only — see lib/reportFonts.ts.
 * (Embedding TTFs exceeds the ~2 MB offline-font budget.)
 */
export const reportFontStack = {
  heading: `"Space Grotesk", -apple-system, "Segoe UI", Roboto, Arial, sans-serif`,
  body: `"Hanken Grotesk", -apple-system, "Segoe UI", Roboto, Arial, sans-serif`,
} as const;

/**
 * Loads the PunchThis font set. Returns true when ready (or when loading
 * failed — the app falls back to system fonts rather than blocking).
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });
  return loaded || error != null;
}
