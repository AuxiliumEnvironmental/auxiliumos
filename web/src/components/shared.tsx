import { AlertCircle, ArrowRight, LoaderCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RuntimeError } from "../lib/errors";

export function Brand() {
  return <div className="brand"><span className="brand-mark" aria-hidden="true">A<span /></span><span>Auxilium<span className="brand-os">OS</span></span></div>;
}

export function DevelopmentBanner({ local = false }: { local?: boolean }) {
  return <div className={`development-banner${local ? " local-test-banner" : ""}`}><ShieldCheck size={16} aria-hidden="true" /><span><strong>{local ? "Local test workspace" : "Development"}</strong><span className="banner-divider" aria-hidden="true">/</span><span className="dataset-pill">Sample dataset</span>Items marked Sample are illustrations; saved items are synthetic development records. No PHI or real client data.</span></div>;
}

export function SyntheticBadge() {
  return <span className="badge">Synthetic</span>;
}

export function LoadingState({ label = "Loading directory" }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spinner" size={22} aria-hidden="true" /><span>{label}…</span></div>;
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="state-icon"><Icon size={24} aria-hidden="true" /></span><h2>{title}</h2>{children && <div className="empty-description">{children}</div>}</div>;
}

export function ErrorState({ error, onRetry }: { error: RuntimeError; onRetry?: () => void }) {
  return <div className="error-state" role="alert"><AlertCircle size={20} aria-hidden="true" /><div><h2>Information could not be loaded</h2><p>{error.message}</p>{error.retryable && onRetry && <button className="button secondary compact" onClick={onRetry}>Try again<ArrowRight size={16} aria-hidden="true" /></button>}</div></div>;
}

export function Pagination({ page, nextCursor, onNext, onPrevious, label }: { page: number; nextCursor: string | null; onNext: () => void; onPrevious: () => void; label: string }) {
  if (page === 1 && !nextCursor) return null;
  return <nav className="pagination" aria-label={label}><span>Page {page}</span><div><button className="button secondary compact" disabled={page === 1} onClick={onPrevious}>Previous page</button><button className="button secondary compact" disabled={!nextCursor} onClick={onNext}>Next page<ArrowRight size={15} aria-hidden="true" /></button></div></nav>;
}
