import { escapeHtml, formatDate, formatDateTime, issueRef } from "@/lib/format";

describe("format helpers", () => {
  test("pads issue references to three digits", () => {
    expect(issueRef(7)).toBe("#007");
    expect(issueRef(1234)).toBe("#1234");
  });

  test("escapes unsafe HTML characters", () => {
    expect(escapeHtml('<script title="x">a & b</script>')).toBe(
      "&lt;script title=&quot;x&quot;&gt;a &amp; b&lt;/script&gt;",
    );
  });

  test("formats valid dates and rejects missing or invalid values", () => {
    const iso = "2024-02-03T12:34:00.000Z";

    expect(formatDate(iso)).toContain("2024");
    expect(formatDateTime(iso)).toContain(formatDate(iso));
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});
