import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RuntimeConfig } from "./config";
import type { AuthStorageLease } from "./auth-storage";
import { RuntimeError, serviceError } from "./errors";

export const DIRECTORY_SELECTORS = {
  profile: "id,display_name,identity_status,is_demo",
  accounts: "id,display_name,is_demo",
  facilities: "id,account_id,display_name,is_demo",
} as const;

export type RuntimeContext = { profileId: string; displayName: string; development: true };
export type RuntimeContextResult =
  | { status: "ready"; context: RuntimeContext }
  | { status: "unauthenticated" }
  | { status: "access_unavailable" };
export type AccountDirectoryItem = { id: string; displayName: string; isDemo: true };
export type FacilityDirectoryItem = AccountDirectoryItem & { accountId: string };
export type DirectoryPage<T> = { items: T[]; nextCursor: string | null };
export type PageOptions = { afterId?: string; limit?: number; signal?: AbortSignal };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new RuntimeError("validation", `Choose a valid ${label}.`);
  }
}

function pageArguments({ afterId, limit = 50 }: PageOptions) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RuntimeError("validation", "Page size must be a whole number from 1 to 100.");
  }
  if (afterId !== undefined) assertUuid(afterId, "directory cursor");
  return { afterId, limit };
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Request canceled", "AbortError");
}

function badResponse(): never {
  throw new RuntimeError("backend", "The workspace returned an unexpected directory response. Contact your workspace administrator.");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return badResponse();
  return value as Record<string, unknown>;
}

function accountItem(value: unknown): AccountDirectoryItem {
  const row = record(value);
  if (typeof row.id !== "string" || !UUID.test(row.id) || typeof row.display_name !== "string" || !row.display_name.trim() || row.is_demo !== true) return badResponse();
  return { id: row.id, displayName: row.display_name, isDemo: true };
}

function pageResult<T extends { id: string }>(data: unknown, limit: number, parse: (value: unknown) => T): DirectoryPage<T> {
  if (!Array.isArray(data) || data.length > limit + 1) return badResponse();
  const rows = data.map(parse);
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}

// Auth uses the supported client. Application rows have no persistent response cache.
// A bounded fetch timeout also covers getUser(), whose API has no AbortSignal option.
async function runtimeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const signal = init?.signal;
  const abort = () => controller.abort();
  const timeout = window.setTimeout(abort, 15_000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" });
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function createRuntimeClient(config: RuntimeConfig, lease: AuthStorageLease): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: lease.mode === "persistent",
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: lease.owner.sessionKey,
      storage: lease.storage,
    },
    global: { fetch: runtimeFetch },
  });
}

export class DirectoryApi {
  constructor(public client: SupabaseClient) {}

  async loadRuntimeContext({ signal }: { signal?: AbortSignal } = {}): Promise<RuntimeContextResult> {
    checkAborted(signal);
    const { data, error } = await this.client.auth.getUser();
    checkAborted(signal);
    if (error) {
      const failure = serviceError(error);
      if (failure.code === "session_expired") return { status: "unauthenticated" };
      throw failure;
    }
    if (!data.user || data.user.is_anonymous) return { status: "unauthenticated" };
    let query = this.client.from("user_profiles").select(DIRECTORY_SELECTORS.profile).retry(false);
    if (signal) query = query.abortSignal(signal);
    const response = await query;
    checkAborted(signal);
    if (response.error) throw serviceError(response.error, response.status);
    if (!Array.isArray(response.data)) return badResponse();
    if (response.data.length === 0) return { status: "access_unavailable" };
    if (response.data.length !== 1) return badResponse();
    const row = record(response.data[0]);
    const profile = accountItem(row);
    if (row.identity_status !== "active") return { status: "access_unavailable" };
    return { status: "ready", context: { profileId: profile.id, displayName: profile.displayName, development: true } };
  }

  async listAccounts(options: PageOptions = {}): Promise<DirectoryPage<AccountDirectoryItem>> {
    const { afterId, limit } = pageArguments(options);
    checkAborted(options.signal);
    let query = this.client.from("client_accounts")
      .select(DIRECTORY_SELECTORS.accounts).order("id", { ascending: true }).limit(limit + 1).retry(false);
    if (afterId) query = query.gt("id", afterId);
    if (options.signal) query = query.abortSignal(options.signal);
    const response = await query;
    checkAborted(options.signal);
    if (response.error) throw serviceError(response.error, response.status);
    return pageResult(response.data, limit, accountItem);
  }

  async listFacilities(options: PageOptions & { accountId: string }): Promise<DirectoryPage<FacilityDirectoryItem>> {
    assertUuid(options.accountId, "account");
    const accountId = options.accountId.toLowerCase();
    const { afterId, limit } = pageArguments(options);
    checkAborted(options.signal);
    let query = this.client.from("facilities")
      .select(DIRECTORY_SELECTORS.facilities).eq("account_id", accountId)
      .order("id", { ascending: true }).limit(limit + 1).retry(false);
    if (afterId) query = query.gt("id", afterId);
    if (options.signal) query = query.abortSignal(options.signal);
    const response = await query;
    checkAborted(options.signal);
    if (response.error) throw serviceError(response.error, response.status);
    return pageResult(response.data, limit, (value) => {
      const row = record(value);
      if (row.account_id !== accountId) return badResponse();
      return { ...accountItem(row), accountId };
    });
  }
}
