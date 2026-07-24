/**
 * Web PWA setup — SPA-safe.
 *
 * The web build runs as a single-page app (app.json intentionally does NOT
 * set web.output:"static" — per-route static prerendering produced a React
 * hydration mismatch on the shared tab bar). SPA mode means Expo emits its
 * own minimal index.html and the custom app/+html.tsx shell is NOT applied,
 * so the PWA head tags and service-worker registration that used to live
 * there are injected here at runtime instead. Idempotent; web-only; no-ops
 * on native.
 */
import { Platform } from "react-native";

const THEME_COLOR = "#1C232B";

function ensureHeadTag(selector: string, create: () => HTMLElement): void {
  if (document.head.querySelector(selector)) return;
  document.head.appendChild(create());
}

/** Inject manifest + theme-color + iOS web-app meta if the SPA shell omitted them. */
function injectHeadTags(): void {
  ensureHeadTag('link[rel="manifest"]', () => {
    const l = document.createElement("link");
    l.rel = "manifest";
    l.href = "/manifest.json";
    return l;
  });
  ensureHeadTag('meta[name="theme-color"]', () => {
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = THEME_COLOR;
    return m;
  });
  ensureHeadTag('meta[name="apple-mobile-web-app-capable"]', () => {
    const m = document.createElement("meta");
    m.name = "apple-mobile-web-app-capable";
    m.content = "yes";
    return m;
  });
  ensureHeadTag('meta[name="apple-mobile-web-app-status-bar-style"]', () => {
    const m = document.createElement("meta");
    m.name = "apple-mobile-web-app-status-bar-style";
    m.content = "black-translucent";
    return m;
  });
  ensureHeadTag('meta[name="mobile-web-app-capable"]', () => {
    const m = document.createElement("meta");
    m.name = "mobile-web-app-capable";
    m.content = "yes";
    return m;
  });
}

function doRegister(): void {
  navigator.serviceWorker
    .register("/service-worker.js")
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      const urls = new Set<string>(["/", "/index.html", "/manifest.json"]);
      performance.getEntriesByType("resource").forEach((entry) => {
        try {
          const url = new URL((entry as PerformanceResourceTiming).name, location.origin);
          if (url.origin === location.origin) urls.add(url.pathname + url.search);
        } catch {
          /* ignore unparseable resource URLs */
        }
      });
      return caches.open("punchthis-shell-v1").then((cache) =>
        Promise.all(Array.from(urls).map((u) => cache.add(u).catch(() => undefined))),
      );
    })
    .catch((error) => {
      console.log("[pwa] service worker registration failed", error);
    });
}

/**
 * Register the app-shell service worker. This module executes after the JS
 * bundle finishes evaluating, which is frequently AFTER the window `load`
 * event has already fired — so gate on readyState and register immediately
 * when the document is already complete, only deferring to `load` otherwise.
 */
function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (document.readyState === "complete") {
    doRegister();
  } else {
    window.addEventListener("load", doRegister, { once: true });
  }
}

let done = false;

/** Idempotent web PWA bootstrap. Safe to call on every mount; no-op on native. */
export function setupWebPwa(): void {
  if (done) return;
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  done = true;
  injectHeadTags();
  registerServiceWorker();
}
