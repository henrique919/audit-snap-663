import {
  elementBounds,
  elementHandles,
  hitTestElement,
  resizeElement,
  translateElement,
  type NormPoint,
} from "@/lib/annotationGeometry";
import type { AnnotationElement } from "@/types/models";

const aspect = 2;

function expectRectClose(
  received: ReturnType<typeof elementBounds>,
  expected: ReturnType<typeof elementBounds>,
): void {
  expect(received.x).toBeCloseTo(expected.x);
  expect(received.y).toBeCloseTo(expected.y);
  expect(received.width).toBeCloseTo(expected.width);
  expect(received.height).toBeCloseTo(expected.height);
}

const elements = {
  arrow: {
    id: "arrow",
    type: "arrow",
    x1: 0.8,
    y1: 0.7,
    x2: 0.2,
    y2: 0.3,
    stroke: "#f00",
    strokeWidth: 8,
  },
  ellipse: {
    id: "ellipse",
    type: "ellipse",
    cx: 0.5,
    cy: 0.4,
    rx: 0.2,
    ry: 0.1,
    stroke: "#0f0",
    strokeWidth: 6,
  },
  rect: {
    id: "rect",
    type: "rect",
    x: 0.2,
    y: 0.3,
    width: 0.4,
    height: 0.2,
    stroke: "#00f",
    strokeWidth: 5,
  },
  blur: {
    id: "blur",
    type: "blur",
    x: 0.1,
    y: 0.15,
    width: 0.25,
    height: 0.3,
    intensity: 12,
  },
  pen: {
    id: "pen",
    type: "pen",
    points: [
      { x: 0.7, y: 0.2 },
      { x: 0.1, y: 0.8 },
      { x: 0.4, y: 0.5 },
    ],
    stroke: "#111",
    strokeWidth: 4,
  },
  text: {
    id: "text",
    type: "text",
    x: 0.4,
    y: 0.6,
    text: "Note",
    color: "#fff",
    fontSize: 40,
  },
  callout: {
    id: "callout",
    type: "callout",
    cx: 0.6,
    cy: 0.5,
    number: 3,
    color: "#f80",
    size: 80,
  },
} satisfies Record<string, AnnotationElement>;

