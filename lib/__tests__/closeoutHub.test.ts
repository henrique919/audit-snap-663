import {
  countIssuesByStatus,
  findCompletenessWarnings,
  formatMissingFields,
} from "@/lib/closeoutHub";
import type { Issue } from "@/types/models";

function issue(partial: Partial<Issue> & Pick<Issue, "id" | "issueNumber" | "status">): Issue {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    syncStatus: "local_only",
    localVersion: 1,
    serverVersion: 0,
    auditId: "a1",
    projectId: "p1",
    locationId: "loc1",
    title: "Paint",
    description: "",
    priority: "medium",
    assigneeId: "as1",
    includeInReport: true,
    sortOrder: 0,
    ...partial,
  };
}

describe("countIssuesByStatus", () => {
  it("tallies each status and ignores deleted", () => {
    const counts = countIssuesByStatus([
      issue({ id: "1", issueNumber: 1, status: "open" }),
      issue({ id: "2", issueNumber: 2, status: "assigned" }),
      issue({ id: "3", issueNumber: 3, status: "in_progress" }),
      issue({ id: "4", issueNumber: 4, status: "completed" }),
      issue({ id: "5", issueNumber: 5, status: "open", deletedAt: "2026-01-02T00:00:00.000Z" }),
    ]);
    expect(counts).toEqual({
      total: 4,
      open: 1,
      assigned: 1,
      inProgress: 1,
      completed: 1,
    });
  });
});

describe("findCompletenessWarnings", () => {
  it("flags missing title, location, assignee", () => {
    const warnings = findCompletenessWarnings([
      issue({ id: "1", issueNumber: 1, status: "open", title: "  ", locationId: null, assigneeId: null }),
      issue({ id: "2", issueNumber: 2, status: "open", title: "OK", locationId: "loc1", assigneeId: "as1" }),
      issue({ id: "3", issueNumber: 3, status: "open", title: "Door", locationId: null, assigneeId: "as1" }),
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({
      issueId: "1",
      issueNumber: 1,
      label: "Untitled issue",
      missing: ["title", "location", "assignee"],
    });
    expect(warnings[1].missing).toEqual(["location"]);
  });
});

describe("formatMissingFields", () => {
  it("joins field names", () => {
    expect(formatMissingFields(["title", "assignee"])).toBe("title, assignee");
  });
});
