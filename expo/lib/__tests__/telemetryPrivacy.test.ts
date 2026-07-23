import { sanitizeBreadcrumb, sanitizeTelemetryEvent } from "@/lib/telemetryPrivacy";

describe("telemetry privacy boundary", () => {
  it("strips user, request, context, extra data, and error messages before sending", () => {
    const event = sanitizeTelemetryEvent({
      event_id: "event-1",
      environment: "production",
      user: { email: "inspector@example.com" },
      request: { url: "https://example.com/projects/secret" },
      extra: { projectName: "Private address" },
      contexts: { device: { name: "Harry's phone" } },
      tags: { auditId: "123" },
      message: "Project at 99 Private Street failed",
      exception: {
        values: [
          {
            type: "Error",
            value: "Email inspector@example.com could not save",
            stacktrace: {
              frames: [
                {
                  filename: "app.bundle",
                  function: "saveProject",
                  lineno: 42,
                  colno: 7,
                  vars: { email: "inspector@example.com" },
                  pre_context: ["private source"],
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: {
        values: [
          { category: "fetch", message: "https://example.com/private" },
          { category: "punchthis.persistence", message: "raw storage detail", data: { key: "private" } },
        ],
      },
    });

    expect(event).toEqual({
      event_id: "event-1",
      environment: "production",
      exception: {
        values: [
          {
            type: "Error",
            value: "Application error",
            stacktrace: {
              frames: [
                {
                  filename: "app.bundle",
                  function: "saveProject",
                  lineno: 42,
                  colno: 7,
                  in_app: undefined,
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: {
        values: [
          {
            category: "punchthis.persistence",
            level: undefined,
            message: "Local persistence failure",
            timestamp: undefined,
          },
        ],
      },
    });
  });

  it("rejects automatic breadcrumbs and retains only app-authored safe categories", () => {
    expect(sanitizeBreadcrumb({ category: "console", message: "private" })).toBeNull();
    expect(sanitizeBreadcrumb({ category: "punchthis.persistence" })).toMatchObject({
      category: "punchthis.persistence",
      message: "Local persistence failure",
    });
  });
});
