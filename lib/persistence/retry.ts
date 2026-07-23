/**
 * Short backoff retry for storage writes.
 * Default: 2 retries after the first attempt (3 attempts total) at 100ms / 500ms.
 */

export interface RetryOptions {
  retries?: number;
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_DELAYS = [100, 500];

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? DEFAULT_DELAYS;
  const retries = options.retries ?? delays.length;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt >= retries) break;
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      if (delay > 0) await sleep(delay);
    }
  }
  throw lastError;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  return "Unknown storage error";
}
