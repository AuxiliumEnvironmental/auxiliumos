import { useEffect, useState } from "react";
import { useTextScale } from "../../spatial-source/web/src/ui/useTextScale";
import { startOfflineShell, type OfflineState } from "./register";

const MESSAGES: Record<OfflineState["kind"], string> = {
  unavailable: "",
  preparing: "Saving a copy of the app code for offline use…",
  ready: "This app can reopen offline in this browser.",
  incomplete: "The offline copy of the app is incomplete, so offline reopening is not available right now.",
  "update-waiting": "An app update is saved. It applies after every Spatial tab is closed.",
  failed: "The offline copy could not be saved. The app still works online.",
};

/**
 * Compact host toast does not shift the map during a gesture. Routine ready
 * feedback expires; warnings stay dismissible. Text and 44px targets scale.
 * Shows only app-code cache state — never layout, document or account data.
 */
export function OfflineStatus({ servedOffline = false }: { servedOffline?: boolean }) {
  const { scale } = useTextScale();
  const [state, setState] = useState<OfflineState | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => startOfflineShell(setState), []);
  useEffect(() => {
    setHidden(false);
    if (state?.kind !== "ready" || servedOffline) return;
    const timer = window.setTimeout(() => setHidden(true), 4000);
    return () => window.clearTimeout(timer);
  }, [state?.kind, servedOffline]);
  let text = state ? MESSAGES[state.kind] : "";
  if (state?.kind === "unavailable") text = `Offline reopening is not available here (${state.reason}).`;
  if (servedOffline) text = "Opened offline from this browser's saved copy of the app. Changes save on this device.";
  if (!text || hidden) return null;
  return (
    <section
      aria-label="Offline availability"
      data-offline-state={servedOffline ? "served-offline" : state?.kind}
      style={{
        position: "fixed", bottom: "max(12px, env(safe-area-inset-bottom, 0px))", left: 12, right: 12, maxWidth: 480, zIndex: 50, borderRadius: 10,
        display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "nowrap",
        padding: "0.25rem 0.25rem 0.25rem 1rem", margin: "0 auto",
        font: "inherit", fontFamily: "system-ui, sans-serif", fontSize: `${0.75 * scale}rem`, lineHeight: 1.4,
        background: "#122a39", color: "#f4f7f9",
      }}
    >
      <p role="status" aria-live="polite" style={{ margin: 0, flex: "1 1 0", minWidth: 0, overflowWrap: "anywhere" }}>{text}</p>
      <button
        type="button"
        aria-label="Dismiss offline notice"
        title="Dismiss offline notice"
        onClick={() => setHidden(true)}
        style={{
          minWidth: 44, minHeight: 44, flexShrink: 0, padding: "0 0.75rem", font: "inherit",
          background: "transparent", color: "inherit", border: "1px solid currentColor",
          borderRadius: 6, cursor: "pointer",
        }}
      >
        ×
      </button>
    </section>
  );
}
