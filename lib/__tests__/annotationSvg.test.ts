import {
  arrowHeadPoints,
  elementsToOverlaySvg,
  elementsToSvgInner,
  estimateTextWidthPx,
  strokePx,
} from "@/lib/annotationSvg";
import type { AnnotationElement } from "@/types/models";

describe("SVG annotation serialisation", () => {
  test("scales stroke and text measurements", () => {
    expect(strokePx(10, 500)).toBe(5);
    expect(strokePx(0.1, 500)).toBe(1);
    expect(estimateTextWidthPx("abcd", 20)).toBeCloseTo(46.4);
    expect(estimateTextWidthPx("", 20)).toBe(12);
  });

  test("emits an arrow line and polygon with the calculated head", () => {
    const arrow: AnnotationElement = {
      id: "a",
      type: "arrow",
      x1: 0.1,
      y1: 0.2,
      x2: 0.5,
      y2: 0.2,
      stroke: "#FF0000",
      strokeWidth: 10,
    };
    const svg = elementsToSvgInner([arrow], 1000, 500);

    expect(svg).toContain('<line x1="100" y1="100" x2="500" y2="100"');
    expect(svg).toContain('stroke="#FF0000" stroke-width="10"');
    expect(svg).toContain(`<polygon points="${arrowHeadPoints(100, 100, 500, 100, 34)}" fill="#FF0000"/>`);
  });

  test("emits every scaled pen point", () => {
    const pen: AnnotationElement = {
      id: "p",
      type: "pen",
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.6 },
        { x: 0.9, y: 0.4 },
      ],
      stroke: "#123456",
      strokeWidth: 4,
    };

    expect(elementsToSvgInner([pen], 200, 100)).toContain('points="20,20 100,60 180,40"');
  });

  test("HTML-escapes text labels", () => {
    const text: AnnotationElement = {
      id: "t",
      type: "text",
      x: 0.2,
      y: 0.3,
      text: '<script>alert("x")</script>',
      color: "#000",
      fontSize: 30,
    };
    const svg = elementsToSvgInner([text], 1000, 500);

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  test("renders blur only as an explicitly requested opaque redaction", () => {
    const blur: AnnotationElement = {
      id: "b",
      type: "blur",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.12,
      intensity: 16,
    };

    expect(elementsToSvgInner([blur], 1000, 1000)).toBe("");
    expect(elementsToSvgInner([blur], 1000, 1000, { blurAsRedaction: false })).toBe("");

    const redaction = elementsToSvgInner([blur], 1000, 1000, { blurAsRedaction: true });
    expect(redaction).toContain('fill="#565F68"');
    expect(redaction).toContain("REDACTED");

    const small = { ...blur, width: 0.02, height: 0.02 };
    const smallRedaction = elementsToSvgInner([small], 1000, 1000, { blurAsRedaction: true });
    expect(smallRedaction).toContain('fill="#565F68"');
    expect(smallRedaction).not.toContain("REDACTED");
  });

  test("wraps content with a non-preserving aspect ratio and correct viewBox", () => {
    const rect: AnnotationElement = {
      id: "r",
      type: "rect",
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.3,
      stroke: "#fff",
      strokeWidth: 5,
    };
    const svg = elementsToOverlaySvg([rect], 640, 480);

    expect(svg).toContain('viewBox="0 0 640 480"');
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(elementsToOverlaySvg([], 640, 480)).toBe("");
  });
});
