/**
 * Web image pipeline — expo-image-picker's web `blob:` URLs die on reload
 * and carry no real dimensions, so every picked photo must be decoded and
 * re-encoded as a self-contained JPEG data: URI. These tests stub the DOM
 * (Image/canvas) that isn't present under the Node jest environment.
 */

import { fitDimensions, processPickedPhotoWeb, reencodeWebImage } from "@/lib/filesWeb";

describe("fitDimensions", () => {
  it("leaves an image unchanged when already within bounds", () => {
    expect(fitDimensions(800, 600, 1800)).toEqual({ width: 800, height: 600 });
  });

  it("leaves an image unchanged when exactly at the bound", () => {
    expect(fitDimensions(1800, 900, 1800)).toEqual({ width: 1800, height: 900 });
  });

  it("never upscales a smaller image", () => {
    expect(fitDimensions(200, 150, 1800)).toEqual({ width: 200, height: 150 });
  });

  it("downscales a landscape image to fit the longer side", () => {
    expect(fitDimensions(3600, 1800, 1800)).toEqual({ width: 1800, height: 900 });
  });

  it("downscales a portrait image to fit the longer side", () => {
    expect(fitDimensions(1800, 3600, 1800)).toEqual({ width: 900, height: 1800 });
  });

  it("downscales a square image correctly", () => {
    expect(fitDimensions(4000, 4000, 500)).toEqual({ width: 500, height: 500 });
  });

  it("rounds to whole pixels and never produces a zero dimension", () => {
    const result = fitDimensions(10000, 1, 1800);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it("falls back to a 1x1 image instead of throwing on invalid input", () => {
    expect(fitDimensions(0, 0, 1800)).toEqual({ width: 1, height: 1 });
    expect(fitDimensions(-5, 100, 1800)).toEqual({ width: 1, height: 1 });
  });
});

describe("processPickedPhotoWeb", () => {
  interface FakeCanvasContext {
    drawImage: (...args: unknown[]) => void;
  }

  function installDomStubs(naturalWidth: number, naturalHeight: number) {
    const drawImageCalls: unknown[][] = [];
    const toDataURLCalls: unknown[][] = [];

    class FakeImage {
      naturalWidth = naturalWidth;
      naturalHeight = naturalHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = "";
      set src(value: string) {
        this._src = value;
        // Simulate async decode.
        setTimeout(() => this.onload?.(), 0);
      }
      get src() {
        return this._src;
      }
    }

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: (): FakeCanvasContext => ({
        drawImage: (...args: unknown[]) => {
          drawImageCalls.push(args);
        },
      }),
      toDataURL: (...args: unknown[]) => {
        toDataURLCalls.push(args);
        return `data:image/jpeg;fake,${fakeCanvas.width}x${fakeCanvas.height}:${toDataURLCalls.length}`;
      },
    };

    (globalThis as unknown as { Image: typeof FakeImage }).Image = FakeImage;
    (globalThis as unknown as { document: { createElement: (tag: string) => unknown } }).document = {
      createElement: (tag: string) => {
        if (tag !== "canvas") throw new Error(`unexpected createElement(${tag})`);
        return fakeCanvas;
      },
    };

    return { drawImageCalls, toDataURLCalls };
  }

  afterEach(() => {
    delete (globalThis as { Image?: unknown }).Image;
    delete (globalThis as { document?: unknown }).document;
  });

  it("produces report and thumb variants, reusing report as originalUri", async () => {
    installDomStubs(3600, 1800);
    const result = await processPickedPhotoWeb("blob:http://localhost/abc-123");
    expect(result.width).toBe(1800);
    expect(result.height).toBe(900);
    expect(result.originalUri).toBe(result.reportUri);
    expect(result.reportUri).toContain("1800x900");
    expect(result.thumbUri).toContain("500x250");
    expect(result.reportUri).not.toBe(result.thumbUri);
  });

  it("does not upscale a small source image", async () => {
    installDomStubs(300, 200);
    const result = await processPickedPhotoWeb("blob:http://localhost/small");
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it("turns ephemeral transform blob URLs into durable JPEG data URIs", async () => {
    installDomStubs(1200, 800);
    const result = await reencodeWebImage("blob:http://localhost/rotated", 1200, 0.8);
    expect(result.dataUri).toMatch(/^data:image\/jpeg/);
    expect(result.dataUri).not.toContain("blob:");
    expect(result).toMatchObject({ width: 1200, height: 800 });
  });

  it("draws onto the canvas at the computed target size (not the source size)", async () => {
    const { drawImageCalls } = installDomStubs(3600, 1800);
    await processPickedPhotoWeb("blob:http://localhost/abc");
    // report pass then thumb pass.
    expect(drawImageCalls).toHaveLength(2);
    expect(drawImageCalls[0]).toEqual([expect.anything(), 0, 0, 1800, 900]);
    expect(drawImageCalls[1]).toEqual([expect.anything(), 0, 0, 500, 250]);
  });

  it("rejects when the image fails to decode", async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    (globalThis as unknown as { Image: typeof FailingImage }).Image = FailingImage;
    await expect(processPickedPhotoWeb("blob:bad")).rejects.toThrow(/Failed to load image/);
  });
});
