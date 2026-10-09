import { RuntimeError } from "./errors";

export type PasswordLinkKind = "invite" | "recovery";
export type PasswordLink =
  | { kind: PasswordLinkKind; accessToken: string; refreshToken: string }
  | { kind: "invalid"; error: RuntimeError };

const LINK_KEYS = ["auth", "access_token", "refresh_token", "token_type", "expires_in", "expires_at", "type", "error", "error_code", "error_description", "code", "token_hash"];

export function unavailablePasswordLink() {
  return new RuntimeError("credentials", "This invitation or recovery link is expired, incomplete, or already used. Request a new password link below, or ask your workspace administrator for a new invitation.");
}

// The app is client-only. Supabase's default implicit invitation/recovery flow
// works when the email opens on a different device. Never let the SDK import
// arbitrary URL sessions automatically, or accept an arbitrary return URL.
// This function must run before routing/analytics can retain URL credentials.
export function consumePasswordLink(href: string, replaceUrl: (cleanUrl: string) => void): PasswordLink | null {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!LINK_KEYS.some((key) => url.searchParams.has(key) || fragment.has(key))) return null;

  const kind = fragment.get("type");
  const hint = url.searchParams.get("auth");
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  const duplicate = LINK_KEYS.some((key) => fragment.getAll(key).length > 1 || url.searchParams.getAll(key).length > 1);
  const valid = url.pathname === "/" && !duplicate
    && (kind === "invite" || kind === "recovery") && (!hint || hint === kind)
    && !!accessToken && !!refreshToken && fragment.get("token_type") === "bearer"
    && !["error", "error_code", "error_description", "code", "token_hash"].some((key) => fragment.has(key) || url.searchParams.has(key))
    && !["access_token", "refresh_token", "type"].some((key) => url.searchParams.has(key));
  try {
    // Drop all callback/query data, including provider error descriptions.
    // No secrets, return targets or callback markers remain in browser history.
    replaceUrl("/");
  } catch {
    return { kind: "invalid", error: new RuntimeError("storage", "The secure link could not be cleared from this browser. Close this tab and open a new invitation or recovery link in a supported browser.") };
  }
  if (!valid) return { kind: "invalid", error: unavailablePasswordLink() };
  return { kind, accessToken, refreshToken };
}

export function recoveryRedirect(origin: string) {
  // The current reviewed app origin is the sole destination. Configuration
  // must allowlist this exact URL in the existing Supabase development project.
  return new URL("/?auth=recovery", origin).href;
}

export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 12) throw new RuntimeError("validation", "Use at least 12 characters for your password.");
  if (password !== confirmation) throw new RuntimeError("validation", "The passwords do not match. Enter the same password in both fields.");
}
