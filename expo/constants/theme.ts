/**
 * Design system — CleanRun IQ design language, lighter product.
 *
 * Carbon/charcoal ink, restrained CleanRun green accent, mist neutral
 * surfaces, steel muted text. Typography: Archivo (headings) + Inter (body)
 * — see constants/typography.ts.
 */

import { Platform } from "react-native";

import { fontFamily } from "@/constants/typography";

export const palette = {
  /** Primary ink — CleanRun IQ carbon. */
  carbon: "#161A1D",
  carbonDeep: "#121619",
  charcoal: "#283238",
  charcoalSoft: "#39454D",

  /** CleanRun brand greens. */
  green: "#18A94F",
  greenBright: "#20C55E",
  greenSoft: "#EAFBF1",

  amber: "#C27803",
  amberSoft: "#FFF4DF",

  info: "#1D4ED8",
  infoSoft: "#EAF1FF",

  red: "#B42318",
  redSoft: "#FDECEC",

  white: "#FFFFFF",
  background: "#F4F6F8",
  surface: "#FFFFFF",
  surfaceAlt: "#EDF0F3",
  border: "#DDE3E8",
  borderStrong: "#B8C0C8",

  text: "#161A1D",
  textMuted: "#69747D",
  textFaint: "#96A0A9",
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const font = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 26,
    huge: 34,
  },
  /** Legacy numeric weights — prefer `font.family` (real Archivo/Inter cuts). */
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
  /** CleanRun IQ font families (Archivo headings / Inter body). */
  family: fontFamily,
} as const;

/**
 * `shadow*`/`elevation` are the native (iOS/Android) shadow API; react-native-web
 * warns on them and wants the standard CSS `boxShadow` string instead. Both
 * render the same visual card/floating shadow — this is the one place that
 * needs to know the difference (every consumer just spreads `shadow.card`).
 */
export const shadow = Platform.select({
  web: {
    card: { boxShadow: "0px 5px 12px rgba(22,26,29,0.07)" },
    floating: { boxShadow: "0px 8px 16px rgba(22,26,29,0.18)" },
  },
  default: {
    card: {
      shadowColor: "#161A1D",
      shadowOpacity: 0.07,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },
    floating: {
      shadowColor: "#161A1D",
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  },
})!;

/** Colors available in the markup studio palette. */
export const MARKUP_COLORS = [
  "#E53935",
  "#F59E0B",
  "#18A94F",
  "#1D4ED8",
  "#7C3AED",
  "#161A1D",
  "#FFFFFF",
] as const;
