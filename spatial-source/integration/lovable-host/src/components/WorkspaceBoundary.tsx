import { Component, type ReactNode } from "react";
import { useTextScale } from "../../spatial-source/web/src/ui/useTextScale";
import { SPATIAL_ERROR_CODE } from "../lib/lovable-error-reporting";

// Host-only local fallback shared by the online route and the offline shell.
// Shows only a fixed code, never the raw error; nothing is logged or forwarded.
export class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean; key: number }> {
  override state = { failed: false, key: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    // Intentionally not logged or forwarded.
  }
  override render() {
    if (this.state.failed) {
      return (
        <WorkspaceFallback onReopen={() => this.setState((s) => ({ failed: false, key: s.key + 1 }))} />
      );
    }
    return <div key={this.state.key} style={{ display: "contents" }}>{this.props.children}</div>;
  }
}

function WorkspaceFallback({ onReopen }: { onReopen: () => void }) {
  const { scale } = useTextScale();
  return (
    <div role="alert" style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", fontSize: `${scale}rem`, overflowWrap: "anywhere" }}>
      <p style={{ margin: "0 0 1rem" }}>
        The workspace stopped unexpectedly ({SPATIAL_ERROR_CODE}). Your saved layouts stay in this browser.
      </p>
      <button type="button" onClick={onReopen} style={{ minWidth: 44, minHeight: 44, maxWidth: "100%", padding: "0.5rem 1rem", font: "inherit", overflowWrap: "anywhere", cursor: "pointer" }}>
        Reopen workspace
      </button>
    </div>
  );
}
