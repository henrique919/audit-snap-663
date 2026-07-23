/**
 * Sync-cycle error classification + backoff.
 *
 * Separate from lib/persistence/retry.ts (short fixed-delay retry for local
 * storage writes) — network sync needs error-class-aware, exponential
 * backoff with jitter, and must distinguish "retry later" from "stop and
 * ask the user to sign in again".
 */

export type SyncErrorClass = "network" | "auth" | "conflict" | "server" | "client" | "unknown";

export interface ClassifiedSyncError {
  errorClass: SyncErrorClass;
  message: string;
  /** Whether another sync cycle should retry this operation. */
  retryable: boolean;
  status?: number;
  code?: string;
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as Record<string, unknown>;
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  return undefined;
}

function extractCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as Record<string, unknown>;
  return typeof e.code === "string" ? e.code : undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return "Unknown sync error";
}

/** Classify a thrown/returned error from a Supabase call (Postgrest, Auth, Storage, or a plain network failure). */
export function classifySyncError(error: unknown): ClassifiedSyncError {
  const status = extractStatus(error);
  const code = extractCode(error);
  const message = extractMessage(error);
  const lower = message.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    code === "PGRST301" ||
    code === "PGRST302" ||
    lower.includes("jwt") ||
    lower.includes("not authenticated") ||
    lower.includes("invalid refresh token")
  ) {
    return { errorClass: "auth", message, retryable: false, status, code };
  }

  if (status === 409 || code === "23505" || lower.includes("conflict")) {
    return { errorClass: "conflict", message, retryable: true, status, code };
  }

  // Postgres constraint violations (23xxx) other than unique conflicts, or
  // permission errors (RLS denies write) — retrying won't help.
  if ((code && /^(22|23|42)/.test(code) && code !== "23505") || status === 400 || status === 422) {
    return { errorClass: "client", message, retryable: false, status, code };
  }

  if (status != null && status >= 500) {
    return { errorClass: "server", message, retryable: true, status, code };
  }

  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    lower.includes("offline") ||
    lower.includes("connection") ||
    code === "57014"
  ) {
    return { errorClass: "network", message, retryable: true, status, code };
  }

  return { errorClass: "unknown", message, retryable: true, status, code };
}

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  /** Fraction of the exponential delay to randomise by, e.g. 0.2 = ±20%. */
  jitterRatio?: number;
  random?: () => number;
}

const DEFAULT_BASE_MS = 1_000;
const DEFAULT_MAX_MS = 5 * 60 * 1_000;
const DEFAULT_JITTER_RATIO = 0.2;

/** Exponential backoff with jitter. `attempt` is 0-indexed (0 = first retry delay). */
export function nextBackoffMs(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? DEFAULT_BASE_MS;
  const max = options.maxMs ?? DEFAULT_MAX_MS;
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const random = options.random ?? Math.random;

  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exp = Math.min(max, base * 2 ** safeAttempt);
  const jitter = exp * jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}
