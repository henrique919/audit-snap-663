/**
 * CleanRun IQ typography system.
 *
 * The CleanRun IQ product family uses:
 *   - Archivo  (600 / 700 / 800) — headings, screen titles, item numbers, stats
 *   - Inter    (400 – 800)       — body copy, labels, UI chrome
 *
 * Both are loaded from Google Fonts via @expo-google-fonts, which matches the
 * exact families used by the CleanRun IQ web app
 * (`--font-heading: "Archivo"; --font-body: "Inter"`).
 *
 * TODO(brand): If custom/licensed CleanRun IQ font files are supplied later,
 * drop the .ttf/.otf files into `assets/fonts/`, register them in
 * `useAppFonts()` below, and update the `fontFamily` constants — nothing else
 * in the app needs to change.
 */

import {
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from "@expo-google-fonts/archivo";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";

/**
 * Central font family constants. Every StyleSheet in the app references these
 * — never hard-code a font family string in a screen or component.
 */
export const fontFamily = {
  /** Archivo 600 — smaller headings, section headers. */
  headingSemi: "Archivo_600SemiBold",
  /** Archivo 700 — card titles, screen titles. */
  heading: "Archivo_700Bold",
  /** Archivo 800 — display titles, big numbers, brand wordmark. */
  headingHeavy: "Archivo_800ExtraBold",
  /** Inter 400 — body copy. */
  body: "Inter_400Regular",
  /** Inter 500 — secondary text. */
  bodyMedium: "Inter_500Medium",
  /** Inter 600 — emphasised body, chips. */
  bodySemibold: "Inter_600SemiBold",
  /** Inter 700 — buttons, labels, pills. */
  bodyBold: "Inter_700Bold",
  /** Inter 800 — uppercase micro-labels, badges. */
  bodyHeavy: "Inter_800ExtraBold",
} as const;

/** CSS font stacks for HTML/PDF output (report generation).
 * PDF path ships these system stacks only — see lib/reportFonts.ts.
 * (Embedding Archivo+Inter TTFs exceeds the ~2 MB offline-font budget.)
 */
export const reportFontStack = {
  heading: `Archivo, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`,
  body: `Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`,
} as const;

/**
 * Loads the CleanRun IQ font set. Returns true when ready (or when loading
 * failed — the app falls back to system fonts rather than blocking).
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  return loaded || error != null;
}
