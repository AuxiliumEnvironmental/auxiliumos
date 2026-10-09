import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { asRuntimeError, isAbort, type RuntimeError } from "./errors";
import { useRuntime } from "./runtime";
import { WorkspacePlanApi, type PlanSaveRequest, type PlanSchema, type PlanScope, type WorkspacePlan, type WorkspacePlanSummary } from "./workspace-plan-api";

type ListState =
  | { status: "idle"; key: string }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; plans: WorkspacePlanSummary[] }
  | { status: "error"; key: string; error: RuntimeError };

export type PlanResult = { ok: true; plan: WorkspacePlan } | { ok: false; error: RuntimeError } | null;

/**
 * Planning drafts live only in this React subtree. Nothing is written to
 * browser storage, the URL or a cache. A key change hides previous rows during
 * render, aborts pending requests and rejects late completions.
 */
export function useWorkspacePlans(scope: PlanScope | null, schema: PlanSchema) {
  const { api, state, handleFailure } = useRuntime();
  const planApi = useMemo(() => new WorkspacePlanApi(api.client), [api]);
  const session = state.status === "ready" ? `${state.context.profileId}:${state.revision}` : null;
  const key = session && scope ? `${session}:${scope.accountId}:${scope.facilityId}:${scope.moduleKey}:${scope.panelKey}` : "none";
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<ListState>({ status: "idle", key: "" });
  const keyRef = useRef(key);
  keyRef.current = key;
  const pending = useRef(new Set<AbortController>());
  const listKey = `${key}:${attempt}`;
  const list: ListState = key === "none" ? { status: "idle", key } : stored.key === listKey ? stored : { status: "loading", key: listKey };

  const report = useCallback((error: unknown) => {
    const failure = asRuntimeError(error);
    handleFailure(failure);
    return failure;
  }, [handleFailure]);

  useEffect(() => {
    const controllers = pending.current;
    return () => { for (const controller of controllers) controller.abort(); controllers.clear(); };
  }, [key]);

  useEffect(() => {
    if (key === "none" || !scope) return;
    const controller = new AbortController();
    setStored({ status: "loading", key: listKey });
    planApi.list(scope, controller.signal).then((plans) => {
      if (!controller.signal.aborted) setStored({ status: "ready", key: listKey, plans });
    }).catch((error: unknown) => {
      if (controller.signal.aborted || isAbort(error)) return;
      setStored({ status: "error", key: listKey, error: report(error) });
    });
    return () => controller.abort();
    // scope/schema identity is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, planApi, report]);

  const run = useCallback(async (work: (signal: AbortSignal) => Promise<WorkspacePlan>): Promise<PlanResult> => {
    const startedKey = keyRef.current;
    if (startedKey === "none") return null;
    const controller = new AbortController();
    pending.current.add(controller);
    try {
      const plan = await work(controller.signal);
      if (controller.signal.aborted || keyRef.current !== startedKey) return null;
      return { ok: true, plan };
    } catch (error) {
      if (controller.signal.aborted || isAbort(error) || keyRef.current !== startedKey) return null;
      return { ok: false, error: report(error) };
    } finally {
      pending.current.delete(controller);
    }
  }, [report]);

  const open = useCallback((planId: string) => scope ? run((signal) => planApi.get(planId, scope, schema, signal)) : Promise.resolve(null), [planApi, run, schema, scope]);
  /** Sends the exact immutable request supplied, including on an explicit retry. */
  /** Never replaces a higher known revision with an older (e.g. idempotent retry) one. */
  const remember = useCallback((plan: WorkspacePlanSummary) => {
    setStored((old) => {
      if (old.status !== "ready" || old.key !== `${keyRef.current}:${attempt}`) return old;
      const known = old.plans.find((item) => item.id === plan.id);
      if (known && known.revision > plan.revision) return old;
      const summary: WorkspacePlanSummary = { id: plan.id, accountId: plan.accountId, facilityId: plan.facilityId, moduleKey: plan.moduleKey, panelKey: plan.panelKey, title: plan.title, revision: plan.revision, createdAt: plan.createdAt, updatedAt: plan.updatedAt, isDemo: true, state: "planning_draft" };
      return { ...old, plans: [summary, ...old.plans.filter((item) => item.id !== plan.id)].slice(0, 100) };
    });
  }, [attempt]);
  const save = useCallback(async (request: PlanSaveRequest) => {
    const result = await run((signal) => planApi.save(request, schema, signal));
    if (result?.ok) remember(result.plan);
    return result;
  }, [planApi, remember, run, schema]);
  const refresh = useCallback(async (planId: string) => {
    const result = await open(planId);
    if (result?.ok) remember(result.plan);
    return result;
  }, [open, remember]);

  return { key, list, reload: () => setAttempt((value) => value + 1), open, save, refresh };
}
