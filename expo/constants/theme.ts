/**
 * Design system — premium, clean, field-ready.
 * Deep navy primary, restrained green accent, soft neutral surfaces.
 */

export const palette = {
  navy: "#0E1F3A",
  navyDeep: "#0A1830",
  navyMid: "#16294A",
  navySoft: "#1E3357",

  green: "#16A34A",
  greenBright: "#22C55E",
  greenSoft: "#DCFCE7",

  amber: "#F59E0B",
  amberSoft: "#FEF3C7",

  sky: "#0EA5E9",
  skySoft: "#E0F2FE",

  red: "#DC2626",
  redSoft: "#FEE2E2",

  white: "#FFFFFF",
  background: "#F4F6F9",
  surface: "#FFFFFF",
  surfaceAlt: "#EEF1F6",
  border: "#E3E8F0",
  borderStrong: "#CDD5E1",

  text: "#0E1B2E",
  textMuted: "#5A6B82",
  textFaint: "#8A98AC",
} as const;

export const radius = {
  sm: 8,
  md: 12,
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
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },
} as const;

export const shadow = {
  card: {
    shadowColor: "#0E1B2E",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: "#0E1B2E",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/** Colors available in the markup studio palette. */
export const MARKUP_COLORS = [
  "#E53935",
  "#F59E0B",
  "#16A34A",
  "#0EA5E9",
  "#7C3AED",
  "#0E1F3A",
  "#FFFFFF",
] as const;
