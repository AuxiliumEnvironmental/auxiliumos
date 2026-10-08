import { RuntimeError } from "./errors";

export const OS_PROJECT_REF = "txofqxictwecgcnvezlb";

export type RuntimeConfig = {
  url: string;
  publishableKey: string;
  localTestBackend: boolean;
};

export type RuntimeEnvironment = {
  DEV: boolean;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_ALLOW_LOCAL_TEST_BACKEND?: string;
};

// Validate each supplied value even if the other is absent: a missing URL must
// never permit a secret key to enter a development response or build artifact.
export function validateRuntimeConfig(env: RuntimeEnvironment): RuntimeConfig | null {
  const rawUrl = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishableKey && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new RuntimeError("configuration", "VITE_SUPABASE_PUBLISHABLE_KEY must be a browser publishable key. Secret and service-role keys are not accepted.");
  }
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RuntimeError("configuration", "VITE_SUPABASE_URL must be a valid workspace URL.");
  }
  const cleanOrigin = !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  const isOsBackend = url.origin === `https://${OS_PROJECT_REF}.supabase.co`;
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
  const localTestBackend = env.DEV && env.VITE_ALLOW_LOCAL_TEST_BACKEND === "true" && isLocal;
  if (!cleanOrigin || (!isOsBackend && !localTestBackend)) {
    throw new RuntimeError("configuration", `This application requires the auxiliumos-dev backend (${OS_PROJECT_REF}). Check VITE_SUPABASE_URL.`);
  }
  if (!publishableKey) return null;
  return { url: url.origin, publishableKey, localTestBackend };
}

export function readRuntimeConfig(env: RuntimeEnvironment): RuntimeConfig {
  const config = validateRuntimeConfig(env);
  if (!config) throw new RuntimeError("configuration", "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for the auxiliumos-dev workspace.");
  return config;
}
