import { useBlocker } from "@tanstack/react-router";
import { useCallback } from "react";
import type { PlanScope } from "./workspace-plan-api";
import { useRuntime } from "./runtime";

export type PlanningDraftEntry = { scope: PlanScope | null; value: unknown; dirty: boolean; locked: boolean };

/** Dirty drafts survive SPA navigation in memory. Unresolved operations cannot leave their screen. */
export function useDraftTransition() {
  const { draftMemory } = useRuntime();
  const unresolved = useCallback(() => [...draftMemory.values()].some(entry => entry.locked), [draftMemory]);
  return useBlocker({
    shouldBlockFn: ({ current, next }) => (current.pathname !== next.pathname || JSON.stringify(current.search) !== JSON.stringify(next.search)) && unresolved(),
    enableBeforeUnload: () => [...draftMemory.values()].some(entry => entry.dirty || entry.locked),
    withResolver: true,
  });
}
