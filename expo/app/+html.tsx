import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";
import React from "react";

const PWA_BOOTSTRAP = `
  (function () {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/service-worker.js').then(function () {
        return navigator.serviceWorker.ready;
      }).then(function () {
        var urls = new Set(['/', '/index.html', '/manifest.json']);
        performance.getEntriesByType('resource').forEach(function (entry) {
          try {
            var url = new URL(entry.name, location.origin);
            if (url.origin === location.origin) urls.add(url.pathname + url.search);
          } catch (_) {}
        });
        return caches.open('punchthis-shell-v1').then(function (cache) {
          return Promise.all(Array.from(urls).map(function (url) {
            return cache.add(url).catch(function () { return undefined; });
          }));
        });
      }).catch(function (error) {
        console.log('[pwa] service worker registration failed', error);
      });
    });
  })();
`;

/** Web document shell. Native platforms do not render this file. */
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en-AU">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#1C232B" />
        <meta name="application-name" content="PunchThis" />
        <title>PunchThis</title>
        <link rel="manifest" href="/manifest.json" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: PWA_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
