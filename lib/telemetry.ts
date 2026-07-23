import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

import { sanitizeBreadcrumb, sanitizeTelemetryEvent } from "@/lib/telemetryPrivacy";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? Constants.expoConfig?.extra?.sentryDsn;
let initialized = false;

/** Initialize error-only Sentry telemetry once, before the app UI mounts. */
export function initializeTelemetry(): void {
  if (initialized || !dsn) return;
  initialized = true;

  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    // Crash reporting is useful at launch; performance tracing, replays,
    // screenshots, view hierarchy, and failed HTTP capture are deliberately
    // disabled until a separately reviewed privacy policy allows them.
    enableAutoPerformanceTracing: false,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    beforeBreadcrumb: (breadcrumb) => sanitizeBreadcrumb(breadcrumb) as typeof breadcrumb | null,
    beforeSend: (event) =>
      sanitizeTelemetryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
  });
}

/** Record a local storage failure without sending the original error text. */
export function recordPersistenceFailure(): void {
  if (!initialized) return;

  Sentry.addBreadcrumb({
    category: "punchthis.persistence",
    level: "error",
    message: "Local persistence failure",
  });
  Sentry.withScope((scope) => {
    scope.setTag("fault_area", "local_persistence");
    scope.setFingerprint(["punchthis", "local-persistence-failure"]);
    Sentry.captureException(new Error("Local persistence failure"));
  });
}
