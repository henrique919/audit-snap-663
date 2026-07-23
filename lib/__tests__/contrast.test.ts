/**
 * LP-06 accessibility regression suite — every text-role token pair touched
 * by the contrast fix must clear WCAG AA (4.5:1 normal text). Backgrounds
 * are the actual near-white surfaces used behind these tokens in the app
 * (`palette.surface`/white, `palette.background`, `palette.surfaceAlt`,
 * `palette.amberSoft`), not just pure white, since `surfaceAlt` is the
 * hardest (lowest-luminance) "light" surface in the palette.
 */

import { contrastRatio, relativeLuminance, WCAG_AA_NORMAL } from "@/lib/contrast";
import { palette } from "@/constants/theme";

describe("contrastRatio / relativeLuminance", () => {
  it("gives black-on-white the maximum 21:1 ratio", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("gives identical colours a 1:1 ratio", () => {
    expect(contrastRatio("#4C82FF", "#4C82FF")).toBeCloseTo(1, 2);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio(palette.text, palette.background)).toBeCloseTo(
      contrastRatio(palette.background, palette.text),
      5,
    );
  });

  it("white has luminance 1 and black has luminance 0", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
});

describe("LP-06 fixed token pairs meet WCAG AA", () => {
  const lightSurfaces = [
    ["surface / white", palette.surface],
    ["background", palette.background],
    ["surfaceAlt (hardest near-white)", palette.surfaceAlt],
  ] as const;

  describe("textFaint (light-surface hint/caption text)", () => {
    it.each(lightSurfaces)("≥4.5:1 against %s", (_label, bg) => {
      expect(contrastRatio(palette.textFaint, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe("textFaintOnDark (faint icons/text on dark carbon surfaces)", () => {
    it("≥4.5:1 against carbonDeep (dark capture/markup backgrounds)", () => {
      expect(contrastRatio(palette.textFaintOnDark, palette.carbonDeep)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe("cobaltText (cobalt-as-text/link on light surfaces)", () => {
    it.each(lightSurfaces)("≥4.5:1 against %s", (_label, bg) => {
      expect(contrastRatio(palette.cobaltText, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe("cobaltDeep (fill behind white button/chip/segment labels)", () => {
    it("white label ≥4.5:1 against the fill", () => {
      expect(contrastRatio(palette.white, palette.cobaltDeep)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe("amberText (amber-as-text/icon-as-text on light surfaces)", () => {
    it.each(lightSurfaces)("≥4.5:1 against %s", (_label, bg) => {
      expect(contrastRatio(palette.amberText, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it("≥4.5:1 against its own soft badge background (amberSoft)", () => {
      expect(contrastRatio(palette.amberText, palette.amberSoft)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });

  describe("status pill text", () => {
    it("red-on-redSoft is AA normal", () => {
      expect(contrastRatio(palette.red, palette.redSoft)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });

    it("green-on-greenSoft is AA normal", () => {
      expect(contrastRatio(palette.green, palette.greenSoft)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    });
  });
});
