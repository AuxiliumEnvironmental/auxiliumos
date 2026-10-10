import { useCallback, useEffect, useState } from "react";
import type { AccountDirectoryItem, DirectoryApi, DirectoryPage, FacilityDirectoryItem } from "./directory-api";
import { asRuntimeError, isAbort, RuntimeError } from "./errors";
import { useRuntime } from "./runtime";
import { useDirectoryPage } from "./use-directory";

export type PlanningScope = { accountId: string; facilityId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One memory-only directory per verified access generation. All reads remain RLS filtered. */
export class PlanningDirectory {
  private pages = new Map<string, Promise<DirectoryPage<AccountDirectoryItem> | DirectoryPage<FacilityDirectoryItem>>>();
  constructor(private api: DirectoryApi, private signal: AbortSignal) {}

  private page<T extends AccountDirectoryItem>(key: string, query: () => Promise<DirectoryPage<T>>) {
    let pending = this.pages.get(key) as Promise<DirectoryPage<T>> | undefined;
    if (!pending) {
      pending = query().catch(error => { this.pages.delete(key); throw error; });
      this.pages.set(key, pending);
    }
    return pending;
  }
  accounts = (afterId?: string) => this.page(`accounts:${afterId ?? ""}`, () => this.api.listAccounts({ afterId, signal: this.signal }));
  facilities = (accountId: string, afterId?: string) => this.page(`facilities:${accountId}:${afterId ?? ""}`, () => this.api.listFacilities({ accountId, afterId, signal: this.signal }));

  private async find<T extends AccountDirectoryItem>(id: string, page: (afterId?: string) => Promise<DirectoryPage<T>>) {
    if (!UUID.test(id)) return undefined;
    let cursor: string | undefined;
    do {
      const result = await page(cursor);
      const found = result.items.find(item => item.id === id);
      if (found) return found;
      // IDs are ordered. Stop only after an actual permitted page proves absence.
      if (!result.nextCursor || result.nextCursor >= id) return undefined;
      if (cursor && result.nextCursor <= cursor) throw new RuntimeError("backend", "The directory page could not be verified. Refresh your access and try again.");
      cursor = result.nextCursor;
    } while (!this.signal.aborted);
    throw new DOMException("Request canceled", "AbortError");
  }
  account = (id: string) => this.find(id, this.accounts);
  async resolve(accountId: string, facilityId?: string) {
    const account = await this.account(accountId);
    const facility = account && facilityId ? await this.find(facilityId, after => this.facilities(accountId, after)) : undefined;
    return { account, facility };
  }
}

type Resolution =
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; account?: AccountDirectoryItem; facility?: FacilityDirectoryItem }
  | { status: "error"; key: string; error: RuntimeError };

/** Picker, deep-link resolution and editor consume this single verified result. */
export function usePlanningContext(accountId?: string, facilityId?: string) {
  const { state, planningDirectory, draftMemory, handleFailure } = useRuntime();
  const revision = state.status === "ready" ? state.revision : "unavailable";
  const [attempt, setAttempt] = useState(0);
  const key = `${revision}:${accountId ?? ""}:${facilityId ?? ""}:${attempt}`;
  const [stored, setStored] = useState<Resolution>({ status: "loading", key: "" });
  const resolution: Resolution = stored.key === key ? stored : { status: "loading", key };
  const accountQuery = useCallback((after?: string) => planningDirectory!.accounts(after), [planningDirectory]);
  const accounts = useDirectoryPage(`${revision}:planning-accounts`, accountQuery);
  const account = resolution.status === "ready" ? resolution.account : undefined;
  const facilityQuery = useCallback((after?: string) => account && planningDirectory
    ? planningDirectory.facilities(account.id, after)
    : Promise.resolve({ items: [] as FacilityDirectoryItem[], nextCursor: null }), [account, planningDirectory]);
  const facilities = useDirectoryPage(`${revision}:${account?.id ?? "none"}:planning-facilities`, facilityQuery);

  useEffect(() => {
    let canceled = false;
    if (!planningDirectory || state.status !== "ready") return;
    const read = accountId ? planningDirectory.resolve(accountId, facilityId) : Promise.resolve({ account: undefined, facility: undefined });
    void read.then(result => {
      if (canceled) return;
      if (accountId && (!result.account || (facilityId && !result.facility))) {
        for (const [id, entry] of draftMemory) {
          if (entry.scope?.accountId === accountId && (!result.account || entry.scope.facilityId === facilityId)) draftMemory.delete(id);
        }
      }
      setStored({ status: "ready", key, ...result });
    }).catch((error: unknown) => {
      if (canceled || isAbort(error)) return;
      const failure = asRuntimeError(error);
      setStored({ status: "error", key, error: failure });
      handleFailure(failure);
    });
    return () => { canceled = true; };
  }, [accountId, draftMemory, facilityId, handleFailure, key, planningDirectory, state.status]);

  const facility = resolution.status === "ready" ? resolution.facility : undefined;
  return { accounts, facilities, account, facility, resolution,
    context: account && facility ? { accountId: account.id, facilityId: facility.id } : null,
    retry: () => { setAttempt(value => value + 1); accounts.retry(); facilities.retry(); },
  };
}
