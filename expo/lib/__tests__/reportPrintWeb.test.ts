/**
 * Web report export — expo-print's web shim ignores `html` and just prints
 * the live app page, so a real print target must be a separate window we
 * populate ourselves. These tests stub `window`/a fake print window.
 */

import {
  openBlankPrintWindow,
  printHtmlInWindow,
  shareOrDownloadHtmlReport,
  WEB_PRINT_SENTINEL,
} from "@/lib/reportPrintWeb";

interface FakeDocument {
  open: jest.Mock;
  write: jest.Mock;
  close: jest.Mock;
  readyState: "loading" | "complete";
}

interface FakeWindow {
  document: FakeDocument;
  addEventListener: jest.Mock;
  focus: jest.Mock;
  print: jest.Mock;
}

function fakeWindow(readyState: "loading" | "complete"): FakeWindow {
  return {
    document: { open: jest.fn(), write: jest.fn(), close: jest.fn(), readyState },
    addEventListener: jest.fn(),
    focus: jest.fn(),
    print: jest.fn(),
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  jest.useRealTimers();
});

describe("shareOrDownloadHtmlReport", () => {
  it("uses the Web Share API with a portable HTML file when supported", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { share, canShare: jest.fn(() => true) },
    });
    (globalThis as typeof globalThis & { File: typeof File }).File = class FakeFile extends Blob {
      name: string;
      constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
        super(parts, options);
        this.name = name;
      }
    } as unknown as typeof File;

    await expect(shareOrDownloadHtmlReport("<html />", "report.html", "Report")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "Report" }));
  });
});

describe("WEB_PRINT_SENTINEL", () => {
  it("is a stable, non-empty marker string", () => {
    expect(WEB_PRINT_SENTINEL).toBe("web-print");
  });
});

describe("openBlankPrintWindow", () => {
  it("returns the window opened via window.open('', '_blank')", () => {
    const opened = { fake: true };
    const open = jest.fn(() => opened);
    (globalThis as unknown as { window: { open: jest.Mock } }).window = { open };
    const result = openBlankPrintWindow();
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(result).toBe(opened);
  });

  it("returns null instead of throwing when window.open is blocked/unavailable", () => {
    (globalThis as unknown as { window: { open: jest.Mock } }).window = {
      open: jest.fn(() => {
        throw new Error("popup blocked");
      }),
    };
    expect(openBlankPrintWindow()).toBeNull();
  });
});

describe("printHtmlInWindow", () => {
  it("writes the html and prints immediately when the document is already complete", () => {
    const win = fakeWindow("complete");
    printHtmlInWindow(win as unknown as Window, "<html>report</html>");
    expect(win.document.open).toHaveBeenCalled();
    expect(win.document.write).toHaveBeenCalledWith("<html>report</html>");
    expect(win.document.close).toHaveBeenCalled();
    expect(win.print).toHaveBeenCalledTimes(1);
    expect(win.addEventListener).not.toHaveBeenCalled();
  });

  it("waits for the load event before printing when the document is still loading", () => {
    const win = fakeWindow("loading");
    printHtmlInWindow(win as unknown as Window, "<html>report</html>");
    expect(win.print).not.toHaveBeenCalled();
    expect(win.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), { once: true });
    const loadHandler = win.addEventListener.mock.calls[0][1] as () => void;
    loadHandler();
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it("falls back to a timer and prints exactly once even if load never fires", () => {
    jest.useFakeTimers();
    const win = fakeWindow("loading");
    printHtmlInWindow(win as unknown as Window, "<html>report</html>");
    jest.advanceTimersByTime(500);
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it("never prints twice when both the load event and the fallback timer fire", () => {
    jest.useFakeTimers();
    const win = fakeWindow("loading");
    printHtmlInWindow(win as unknown as Window, "<html>report</html>");
    const loadHandler = win.addEventListener.mock.calls[0][1] as () => void;
    loadHandler();
    jest.advanceTimersByTime(500);
    expect(win.print).toHaveBeenCalledTimes(1);
  });

  it("does not throw when win.print() itself throws", () => {
    const win = fakeWindow("complete");
    win.print.mockImplementation(() => {
      throw new Error("print unavailable");
    });
    expect(() => printHtmlInWindow(win as unknown as Window, "<html/>")).not.toThrow();
  });
});
