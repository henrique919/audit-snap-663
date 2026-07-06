/**
 * App store — local-first source of truth.
 *
 * Hydrates all tables from local storage via React Query, keeps them in
 * memory, and persists every mutation back instantly. Each mutation also
 * appends a sync-outbox entry (placeholder for future cloud sync).
 */

import createContextHook from "@nkzw/create-context-hook";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { newId, nowIso } from "@/lib/ids";
import { buildDemoDb } from "@/lib/seed";
import {
  clearAllData,
  Db,
  EMPTY_DB,
  loadDb,
  loadSettings,
  saveDb,
  saveSettings,
} from "@/lib/store";
import type { ProcessedPhoto } from "@/lib/files";
import type {
  AnnotationElement,
  AnnotationRecord,
  AppSettings,
  Assignee,
  Audit,
  BaseRecord,
  Issue,
  IssuePriority,
  OutboxOperation,
  PhotoAsset,
  Project,
  ProjectLocation,
  ReportExport,
  ReportOptions,
} from "@/types/models";
import { DEFAULT_SETTINGS } from "@/types/models";

function newBase(): BaseRecord {
  const now = nowIso();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncStatus: "local_only",
    localVersion: 1,
    serverVersion: 1,
  };
}

function touched<T extends BaseRecord>(record: T): T {
  return {
    ...record,
    updatedAt: nowIso(),
    localVersion: record.localVersion + 1,
    syncStatus: record.syncStatus === "synced" ? "pending_upload" : record.syncStatus,
  };
}

export interface CreateProjectInput {
  name: string;
  reference: string;
  clientName: string;
  siteAddress: string;
  companyName: string;
  inspectorName: string;
  coverPhotoUri: string | null;
  logoUri: string | null;
}

export interface CreateAuditInput {
  projectId: string;
  title: string;
  auditDate: string;
  preparedFor: string;
  preparedBy: string;
  defaultLocationId: string | null;
  defaultAssigneeId: string | null;
  themeKey: Audit["themeKey"];
}

export interface CreateIssueInput {
  auditId: string;
  projectId: string;
  locationId: string | null;
  title: string;
  description: string;
  status: Issue["status"];
  priority: IssuePriority;
  assigneeId: string | null;
  includeInReport: boolean;
}

