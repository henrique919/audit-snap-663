import * as legalCopy from "@/lib/legalCopy";
import {
  BLUR_REDACTION,
  BUILD_ID,
  buildSupportMailto,
  CAMERA_PHOTOS,
  EXPORT_SHARING,
  LOCAL_STORAGE_WARNING,
  PRODUCT_SCOPE,
  PROVISIONAL_NOTICE,
  PUBLISHER_NAME,
  REPORT_FOOTER_NOTE,
  RETENTION_DELETION,
  SUPPORT_EMAIL,
} from "@/lib/legalCopy";

const COPY_CONSTANTS = [
  PRODUCT_SCOPE,
  LOCAL_STORAGE_WARNING,
  CAMERA_PHOTOS,
  BLUR_REDACTION,
  RETENTION_DELETION,
  EXPORT_SHARING,
  REPORT_FOOTER_NOTE,
  PROVISIONAL_NOTICE,
];

describe("legalCopy constants", () => {
  it("exports every required constant as a non-empty string", () => {
    for (const value of COPY_CONSTANTS) {
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
    expect(typeof SUPPORT_EMAIL).toBe("string");
    expect(SUPPORT_EMAIL).toBe("henrysestak@gmail.com");
    expect(typeof PUBLISHER_NAME).toBe("string");
    expect(PUBLISHER_NAME.length).toBeGreaterThan(0);
    expect(typeof BUILD_ID).toBe("string");
    expect(BUILD_ID).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("states the provisional-review notice exactly", () => {
    expect(PROVISIONAL_NOTICE).toBe("Provisional wording pending legal review.");
  });

  it("documents that Clear all data deletes owned files immediately, and that sent exports are outside the app's control", () => {
    const lower = RETENTION_DELETION.toLowerCase();
    expect(lower).toContain("clear all data");
    expect(lower).toContain("immediately");
    expect(lower).toMatch(/photo/);
    expect(lower).toMatch(/report/);
    expect(lower).toMatch(/brand/);
    expect(lower).toMatch(/export|shar/);
    expect(lower).toContain("outside");
  });
});

describe("buildSupportMailto", () => {
  it("builds a mailto link to the support address with a versioned subject", () => {
    const link = buildSupportMailto("1.2.3");
    expect(link.startsWith(`mailto:${SUPPORT_EMAIL}?subject=`)).toBe(true);
    const subject = decodeURIComponent(link.split("subject=")[1] ?? "");
    expect(subject).toBe("PunchThis support — v1.2.3");
  });

  it("encodes the subject for use in a URL", () => {
    const link = buildSupportMailto("2.0");
    expect(link).toContain(encodeURIComponent("PunchThis support — v2.0"));
  });
});

describe("wording honesty", () => {
  const BANNED_PHRASES = ["cloud backup", "encrypted", "secure storage", "guaranteed"];

  it("never claims cloud backup, encryption, secure storage, or guaranteed retention", () => {
    const haystack = Object.entries(legalCopy)
      .filter(([, value]) => typeof value === "string")
      .map(([, value]) => value as string)
      .join("\n")
      .toLowerCase();

    for (const phrase of BANNED_PHRASES) {
      expect(haystack).not.toContain(phrase);
    }
  });
});
