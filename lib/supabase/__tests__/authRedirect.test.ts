import { getAuthRedirectUrl } from "@/lib/supabase/authRedirect";

describe("getAuthRedirectUrl", () => {
  it("builds a scheme:// deep link on native", () => {
    const url = getAuthRedirectUrl("auth/callback", { platformOS: "ios", scheme: "punchthis" });
    expect(url).toBe("punchthis://auth/callback");
  });

  it("builds a scheme:// deep link on android with a leading slash in the path", () => {
    const url = getAuthRedirectUrl("/auth/reset-password", { platformOS: "android", scheme: "punchthis" });
    expect(url).toBe("punchthis://auth/reset-password");
  });

  it("builds a same-origin URL on web", () => {
    const url = getAuthRedirectUrl("auth/callback", {
      platformOS: "web",
      scheme: "punchthis",
      webOrigin: "https://punchthis.app",
    });
    expect(url).toBe("https://punchthis.app/auth/callback");
  });

  it("strips a trailing slash from the web origin", () => {
    const url = getAuthRedirectUrl("auth/callback", {
      platformOS: "web",
      scheme: "punchthis",
      webOrigin: "https://punchthis.app/",
    });
    expect(url).toBe("https://punchthis.app/auth/callback");
  });

  it("falls back to a relative path on web when no origin is known", () => {
    const url = getAuthRedirectUrl("auth/callback", { platformOS: "web", scheme: "punchthis", webOrigin: null });
    expect(url).toBe("/auth/callback");
  });

  it("defaults the path to auth/callback", () => {
    const url = getAuthRedirectUrl(undefined, { platformOS: "ios", scheme: "punchthis" });
    expect(url).toBe("punchthis://auth/callback");
  });
});
