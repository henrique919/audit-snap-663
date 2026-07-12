/**
 * Web report export.
 *
 * expo-print's web implementation ignores the `html` option entirely and
 * just calls `window.print()` on whatever page is currently open (see
 * node_modules/expo-print/src/ExponentPrint.web.ts) — on web it can only
 * print the live app UI, never the constructed report HTML. There is no
 * client-side way to produce a real PDF file in a browser without a server
 * round-trip, so the accepted pattern is: open a separate window, write the
 * report HTML into it, and let the user "Save as PDF" from its own print
 * dialog. Standing sentinel value recorded on ReportExport rows created on
 * web, since there is no real file URI to persist there.
 */

export const WEB_PRINT_SENTINEL = "web-print";

/**
 * Open a blank same-origin window. Must be called SYNCHRONOUSLY, before any
 * `await`, so browsers still attribute it to the user's click and don't
 * block it as a popup — populate it with content later via
 * `printHtmlInWindow`. Returns null if the browser blocked/refused it.
 */
export function openBlankPrintWindow(): Window | null {
  try {
    return window.open("", "_blank");
  } catch (e) {
    console.log("[reportPrintWeb] window.open failed", e);
    return null;
  }
}

/**
 * Write report HTML into a pre-opened window and trigger its print dialog
 * once the document is ready. Fires at most once even if both the `load`
 * event and the fallback timer land (some browsers never fire `load` for a
 * document produced via document.write).
 */
export function printHtmlInWindow(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();

  let triggered = false;
  const triggerPrint = () => {
    if (triggered) return;
    triggered = true;
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.log("[reportPrintWeb] print() failed", e);
    }
  };

  if (win.document.readyState === "complete") {
    triggerPrint();
  } else {
    win.addEventListener("load", triggerPrint, { once: true });
    setTimeout(triggerPrint, 500);
  }
}
