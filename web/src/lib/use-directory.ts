import { useCallback, useEffect, useState } from "react";
import type { DirectoryPage } from "./directory-api";
import { asRuntimeError, isAbort, type RuntimeError } from "./errors";
import { useRuntime } from "./runtime";

type PageState<T> =
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; result: DirectoryPage<T> }
  | { status: "error"; key: string; error: RuntimeError };

export function useDirectoryPage<T>(scopeKey: string, query: (afterId: string | undefined, signal: AbortSignal) => Promise<DirectoryPage<T>>) {
  const { handleFailure } = useRuntime();
  const [paging, setPaging] = useState<{ scopeKey: string; cursors: string[] }>({ scopeKey, cursors: [] });
  const cursors = paging.scopeKey === scopeKey ? paging.cursors : [];
  const [attempt, setAttempt] = useState(0);
  const afterId = cursors[cursors.length - 1];
  const key = `${scopeKey}:${afterId ?? "first"}:${attempt}`;
  const [stored, setStored] = useState<PageState<T>>({ status: "loading", key: "" });
  // A key mismatch hides old rows during the render before effect cleanup runs.
  const state: PageState<T> = stored.key === key ? stored : { status: "loading", key };

  useEffect(() => {
    const controller = new AbortController();
    setStored({ status: "loading", key });
    void query(afterId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setStored({ status: "ready", key, result });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbort(error)) return;
      const failure = asRuntimeError(error);
      setStored({ status: "error", key, error: failure });
      handleFailure(failure);
    });
    return () => controller.abort();
  }, [afterId, handleFailure, key, query]);

  return {
    state,
    page: cursors.length + 1,
    retry: () => setAttempt((value) => value + 1),
    next: () => {
      if (state.status === "ready" && state.result.nextCursor) setPaging({ scopeKey, cursors: [...cursors, state.result.nextCursor] });
    },
    previous: () => setPaging({ scopeKey, cursors: cursors.slice(0, -1) }),
  };
}

export function useAccounts() {
  const { api, state } = useRuntime();
  const scopeKey = state.status === "ready" ? `${state.context.profileId}:${state.revision}:accounts` : "unavailable";
  const query = useCallback((afterId: string | undefined, signal: AbortSignal) => api.listAccounts({ afterId, signal }), [api]);
  return useDirectoryPage(scopeKey, query);
}
