import {
  isInlinePayload,
  mediaKey,
  mediaRef,
  parseMediaRef,
  planAssetsPersist,
  reviveAssetRecords,
  type AssetMediaRecord,
} from "@/lib/persistence/webMediaRefs";

function asset(id: string, over: Partial<AssetMediaRecord> = {}): AssetMediaRecord {
  return {
    id,
    originalUri: `data:image/jpeg;base64,ORIG-${id}`,
    reportUri: `data:image/jpeg;base64,REPORT-${id}`,
    thumbUri: `data:image/jpeg;base64,THUMB-${id}`,
    annotatedUri: null,
    ...over,
  };
}

describe("ref parsing", () => {
  it("round-trips key -> ref -> key", () => {
    expect(parseMediaRef(mediaRef(mediaKey("a1", "report")))).toBe("a1:report");
  });
  it("rejects non-refs and empty refs", () => {
    expect(parseMediaRef("data:image/jpeg;base64,x")).toBeNull();
    expect(parseMediaRef("idbmedia:")).toBeNull();
    expect(parseMediaRef(null)).toBeNull();
  });
  it("classifies inline payloads", () => {
    expect(isInlinePayload("data:image/jpeg;base64,x")).toBe(true);
    expect(isInlinePayload("blob:http://x/y")).toBe(true);
    expect(isInlinePayload("file:///photos/a.jpg")).toBe(false);
    expect(isInlinePayload("")).toBe(false);
    expect(isInlinePayload(null)).toBe(false);
  });
});

describe("planAssetsPersist", () => {
  it("replaces inline payloads with refs and plans one payload per distinct URI", () => {
    const plan = planAssetsPersist([asset("a1")], new Map());
    expect(plan.payloads).toHaveLength(3); // report, thumb, original (all distinct)
    expect(plan.records[0]?.reportUri).toBe("idbmedia:a1:report");
    expect(plan.records[0]?.thumbUri).toBe("idbmedia:a1:thumb");
    expect(plan.records[0]?.originalUri).toBe("idbmedia:a1:original");
    expect(plan.records[0]?.annotatedUri).toBeNull();
    expect(plan.validKeys).toEqual(new Set(["a1:report", "a1:thumb", "a1:original"]));
  });

  it("stores original once when originalUri === reportUri (web pick tradeoff)", () => {
    const same = "data:image/jpeg;base64,SAME";
    const plan = planAssetsPersist([asset("a1", { originalUri: same, reportUri: same })], new Map());
    expect(plan.payloads.map((p) => p.key)).toEqual(["a1:report", "a1:thumb"]);
    expect(plan.records[0]?.originalUri).toBe("idbmedia:a1:report");
    expect(plan.records[0]?.reportUri).toBe("idbmedia:a1:report");
  });

  it("aliases URIs already stored this session instead of re-writing them", () => {
    const known = new Map([[`data:image/jpeg;base64,REPORT-a1`, "a1:report"]]);
    const plan = planAssetsPersist([asset("a1")], known);
    expect(plan.payloads.map((p) => p.key).sort()).toEqual(["a1:original", "a1:thumb"]);
    expect(plan.records[0]?.reportUri).toBe("idbmedia:a1:report");
    expect(plan.validKeys.has("a1:report")).toBe(true);
  });

  it("shares one payload when a duplicated issue copies the same URI strings", () => {
    const a = asset("a1");
    const copy = asset("a2", {
      originalUri: a.originalUri,
      reportUri: a.reportUri,
      thumbUri: a.thumbUri,
    });
    const plan = planAssetsPersist([a, copy], new Map());
    // 3 distinct URIs total (copy reuses a1's) -> 3 payloads, both records ref a1's keys
    expect(plan.payloads).toHaveLength(3);
    expect(plan.records[1]?.reportUri).toBe("idbmedia:a1:report");
    expect(plan.validKeys).toEqual(new Set(["a1:report", "a1:thumb", "a1:original"]));
  });

  it("passes through records that are already refs (no payloads, keys kept alive)", () => {
    const persisted = asset("a1", {
      originalUri: "idbmedia:a1:report",
      reportUri: "idbmedia:a1:report",
      thumbUri: "idbmedia:a1:thumb",
    });
    const plan = planAssetsPersist([persisted], new Map());
    expect(plan.payloads).toHaveLength(0);
    expect(plan.validKeys).toEqual(new Set(["a1:report", "a1:thumb"]));
    expect(plan.records[0]).toEqual(persisted);
  });

  it("leaves non-inline, non-ref URIs (native file paths) untouched", () => {
    const native = asset("a1", {
      originalUri: "file:///photos/orig_a1.jpg",
      reportUri: "file:///photos/report_a1.jpg",
      thumbUri: "file:///photos/thumb_a1.jpg",
    });
    const plan = planAssetsPersist([native], new Map());
    expect(plan.payloads).toHaveLength(0);
    expect(plan.records[0]).toEqual(native);
  });
});

describe("reviveAssetRecords", () => {
  it("resolves refs via the resolver and caches per key", async () => {
    const calls: string[] = [];
    const resolver = async (key: string) => {
      calls.push(key);
      return `blob:resolved/${key}`;
    };
    const persisted = [
      asset("a1", {
        originalUri: "idbmedia:a1:report",
        reportUri: "idbmedia:a1:report",
        thumbUri: "idbmedia:a1:thumb",
      }),
    ];
    const revived = await reviveAssetRecords(persisted, resolver);
    expect(revived[0]?.reportUri).toBe("blob:resolved/a1:report");
    expect(revived[0]?.originalUri).toBe("blob:resolved/a1:report");
    expect(revived[0]?.thumbUri).toBe("blob:resolved/a1:thumb");
    // report key resolved once despite two fields referencing it
    expect(calls.filter((k) => k === "a1:report")).toHaveLength(1);
  });

  it("keeps the record and blanks the field when a payload is missing", async () => {
    const revived = await reviveAssetRecords(
      [asset("a1", { reportUri: "idbmedia:a1:report" })],
      async () => null,
    );
    expect(revived[0]?.reportUri).toBe("");
    expect(revived[0]?.id).toBe("a1");
  });

  it("passes through inline and native URIs untouched", async () => {
    const legacy = asset("a1"); // inline data URIs (pre-migration persisted form)
    const revived = await reviveAssetRecords([legacy], async () => null);
    expect(revived[0]).toEqual(legacy);
  });
});
