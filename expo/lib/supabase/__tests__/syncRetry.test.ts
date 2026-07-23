import { classifySyncError, nextBackoffMs } from "@/lib/supabase/syncRetry";

describe("classifySyncError", () => {
  it("classifies 401/403 and JWT messages as non-retryable auth errors", () => {
    expect(classifySyncError({ status: 401, message: "Unauthorized" })).toMatchObject({
      errorClass: "auth",
      retryable: false,
    });
    expect(classifySyncError(new Error("JWT expired"))).toMatchObject({ errorClass: "auth", retryable: false });
    expect(classifySyncError({ code: "PGRST301" })).toMatchObject({ errorClass: "auth", retryable: false });
  });

  it("classifies 409 / unique violations as retryable conflicts", () => {
    expect(classifySyncError({ status: 409, message: "conflict" })).toMatchObject({
      errorClass: "conflict",
      retryable: true,
    });
    expect(classifySyncError({ code: "23505", message: "duplicate key" })).toMatchObject({
      errorClass: "conflict",
      retryable: true,
    });
  });

  it("classifies constraint violations and 4xx as non-retryable client errors", () => {
    expect(classifySyncError({ code: "23502", message: "null value" })).toMatchObject({
      errorClass: "client",
      retryable: false,
    });
    expect(classifySyncError({ status: 400, message: "bad request" })).toMatchObject({
      errorClass: "client",
      retryable: false,
    });
  });

  it("classifies 5xx as retryable server errors", () => {
    expect(classifySyncError({ status: 500, message: "internal error" })).toMatchObject({
      errorClass: "server",
      retryable: true,
    });
    expect(classifySyncError({ status: 503 })).toMatchObject({ errorClass: "server", retryable: true });
  });

  it("classifies network-ish messages as retryable network errors", () => {
    expect(classifySyncError(new TypeError("Failed to fetch"))).toMatchObject({
      errorClass: "network",
      retryable: true,
    });
    expect(classifySyncError(new Error("Network request timeout"))).toMatchObject({
      errorClass: "network",
      retryable: true,
    });
  });

  it("falls back to retryable unknown for unrecognised errors", () => {
    expect(classifySyncError("boom")).toMatchObject({ errorClass: "unknown", retryable: true, message: "boom" });
    expect(classifySyncError(null)).toMatchObject({ errorClass: "unknown", message: "Unknown sync error" });
  });
});

describe("nextBackoffMs", () => {
  it("grows exponentially with attempt number, deterministic with random=0.5 (no jitter)", () => {
    const noJitter = { random: () => 0.5 };
    expect(nextBackoffMs(0, { baseMs: 1000, ...noJitter })).toBe(1000);
    expect(nextBackoffMs(1, { baseMs: 1000, ...noJitter })).toBe(2000);
    expect(nextBackoffMs(2, { baseMs: 1000, ...noJitter })).toBe(4000);
  });

  it("caps at maxMs", () => {
    const noJitter = { random: () => 0.5 };
    expect(nextBackoffMs(20, { baseMs: 1000, maxMs: 30_000, ...noJitter })).toBe(30_000);
  });

  it("applies jitter within the configured ratio", () => {
    const high = nextBackoffMs(3, { baseMs: 1000, jitterRatio: 0.5, random: () => 1 });
    const low = nextBackoffMs(3, { baseMs: 1000, jitterRatio: 0.5, random: () => 0 });
    // base exponential for attempt 3 is 8000; jitterRatio 0.5 => range [4000, 12000]
    expect(low).toBe(4000);
    expect(high).toBe(12000);
  });

  it("never returns negative values and treats negative attempts as 0", () => {
    expect(nextBackoffMs(-5, { random: () => 0 })).toBeGreaterThanOrEqual(0);
  });
});
