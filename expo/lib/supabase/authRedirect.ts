/**
 * Auth redirect URL construction.
 *
 * Native: deep link back into the app via the `punchthis://` scheme
 * (registered in app.json), landing on `app/auth/callback.tsx` (or another
 * `app/auth/*` route for password recovery).
 * Web: a normal same-origin URL, since Supabase's web flow completes via
 * the browser's own location bar (`detectSessionInUrl`).
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

export interface AuthRedirectEnv {
  platformOS: string;
  /** app.json `expo.scheme` (e.g. "punchthis"). */
  scheme: string;
  /** `window.location.origin` on web; ignored on native. */
  webOrigin?: string | null;
}

function defaultEnv(): AuthRedirectEnv {
  const scheme = (Constants.expoConfig?.scheme as string | undefined) ?? "punchthis";
  const webOrigin = typeof window !== "undefined" && window.location ? window.location.origin : null;
  return { platformOS: Platform.OS, scheme, webOrigin };
}

/**
 * Build the redirect URL passed to Supabase auth calls (`signUp`,
 * `resetPasswordForEmail`, OAuth, etc). `path` is relative, e.g.
 * `"auth/callback"` or `"auth/reset-password"`.
 */
export function getAuthRedirectUrl(path: string = "auth/callback", env?: AuthRedirectEnv): string {
  const resolved = env ?? defaultEnv();
  const cleanPath = path.replace(/^\/+/, "");

  if (resolved.platformOS === "web") {
    const origin = (resolved.webOrigin ?? "").replace(/\/+$/, "");
    return origin ? `${origin}/${cleanPath}` : `/${cleanPath}`;
  }

  return `${resolved.scheme}://${cleanPath}`;
}
