import { formatShortDate } from "@/lib/dates";

describe("formatShortDate", () => {
  it("formats a Date with Intl (device locale)", () => {
    const out = formatShortDate(new Date("2026-07-18T12:00:00.000Z"));
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/18|Jul|7/);
  });

  it("accepts ISO date strings", () => {
    const out = formatShortDate("2026-01-05");
    expect(out).toMatch(/2026/);
  });

  it("falls back for invalid input", () => {
    expect(formatShortDate("not-a-date")).toBe("—");
  });

  it("uses the requested locale when Intl is available", () => {
    const spy = jest.spyOn(Intl, "DateTimeFormat");
    formatShortDate(new Date("2026-07-18T12:00:00.000Z"));
    expect(spy).toHaveBeenCalled();
    const opts = spy.mock.calls[0]?.[1] as Intl.DateTimeFormatOptions;
    expect(opts?.year).toBe("numeric");
    expect(opts?.month).toBe("short");
    expect(opts?.day).toBe("numeric");
    spy.mockRestore();
  });
});
