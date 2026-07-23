import { errorMessage, withRetry } from "@/lib/persistence/retry";

describe("withRetry", () => {
  it("returns on first success", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { retries: 2, delaysMs: [0, 0] })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries then succeeds", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail-1"))
      .mockRejectedValueOnce(new Error("fail-2"))
      .mockResolvedValue("ok");
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(withRetry(fn, { retries: 2, delaysMs: [100, 500], sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 500);
  });

  it("throws after exhausting retries", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("boom"));
    const sleep = jest.fn().mockResolvedValue(undefined);
    await expect(withRetry(fn, { retries: 2, delaysMs: [0, 0], sleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("formats error messages", () => {
    expect(errorMessage(new Error("x"))).toBe("x");
    expect(errorMessage("y")).toBe("y");
    expect(errorMessage(null)).toBe("Unknown storage error");
  });
});
