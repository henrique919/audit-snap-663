/**
 * Design system — PunchThis.
 *
 * Graphite ink · blueprint cobalt · mist surfaces. Status colours map 1:1
 * to issue lifecycle. Typography: Space Grotesk (headings) + Hanken Grotesk
 * (body) — see constants/typography.ts.
 */

import { Platform } from "react-native";

import { fontFamily } from "@/constants/typography";

export const palette = {
  /** Graphite Ink — headings, dark surfaces, secondary buttons, splash. */
  carbon: "#1C232B",
  carbonDeep: "#12181F",
  charcoal: "#22303C",
  charcoalSoft: "#39454D",

  /** Blueprint Cobalt — primary actions, capture, markers, links, active nav.
   * `cobalt` itself is ~3.5:1 on white — too low for AA text (4.5:1) and for a
   * white label on top of it as a fill. Use `cobaltText` for cobalt-as-text on
   * light surfaces, and `cobaltDeep` (darkened below its original decorative
   * value) as the fill behind white button/chip/segment labels. */
  cobalt: "#4C82FF",
  cobaltText: "#2B5FCC",
  cobaltDeep: "#2857D6",
  cobaltSoft: "#EAF1FF",

  /** Success / verified. */
  /** AA-safe success text on white and greenSoft. */
  green: "#147A45",
  greenBright: "#2BB56A",
  greenSoft: "#E7F3EC",

  /** Assigned / warning / medium priority. `amber` itself is too light for
   * AA text (~2.4:1 on white); `amberText` is the compliant darkened variant
   * (≥4.5:1 on white and on `amberSoft`) for text/icon-as-text roles. */
  amber: "#E5A016",
  amberSoft: "#FDF3E0",
  amberText: "#92600A",

  /** Alias for cobalt as info (in-progress). */
  info: "#4C82FF",
  infoSoft: "#EAF1FF",

  /** Open / high / destructive. */
  /** AA-safe on redSoft and white for status labels. */
  red: "#B63232",
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
  /** Darkened from the original #96A0A9 (~2.7:1 on white, failed AA) so
   * textFaint reaches ≥4.5:1 against every near-white surface in the app
   * (white, `background`, `surfaceAlt`). Use `textFaintOnDark` — the
   * original light value — for faint text/icons on dark (carbon) surfaces. */
  textFaint: "#616B78",
  textFaintOnDark: "#96A0A9",
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

/**
 * Web-only content width cap. Operational screens (project list, project
 * detail, capture session, issue detail) render as `flex:1` views that
 * stretch edge-to-edge on native — correct there, since a phone is never
 * wider than this — but the same layout also renders on web, where a
 * wide desktop viewport stretched a phone-shaped list/detail layout to
 * ~1600px with long unreadable line lengths and no real desktop shell
 * (design audit H-07). Until a real desktop workspace (sidebar + bounded
 * canvas + detail rail) exists, cap those screens at `webMaxWidth` and
 * center them - gated to `Platform.OS === "web"` so native is untouched.
 */
export const layout = {
  webMaxWidth: 960,
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
  "#B63232",
  "#E5A016",
  "#147A45",
  "#4C82FF",
  "#7B61E0",
  "#1C232B",
  "#FFFFFF",
] as const;