describe("elementBounds", () => {
  test("normalises arrows whose second endpoint precedes the first", () => {
    expectRectClose(elementBounds(elements.arrow, aspect), { x: 0.2, y: 0.3, width: 0.6, height: 0.4 });
  });

  test("returns bounds for rectangles, blur regions, and ellipses", () => {
    expect(elementBounds(elements.rect, aspect)).toEqual({ x: 0.2, y: 0.3, width: 0.4, height: 0.2 });
    expect(elementBounds(elements.blur, aspect)).toEqual({ x: 0.1, y: 0.15, width: 0.25, height: 0.3 });
    expectRectClose(elementBounds(elements.ellipse, aspect), { x: 0.3, y: 0.3, width: 0.4, height: 0.2 });
  });

  test("encloses every pen point and handles an empty stroke", () => {
    expectRectClose(elementBounds(elements.pen, aspect), { x: 0.1, y: 0.2, width: 0.6, height: 0.6 });
    expect(
      elementBounds({ ...elements.pen, points: [] }, aspect),
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  test("scales text and callout height by the canvas aspect", () => {
    expectRectClose(elementBounds(elements.text, aspect), {
      x: 0.382,
      y: 0.5136,
      width: 0.1288,
      height: 0.12,
    });
    expectRectClose(elementBounds(elements.callout, aspect), {
      x: 0.56,
      y: 0.42,
      width: 0.08,
      height: 0.16,
    });
  });
});

describe("elementHandles", () => {
  test("uses arrow endpoints and four corners for box-like elements", () => {
    expect(elementHandles(elements.arrow, aspect)).toEqual([
      { id: "p1", x: 0.8, y: 0.7 },
      { id: "p2", x: 0.2, y: 0.3 },
    ]);

    for (const el of [elements.rect, elements.blur, elements.ellipse]) {
      expect(elementHandles(el, aspect).map((handle) => handle.id)).toEqual(["tl", "tr", "bl", "br"]);
    }
  });

  test("uses scale grips for text and callouts, and no handles for pen", () => {
    const [textHandle] = elementHandles(elements.text, aspect);
    expect(textHandle.id).toBe("scale");
    expect(textHandle.x).toBeCloseTo(0.5108);
    expect(textHandle.y).toBeCloseTo(0.6336);
    expect(elementHandles(elements.callout, aspect)).toEqual([{ id: "scale", x: 0.64, y: 0.5 }]);
    expect(elementHandles(elements.pen, aspect)).toEqual([]);
  });
});

describe("hitTestElement", () => {
  test("accepts inside and padded-edge points but rejects distant points", () => {
    expect(hitTestElement(elements.rect, { x: 0.4, y: 0.4 }, aspect)).toBe(true);
    expect(hitTestElement(elements.rect, { x: 0.18, y: 0.28 }, aspect)).toBe(true);
    expect(hitTestElement(elements.rect, { x: 0.1, y: 0.1 }, aspect)).toBe(false);
  });

  test("detects proximity to individual pen points", () => {
    expect(hitTestElement(elements.pen, { x: 0.73, y: 0.23 }, aspect)).toBe(true);
    expect(hitTestElement(elements.pen, { x: 0.75, y: 0.25 }, aspect)).toBe(false);
  });
});

describe("translateElement", () => {
  test.each(Object.entries(elements))("translates the %s element without mutating its shape", (_name, el) => {
    const moved = translateElement(el, 0.1, -0.05);
    const before = elementBounds(el, aspect);
    const after = elementBounds(moved, aspect);

    expect(after.x).toBeCloseTo(before.x + 0.1);
    expect(after.y).toBeCloseTo(before.y - 0.05);
    expect(after.width).toBeCloseTo(before.width);
    expect(after.height).toBeCloseTo(before.height);
  });
});

describe("resizeElement", () => {
  test("moves arrow endpoints independently", () => {
    expect(resizeElement(elements.arrow, "p1", { x: 0.1, y: 0.2 }, aspect)).toMatchObject({
      x1: 0.1,
      y1: 0.2,
      x2: 0.2,
      y2: 0.3,
    });
  });

  test("anchors the opposite corner and enforces the 0.02 minimum size", () => {
    expectRectClose(elementBounds(resizeElement(elements.rect, "br", { x: 0.8, y: 0.7 }, aspect), aspect), {
      x: 0.2,
      y: 0.3,
      width: 0.6,
      height: 0.4,
    });
    expect(resizeElement(elements.blur, "br", { x: 0.105, y: 0.155 }, aspect)).toMatchObject({
      x: 0.1,
      y: 0.15,
      width: 0.02,
      height: 0.02,
    });
  });

  test("resizes ellipses around the opposite corner", () => {
    const resized = resizeElement(elements.ellipse, "br", { x: 0.9, y: 0.8 }, aspect);
    expectRectClose(elementBounds(resized, aspect), { x: 0.3, y: 0.3, width: 0.6, height: 0.5 });
  });

  test("clamps text font size and callout size", () => {
    expect(resizeElement(elements.text, "scale", { x: 2, y: 1 }, aspect)).toMatchObject({ fontSize: 140 });
    expect(resizeElement(elements.text, "scale", { x: 0, y: 0 }, aspect)).toMatchObject({ fontSize: 16 });
    expect(resizeElement(elements.callout, "scale", { x: 2, y: 2 }, aspect)).toMatchObject({ size: 200 });
    expect(resizeElement(elements.callout, "scale", { x: 0.6, y: 0.5 }, aspect)).toMatchObject({ size: 32 });
  });

  test("leaves pen strokes unchanged when resize is requested", () => {
    expect(resizeElement(elements.pen, "br", { x: 0.9, y: 0.9 }, aspect)).toBe(elements.pen);
  });
});

// Contract mirrors of the inline transforms in app/markup/[assetId].tsx.
// Keep these helpers local: this suite pins screen behaviour without refactoring it.
function rotateClockwise(point: NormPoint): NormPoint {
  return { x: 1 - point.y, y: point.x };
}

function remapToCrop(point: NormPoint, origin: NormPoint, size: NormPoint): NormPoint {
  return { x: (point.x - origin.x) / size.x, y: (point.y - origin.y) / size.y };
}

function remapFromCrop(point: NormPoint, origin: NormPoint, size: NormPoint): NormPoint {
  return { x: point.x * size.x + origin.x, y: point.y * size.y + origin.y };
}

describe("markup crop/rotate remap contracts", () => {
  test("rotates (x, y) to (1-y, x) and returns to identity after four turns", () => {
    const point = { x: 0.17, y: 0.82 };
    expect(rotateClockwise(point)).toEqual({ x: 0.18000000000000005, y: 0.17 });

    let rotated = point;
    for (let turn = 0; turn < 4; turn += 1) rotated = rotateClockwise(rotated);
    expect(rotated.x).toBeCloseTo(point.x, 12);
    expect(rotated.y).toBeCloseTo(point.y, 12);
  });

  test("maps crop coordinates with (value-origin)/size and round-trips", () => {
    const point = { x: 0.35, y: 0.6 };
    const origin = { x: 0.1, y: 0.2 };
    const size = { x: 0.5, y: 0.5 };
    const cropped = remapToCrop(point, origin, size);

    expect(cropped.x).toBeCloseTo(0.5);
    expect(cropped.y).toBeCloseTo(0.8);
    expect(remapFromCrop(cropped, origin, size)).toEqual(point);
  });
});
