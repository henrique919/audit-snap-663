/**
 * Privacy boundary for error telemetry.
 *
 * PunchThis records failures, not customer, site, project, or account data.
 * Keep this module framework-independent so the policy is easy to test.
 */

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeStacktrace(value: unknown): UnknownRecord | undefined {
  if (!isRecord(value) || !Array.isArray(value.frames)) return undefined;

  return {
    frames: value.frames.flatMap((frame) => {
      if (!isRecord(frame)) return [];
      // Function and bundle location are sufficient to diagnose a crash. Do
      // not include source context, local variables, or request values.
      return [
        {
          filename: frame.filename,
          function: frame.function,
          lineno: frame.lineno,
          colno: frame.colno,
          in_app: frame.in_app,
        },
      ];
    }),
  };
}

function safeException(value: unknown): UnknownRecord | undefined {
  if (!isRecord(value) || !Array.isArray(value.values)) return undefined;

  return {
    values: value.values.flatMap((exception) => {
      if (!isRecord(exception)) return [];
      const stacktrace = safeStacktrace(exception.stacktrace);
      return [
        {
          // Error messages can include entered names, addresses, URLs, or
          // server responses. Preserve only error class and code location.
          type: exception.type,
          value: "Application error",
          ...(stacktrace ? { stacktrace } : {}),
        },
      ];
    }),
  };
}

/** Return only explicitly safe, app-authored breadcrumbs. */
export function sanitizeBreadcrumb(value: unknown): UnknownRecord | null {
  if (!isRecord(value) || typeof value.category !== "string" || !value.category.startsWith("punchthis.")) {
    return null;
  }

  return {
    category: value.category,
    level: value.level,
    message: value.category === "punchthis.persistence" ? "Local persistence failure" : "Application event",
    timestamp: value.timestamp,
  };
}

/**
 * Remove PII-bearing Sentry fields and reduce crash data to diagnostic code
 * locations. This runs immediately before Sentry serializes an event.
 */
export function sanitizeTelemetryEvent(event: UnknownRecord): UnknownRecord {
  const exception = safeException(event.exception);
  const rawBreadcrumbs = isRecord(event.breadcrumbs) && Array.isArray(event.breadcrumbs.values)
    ? event.breadcrumbs.values
    : [];
  const breadcrumbs = rawBreadcrumbs
    .map(sanitizeBreadcrumb)
    .filter((breadcrumb): breadcrumb is UnknownRecord => breadcrumb !== null);

  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    fingerprint: event.fingerprint,
    sdk: event.sdk,
    ...(exception ? { exception } : {}),
    ...(breadcrumbs.length > 0 ? { breadcrumbs: { values: breadcrumbs } } : {}),
  };
}
