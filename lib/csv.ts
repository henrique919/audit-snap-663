/**
 * CSV export of the hit list — RFC-4180 (CRLF line endings, quote-and-double
 * fields containing a comma/quote/newline). `buildCsv` is pure and platform-
 * free; `exportCsv` handles the web-download vs native-share split.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";

import { formatDate } from "@/lib/format";
import type { Assignee, Issue, ProjectLocation } from "@/types/models";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/types/models";

const CSV_HEADER = [
  "Number",
  "Title",
  "Location",
  "Assignee",
  "Status",
  "Priority",
  "Created",
  "Description",
];

function escapeCsvField(value: string): string {
  // Neutralize spreadsheet formula injection: Excel/Sheets execute cells
  // starting with = + - @ or tab. Prefixing an apostrophe forces text
  // interpretation (the apostrophe becomes part of the exported data — the
  // accepted trade-off for a file meant to be sent to clients; see
  // DECISIONS.md #20).
  const neutralized = /^[=+\-@\t]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

function toRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

/** Builds an RFC-4180 CSV string (header + one row per issue). */
export function buildCsv(issues: Issue[], locations: ProjectLocation[], assignees: Assignee[]): string {
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "General";
  const assigneeName = (id: string | null) => assignees.find((a) => a.id === id)?.name ?? "Unassigned";

  const lines = [
    toRow(CSV_HEADER),
    ...issues.map((issue) =>
      toRow([
        `#${`${issue.issueNumber}`.padStart(3, "0")}`,
        issue.title || "Untitled issue",
        locationName(issue.locationId),
        assigneeName(issue.assigneeId),
        STATUS_LABEL[issue.status],
        PRIORITY_LABEL[issue.priority],
        formatDate(issue.createdAt),
        issue.description,
      ]),
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}

/**
 * Web: downloads the CSV via a temporary Blob URL + anchor click.
 * Native: writes to cacheDirectory and opens the share sheet.
 * Returns false if native sharing is unavailable on the device.
 */
export async function exportCsv(csv: string, filename: string): Promise<boolean> {
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  const dest = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(dest, csv, { encoding: FileSystem.EncodingType.UTF8 });
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;
  await Sharing.shareAsync(dest, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" });
  return true;
}