export const [AppStoreProvider, useAppStore] = createContextHook(() => {
  const [db, setDb] = useState<Db>(EMPTY_DB);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const hydratedRef = useRef<boolean>(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydration = useQuery({
    queryKey: ["local-db"],
    queryFn: async () => {
      const [loadedDb, loadedSettings] = await Promise.all([loadDb(), loadSettings()]);
      return { loadedDb, loadedSettings };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    if (!hydration.data || hydratedRef.current) return;
    hydratedRef.current = true;
    const { loadedDb, loadedSettings } = hydration.data;
    if (!loadedSettings.demoSeeded && loadedDb.projects.length === 0) {
      const demo = buildDemoDb();
      const seededSettings: AppSettings = {
        ...loadedSettings,
        demoSeeded: true,
        inspectorName: loadedSettings.inspectorName || "Alex Carter",
        lastAuditId: demo.audits[0]?.id ?? null,
      };
      setDb(demo);
      setSettings(seededSettings);
      saveDb(demo);
      saveSettings(seededSettings);
    } else {
      setDb(loadedDb);
      setSettings(loadedSettings);
    }
    setHydrated(true);
  }, [hydration.data]);

  /** Debounced persistence of the whole db after any mutation. */
  const persistDb = useCallback((next: Db) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDb(next);
    }, 250);
  }, []);

  const mutateDb = useCallback(
    (fn: (prev: Db) => Db) => {
      setDb((prev) => {
        const next = fn(prev);
        persistDb(next);
        return next;
      });
    },
    [persistDb],
  );

  const outboxEntry = useCallback((table: string, recordId: string, op: OutboxOperation) => {
    return { id: newId(), table, recordId, op, at: nowIso() };
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /* --------------------------------- Projects --------------------------------- */

  const createProject = useCallback(
    (input: CreateProjectInput): Project => {
      const project: Project = { ...newBase(), ...input, status: "active" };
      mutateDb((prev) => ({
        ...prev,
        projects: [project, ...prev.projects],
        outbox: [...prev.outbox, outboxEntry("projects", project.id, "create")].slice(-200),
      }));
      return project;
    },
    [mutateDb, outboxEntry],
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Project>) => {
      mutateDb((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => (p.id === id ? touched({ ...p, ...patch, id }) : p)),
        outbox: [...prev.outbox, outboxEntry("projects", id, "update")].slice(-200),
      }));
    },
    [mutateDb, outboxEntry],
  );

  /* --------------------------------- Locations --------------------------------- */

  const findOrCreateLocation = useCallback(
    (projectId: string, name: string): ProjectLocation => {
      const trimmed = name.trim();
      const existing = db.locations.find(
        (l) => l.projectId === projectId && l.name.toLowerCase() === trimmed.toLowerCase() && !l.deletedAt,
      );
      if (existing) return existing;
      const location: ProjectLocation = {
        ...newBase(),
        projectId,
        name: trimmed,
        sortOrder: db.locations.filter((l) => l.projectId === projectId).length,
      };
      mutateDb((prev) => ({
        ...prev,
        locations: [...prev.locations, location],
        outbox: [...prev.outbox, outboxEntry("locations", location.id, "create")].slice(-200),
      }));
      return location;
    },
    [db.locations, mutateDb, outboxEntry],
  );

  /* --------------------------------- Assignees --------------------------------- */

  const findOrCreateAssignee = useCallback(
    (name: string): Assignee => {
      const trimmed = name.trim();
      const existing = db.assignees.find(
        (a) => a.name.toLowerCase() === trimmed.toLowerCase() && !a.deletedAt,
      );
      if (existing) return existing;
      const assignee: Assignee = { ...newBase(), name: trimmed, company: "", email: "", phone: "", trade: "" };
      mutateDb((prev) => ({
        ...prev,
        assignees: [...prev.assignees, assignee],
        outbox: [...prev.outbox, outboxEntry("assignees", assignee.id, "create")].slice(-200),
      }));
      return assignee;
    },
    [db.assignees, mutateDb, outboxEntry],
  );

  /* ----------------------------------- Audits ----------------------------------- */

  const createAudit = useCallback(
    (input: CreateAuditInput): Audit => {
      const audit: Audit = {
        ...newBase(),
        ...input,
        status: "draft",
        notes: "",
        completedAt: null,
        reportIssuedAt: null,
      };
      mutateDb((prev) => ({
        ...prev,
        audits: [audit, ...prev.audits],
        outbox: [...prev.outbox, outboxEntry("audits", audit.id, "create")].slice(-200),
      }));
      updateSettings({ lastAuditId: audit.id });
      return audit;
    },
    [mutateDb, outboxEntry, updateSettings],
  );

  const updateAudit = useCallback(
    (id: string, patch: Partial<Audit>) => {
      mutateDb((prev) => ({
        ...prev,
        audits: prev.audits.map((a) => (a.id === id ? touched({ ...a, ...patch, id }) : a)),
        outbox: [...prev.outbox, outboxEntry("audits", id, "update")].slice(-200),
      }));
    },
    [mutateDb, outboxEntry],
  );

  /* ----------------------------------- Issues ----------------------------------- */

  const nextIssueNumber = useCallback(
    (auditId: string): number => {
      const nums = db.issues.filter((i) => i.auditId === auditId).map((i) => i.issueNumber);
      return nums.length === 0 ? 1 : Math.max(...nums) + 1;
    },
    [db.issues],
  );

  const createIssue = useCallback(
    (input: CreateIssueInput, photos: ProcessedPhoto[]): { issue: Issue; assets: PhotoAsset[] } => {
      const issue: Issue = {
        ...newBase(),
        ...input,
        issueNumber: nextIssueNumber(input.auditId),
        sortOrder: db.issues.filter((i) => i.auditId === input.auditId).length,
      };
      const newAssets: PhotoAsset[] = photos.map((p) => ({
        ...newBase(),
        issueId: issue.id,
        auditId: input.auditId,
        projectId: input.projectId,
        originalUri: p.originalUri,
        reportUri: p.reportUri,
        thumbUri: p.thumbUri,
        annotatedUri: null,
        width: p.width,
        height: p.height,
        capturedAt: nowIso(),
      }));
      mutateDb((prev) => ({
        ...prev,
        issues: [...prev.issues, issue],
        assets: [...prev.assets, ...newAssets],
        outbox: [
          ...prev.outbox,
          outboxEntry("issues", issue.id, "create"),
          ...newAssets.map((a) => outboxEntry("assets", a.id, "create")),
        ].slice(-200),
      }));
      updateSettings({
        lastAuditId: input.auditId,
        lastLocationId: input.locationId,
        lastAssigneeId: input.assigneeId,
        lastPriority: input.priority,
      });
      return { issue, assets: newAssets };
    },
    [db.issues, mutateDb, nextIssueNumber, outboxEntry, updateSettings],
  );

  const updateIssue = useCallback(
    (id: string, patch: Partial<Issue>) => {
      mutateDb((prev) => ({
        ...prev,
        issues: prev.issues.map((i) => (i.id === id ? touched({ ...i, ...patch, id }) : i)),
        outbox: [...prev.outbox, outboxEntry("issues", id, "update")].slice(-200),
      }));
    },
    [mutateDb, outboxEntry],
  );

  const deleteIssue = useCallback(
    (id: string) => {
      const now = nowIso();
      mutateDb((prev) => ({
        ...prev,
        issues: prev.issues.map((i) => (i.id === id ? touched({ ...i, deletedAt: now }) : i)),
        assets: prev.assets.map((a) => (a.issueId === id ? touched({ ...a, deletedAt: now }) : a)),
        outbox: [...prev.outbox, outboxEntry("issues", id, "delete")].slice(-200),
      }));
    },
    [mutateDb, outboxEntry],
  );

  const duplicateIssue = useCallback(
    (id: string): Issue | null => {
      const source = db.issues.find((i) => i.id === id);
      if (!source) return null;
      const copy: Issue = {
        ...source,
        ...newBase(),
        title: `${source.title} (copy)`,
        issueNumber: nextIssueNumber(source.auditId),
        sortOrder: db.issues.filter((i) => i.auditId === source.auditId).length,
      };
      const sourceAssets = db.assets.filter((a) => a.issueId === id && !a.deletedAt);
      const copiedAssets: PhotoAsset[] = sourceAssets.map((a) => ({
        ...a,
        ...newBase(),
        issueId: copy.id,
      }));
      const assetIdMap = new Map<string, string>();
      sourceAssets.forEach((a, i) => {
        const copied = copiedAssets[i];
        if (copied) assetIdMap.set(a.id, copied.id);
      });
      const copiedAnnotations: AnnotationRecord[] = db.annotations
        .filter((an) => assetIdMap.has(an.assetId))
        .map((an) => ({
          ...an,
          ...newBase(),
          assetId: assetIdMap.get(an.assetId) ?? an.assetId,
          issueId: copy.id,
        }));
      mutateDb((prev) => ({
        ...prev,
        issues: [...prev.issues, copy],
        assets: [...prev.assets, ...copiedAssets],
        annotations: [...prev.annotations, ...copiedAnnotations],
        outbox: [...prev.outbox, outboxEntry("issues", copy.id, "create")].slice(-200),
      }));
      return copy;
    },
    [db.annotations, db.assets, db.issues, mutateDb, nextIssueNumber, outboxEntry],
  );

  /* ----------------------------------- Assets ----------------------------------- */

  const addPhotosToIssue = useCallback(
    (issueId: string, photos: ProcessedPhoto[]) => {
      const issue = db.issues.find((i) => i.id === issueId);
      if (!issue) return;
      const newAssets: PhotoAsset[] = photos.map((p) => ({
        ...newBase(),
        issueId,
        auditId: issue.auditId,
        projectId: issue.projectId,
        originalUri: p.originalUri,
        reportUri: p.reportUri,
        thumbUri: p.thumbUri,
        annotatedUri: null,
        width: p.width,
        height: p.height,
        capturedAt: nowIso(),
      }));
      mutateDb((prev) => ({
        ...prev,
        assets: [...prev.assets, ...newAssets],
        outbox: [...prev.outbox, ...newAssets.map((a) => outboxEntry("assets", a.id, "create"))].slice(-200),
      }));
    },
    [db.issues, mutateDb, outboxEntry],
  );

  const updateAsset = useCallback(
    (id: string, patch: Partial<PhotoAsset>) => {
      mutateDb((prev) => ({
        ...prev,
        assets: prev.assets.map((a) => (a.id === id ? touched({ ...a, ...patch, id }) : a)),
        outbox: [...prev.outbox, outboxEntry("assets", id, "update")].slice(-200),
      }));
    },
    [mutateDb, outboxEntry],
  );

  /* -------------------------------- Annotations -------------------------------- */

  const saveAnnotation = useCallback(
    (assetId: string, issueId: string, elements: AnnotationElement[], annotatedUri: string | null) => {
      mutateDb((prev) => {
        const existing = prev.annotations.find((an) => an.assetId === assetId);
        const annotations = existing
          ? prev.annotations.map((an) =>
              an.assetId === assetId ? touched({ ...an, elements }) : an,
            )
          : [
              ...prev.annotations,
              { ...newBase(), assetId, issueId, elements, toolsetVersion: 1 },
            ];
        // Clearing all markup also clears the stale flattened copy so the
        // hit list and report fall back to the preserved original photo.
        const assets = prev.assets.map((a) =>
          a.id === assetId
            ? touched({
                ...a,
                annotatedUri: elements.length === 0 ? null : (annotatedUri ?? a.annotatedUri),
              })
            : a,
        );
        return {
          ...prev,
          annotations,
          assets,
          outbox: [...prev.outbox, outboxEntry("annotations", assetId, existing ? "update" : "create")].slice(-200),
        };
      });
    },
    [mutateDb, outboxEntry],
  );

  /* ---------------------------------- Reports ---------------------------------- */

  const addReportExport = useCallback(
    (input: { auditId: string; projectId: string; pdfUri: string; issueCount: number; photoCount: number; options: ReportOptions }): ReportExport => {
      const record: ReportExport = { ...newBase(), ...input };
      mutateDb((prev) => ({
        ...prev,
        reports: [record, ...prev.reports],
        audits: prev.audits.map((a) =>
          a.id === input.auditId ? touched({ ...a, reportIssuedAt: nowIso() }) : a,
        ),
        outbox: [...prev.outbox, outboxEntry("reports", record.id, "create")].slice(-200),
      }));
      return record;
    },
    [mutateDb, outboxEntry],
  );

  /* ----------------------------------- Danger ----------------------------------- */

  const resetAllData = useCallback(async (reseedDemo: boolean) => {
    await clearAllData();
    const freshDb = reseedDemo ? buildDemoDb() : EMPTY_DB;
    const freshSettings: AppSettings = { ...DEFAULT_SETTINGS, demoSeeded: true };
    setDb(freshDb);
    setSettings(freshSettings);
    await saveDb(freshDb);
    await saveSettings(freshSettings);
  }, []);

  return useMemo(
    () => ({
      hydrated,
      db,
      settings,
      updateSettings,
      createProject,
      updateProject,
      findOrCreateLocation,
      findOrCreateAssignee,
      createAudit,
      updateAudit,
      createIssue,
      updateIssue,
      deleteIssue,
      duplicateIssue,
      addPhotosToIssue,
      updateAsset,
      saveAnnotation,
      addReportExport,
      resetAllData,
    }),
    [
      hydrated,
      db,
      settings,
      updateSettings,
      createProject,
      updateProject,
      findOrCreateLocation,
      findOrCreateAssignee,
      createAudit,
      updateAudit,
      createIssue,
      updateIssue,
      deleteIssue,
      duplicateIssue,
      addPhotosToIssue,
      updateAsset,
      saveAnnotation,
      addReportExport,
      resetAllData,
    ],
  );
});

