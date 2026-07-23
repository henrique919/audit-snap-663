/**
 * Incoming deep links (e.g. `punchthis://auth/callback?code=...` from an
 * email confirmation or password-recovery link, see authRedirect.ts) must
 * reach `app/auth/*` unchanged so they can complete the auth flow — every
 * other unrecognized path still falls back to the home screen.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/auth/")) {
    return normalized;
  }
  return "/";
}
