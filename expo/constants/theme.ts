/**
 * Design system — PunchThis.
 *
 * Graphite ink · blueprint cobalt · mist surfaces. Status colours map 1:1
 * to issue lifecycle. Typography: Space Grotesk (headings) + Hanken Grotesk
 * (body) — see constants/typography.ts.
 */

import { fontFamily } from "@/constants/typography";

export const palette = {
  /** Graphite Ink — headings, dark surfaces, secondary buttons, splash. */
  carbon: "#1C232B",
  carbonDeep: "#12181F",
  charcoal: "#22303C",
  charcoalSoft: "#39454D",

  /** Blueprint Cobalt — primary actions, capture, markers, links, active nav. */
  cobalt: "#4C82FF",
  cobaltDeep: "#2F6BFF",
  cobaltSoft: "#EAF1FF",

  /** Success / verified. */
  green: "#1E9E5A",
  greenBright: "#2BB56A",
  greenSoft: "#E7F3EC",

  /** Assigned / warning / medium priority. */
  amber: "#E5A016",
  amberSoft: "#FDF3E0",
  amberText: "#B57709",

  /** Alias for cobalt as info (in-progress). */
  info: "#4C82FF",
  infoSoft: "#EAF1FF",

  /** Open / high / destructive. */
  red: "#C93B3B",
  redSoft: "#FBEBEB",

  /** For-review (reserved for future status). */
  review: "#7B61E0",
  reviewSoft: "#EEEAFB",
  reviewText: "#5B41C0",

  /** Neutrals. */
  white: "#FFFFFF",
  background: "#F2F4F6",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF1F3",
  border: "#DDE3E8",
  borderStrong: "#B8C0C8",
  steel: "#7E8B96",

  text: "#1C232B",
  textMuted: "#69747D",
  textFaint: "#96A0A9",
  /** Wordmark “This” weight colour. */
  textSteel: "#A2ACB5",
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
  /** Legacy numeric weights — prefer `font.family` (real Space/Hanken cuts). */
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
  /** PunchThis font families (Space Grotesk headings / Hanken Grotesk body). */
  family: fontFamily,
} as const;

export const shadow = {
  card: {
    shadowColor: "#1C232B",
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  floating: {
    shadowColor: "#1C232B",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/** Colors available in the markup studio palette. */
export const MARKUP_COLORS = [
  "#C93B3B",
  "#E5A016",
  "#1E9E5A",
  "#4C82FF",
  "#7B61E0",
  "#1C232B",
  "#FFFFFF",
] as const;