/* --------------------------------- Derived hooks --------------------------------- */

export function useProject(projectId: string | undefined) {
  const { db } = useAppStore();
  return useMemo(
    () => db.projects.find((p) => p.id === projectId && !p.deletedAt) ?? null,
    [db.projects, projectId],
  );
}

export function useAudit(auditId: string | undefined) {
  const { db } = useAppStore();
  return useMemo(
    () => db.audits.find((a) => a.id === auditId && !a.deletedAt) ?? null,
    [db.audits, auditId],
  );
}

export function useIssuesForAudit(auditId: string | undefined) {
  const { db } = useAppStore();
  return useMemo(
    () =>
      db.issues
        .filter((i) => i.auditId === auditId && !i.deletedAt)
        .sort((a, b) => a.issueNumber - b.issueNumber),
    [db.issues, auditId],
  );
}

/**
 * Freshness of the latest generated PDF for an audit: compares the export
 * time against the newest content change (issues, photos, annotations —
 * including soft-deletes, which also bump updatedAt). Drives "report needs
 * regeneration" states so an outdated PDF is never shared silently.
 */
export function useReportFreshness(auditId: string | undefined) {
  const { db } = useAppStore();
  return useMemo(() => {
    const lastExport =
      db.reports
        .filter((r) => r.auditId === auditId && !r.deletedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const issues = db.issues.filter((i) => i.auditId === auditId);
    const issueIds = new Set(issues.map((i) => i.id));
    const assets = db.assets.filter((a) => a.auditId === auditId);
    const annotations = db.annotations.filter((an) => issueIds.has(an.issueId));
    const contentUpdatedAt = [...issues, ...assets, ...annotations].reduce<string | null>(
      (acc, r) => (acc === null || r.updatedAt > acc ? r.updatedAt : acc),
      null,
    );
    const isStale = !!lastExport && !!contentUpdatedAt && contentUpdatedAt > lastExport.createdAt;
    return { lastExport, contentUpdatedAt, isStale };
  }, [db.reports, db.issues, db.assets, db.annotations, auditId]);
}

export function useProjectStats(projectId: string | undefined) {
  const { db } = useAppStore();
  return useMemo(() => {
    const issues = db.issues.filter((i) => i.projectId === projectId && !i.deletedAt);
    const audits = db.audits.filter((a) => a.projectId === projectId && !a.deletedAt);
    const reports = db.reports.filter((r) => r.projectId === projectId && !r.deletedAt);
    const open = issues.filter((i) => i.status !== "completed").length;
    const completed = issues.filter((i) => i.status === "completed").length;
    const lastAudit = audits.reduce<string | null>(
      (acc, a) => (acc === null || a.auditDate > acc ? a.auditDate : acc),
      null,
    );
    const lastUpdated = [...issues, ...audits].reduce<string | null>(
      (acc, r) => (acc === null || r.updatedAt > acc ? r.updatedAt : acc),
      null,
    );
    return {
      totalAudits: audits.length,
      openIssues: open,
      completedIssues: completed,
      reportsGenerated: reports.length,
      lastAuditDate: lastAudit,
      lastUpdated,
    };
  }, [db.issues, db.audits, db.reports, projectId]);
}
