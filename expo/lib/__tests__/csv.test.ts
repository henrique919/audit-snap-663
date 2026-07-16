import { buildCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import type { Assignee, Issue, ProjectLocation } from "@/types/models";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "i1",
    auditId: "a1",
    projectId: "p1",
    locationId: null,
    issueNumber: 1,
    title: "Scuffed paint",
    description: "Minor scuff on wall",
    status: "open",
    priority: "medium",
    assigneeId: null,
    includeInReport: true,
    sortOrder: 0,
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
    deletedAt: null,
    syncStatus: "local_only",
    localVersion: 1,
    serverVersion: 0,
    ...overrides,
  };
}

function location(id: string, name: string): ProjectLocation {
  return {
    id,
    projectId: "p1",
    name,
    sortOrder: 0,
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
    deletedAt: null,
    syncStatus: "local_only",
    localVersion: 1,
    serverVersion: 0,
  };
}

function assignee(id: string, name: string): Assignee {
  return {
    id,
    name,
    company: "",
    email: "",
    phone: "",
    trade: "",
    createdAt: "2026-07-12T10:00:00.000Z",
    updatedAt: "2026-07-12T10:00:00.000Z",
    deletedAt: null,
    syncStatus: "local_only",
    localVersion: 1,
    serverVersion: 0,
  };
}

describe("buildCsv", () => {
  it("emits a header row and one row per issue with CRLF line endings", () => {
    const csv = buildCsv([issue()], [], []);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Number,Title,Location,Assignee,Status,Priority,Created,Description");
    expect(lines[1].startsWith("#001,Scuffed paint,General,Unassigned,Open,Medium,")).toBe(true);
    expect(lines[1].endsWith(",Minor scuff on wall")).toBe(true);
    // The locale-formatted date itself is asserted separately (format.test.ts
    // covers formatDate); here we only care that it round-trips somewhere in
    // the row, quoted or not depending on whether the locale's format
    // contains a comma (e.g. "Jul 12, 2026" vs "12 Jul 2026").
    const created = formatDate(issue().createdAt);
    expect(csv.includes(created)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("resolves location and assignee names by id", () => {
    const csv = buildCsv(
      [issue({ locationId: "loc1", assigneeId: "asn1" })],
      [location("loc1", "Lobby")],
      [assignee("asn1", "BuildRight Painting")],
    );
    expect(csv).toContain("Lobby,BuildRight Painting");
  });

  it("quotes fields containing a comma", () => {
    const csv = buildCsv([issue({ title: "Paint, scuffed" })], [], []);
    expect(csv).toContain('"Paint, scuffed"');
  });

  it("quotes and doubles internal quotes in fields", () => {
    const csv = buildCsv([issue({ description: 'Needs a "final" coat' })], [], []);
    expect(csv).toContain('"Needs a ""final"" coat"');
  });

  it("quotes fields containing a newline", () => {
    const csv = buildCsv([issue({ description: "Line one\nLine two" })], [], []);
    expect(csv).toContain('"Line one\nLine two"');
  });

  it("does not quote plain fields", () => {
    const csv = buildCsv([issue({ title: "Plain title" })], [], []);
    expect(csv).toContain(",Plain title,");
  });

  it("falls back to Untitled issue for an empty title", () => {
    const csv = buildCsv([issue({ title: "" })], [], []);
    expect(csv).toContain(",Untitled issue,");
  });

  it("handles an empty issue list (header only)", () => {
    const csv = buildCsv([], [], []);
    expect(csv).toBe("Number,Title,Location,Assignee,Status,Priority,Created,Description\r\n");
  });

  it("pads issue numbers to 3 digits", () => {
    const csv = buildCsv([issue({ issueNumber: 42 })], [], []);
    expect(csv).toContain("#042,");
  });

  describe("formula-injection neutralization", () => {
    it("neutralizes a leading equals sign", () => {
      const csv = buildCsv([issue({ title: '=HYPERLINK("http://evil","x")' })], [], []);
      expect(csv).toContain('"\'=HYPERLINK(""http://evil"",""x"")"');
      expect(csv).not.toContain(',=HYPERLINK');
    });

    it("neutralizes a leading plus sign", () => {
      const csv = buildCsv([issue({ title: "+cmd|calc" })], [], []);
      expect(csv).toContain(",'+cmd|calc,");
    });

    it("neutralizes a leading minus sign", () => {
      const csv = buildCsv([issue({ title: "-2+3+cmd" })], [], []);
      expect(csv).toContain(",'-2+3+cmd,");
    });

    it("neutralizes a leading at sign", () => {
      const csv = buildCsv([issue({ title: "@SUM(1+9)" })], [], []);
      expect(csv).toContain(",'@SUM(1+9),");
    });

    it("neutralizes a leading tab", () => {
      const csv = buildCsv([issue({ title: "\t=1+1" })], [], []);
      expect(csv).toContain(",'\t=1+1,");
    });

    it("neutralizes description fields too", () => {
      const csv = buildCsv([issue({ description: "=1+1" })], [], []);
      expect(csv.trimEnd().endsWith(",'=1+1")).toBe(true);
    });

    it("leaves normal fields byte-identical, including internal trigger characters", () => {
      const csv = buildCsv(
        [issue({ title: "Door loose — 2+3 near @unit", description: "Grade a=b, re-fix" })],
        [],
        [],
      );
      expect(csv).toContain(",Door loose — 2+3 near @unit,");
      expect(csv).toContain('"Grade a=b, re-fix"');
      expect(csv).not.toContain("'Door");
      expect(csv).not.toContain("'Grade");
    });
  });
});
