import { saveIndicatorState, SAVE_INDICATOR_LABEL, savedToastMessage } from "@/lib/saveState";

describe("saveIndicatorState", () => {
  it("reports 'saved' when nothing is dirty, saving, or failing", () => {
    expect(saveIndicatorState({ persistStatus: "idle", saving: false, dirty: false })).toBe("saved");
  });

  it("reports 'dirty' when there are unsaved local changes", () => {
    expect(saveIndicatorState({ persistStatus: "idle", saving: false, dirty: true })).toBe("dirty");
  });

  it("reports 'saving' while a local save operation is in flight", () => {
    expect(saveIndicatorState({ persistStatus: "idle", saving: true, dirty: true })).toBe("saving");
  });

  it("reports 'error' on a persistence failure even when local state looks clean (the exact bug this fixes)", () => {
    expect(saveIndicatorState({ persistStatus: "error", saving: false, dirty: false })).toBe("error");
  });

  it("reports 'error' even while a local save is still in flight — persistence failure always wins", () => {
    expect(saveIndicatorState({ persistStatus: "error", saving: true, dirty: true })).toBe("error");
  });

  it("reports 'error' over a merely-dirty local state", () => {
    expect(saveIndicatorState({ persistStatus: "error", saving: false, dirty: true })).toBe("error");
  });
});

describe("SAVE_INDICATOR_LABEL", () => {
  it("never claims 'Saved on device' for the error state", () => {
    expect(SAVE_INDICATOR_LABEL.error).not.toMatch(/saved on device/i);
  });

  it("has a distinct label for every state", () => {
    const labels = Object.values(SAVE_INDICATOR_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("savedToastMessage", () => {
  it("claims success when persistence is healthy", () => {
    expect(savedToastMessage("#001", "idle")).toBe("#001 saved on device");
  });

  it("does not claim 'saved on device' when a persistence failure is already ongoing", () => {
    const message = savedToastMessage("#001", "error");
    expect(message).not.toMatch(/saved on device/i);
    expect(message).toBe("#001 saved — sync to storage failed");
  });

  it("claims success mid-save (saving is not a failure)", () => {
    expect(savedToastMessage("#002", "saving")).toBe("#002 saved on device");
  });
});
