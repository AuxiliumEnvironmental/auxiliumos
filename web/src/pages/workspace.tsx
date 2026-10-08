import { Link } from "@tanstack/react-router";
import { ArrowRight, Grid2X2, Layers3, LockKeyhole, UserCircle } from "lucide-react";
import { PageHeader } from "../components/app-shell";
import { EmptyState, SyntheticBadge } from "../components/shared";
import { moduleForPath, modules } from "../lib/modules";
import { useRuntime } from "../lib/runtime";
import { RefreshButton } from "./directory";

export function ProfilePage() {
  const { state } = useRuntime();
  if (state.status !== "ready") return null;
  return <><PageHeader title="Account" description="Your current workspace profile." action={<RefreshButton />} /><section className="profile-panel" aria-labelledby="profile-heading"><span className="profile-avatar"><UserCircle size={32} aria-hidden="true" /></span><div><p className="entity-type">Signed in as</p><h2 id="profile-heading">{state.context.displayName}</h2><SyntheticBadge /></div></section><section className="info-panel"><div className="info-heading"><LockKeyhole size={20} aria-hidden="true" /><h2>Your directory access</h2></div><p>Account and facility entries reflect your current assigned access. Contact your workspace administrator to request a change.</p><Link className="inline-link" to="/">Open account directory<ArrowRight size={16} aria-hidden="true" /></Link></section></>;
}

export function ModulesPage() {
  return <><PageHeader eyebrow="The AuxiliumOS workspace" title="All modules" description="The complete destination, with a focused directory available today." /><div className="info-panel module-notice"><Layers3 size={22} aria-hidden="true" /><p>Sign-in and the account/facility directory are available in this development increment. The full modules below still require further implementation and verification.</p></div><div className="module-grid">{modules.map((module) => <article className="module-card" key={module.id}><div className="module-card-heading"><span className="module-number">{module.id}</span><span className="availability-label">{["M01", "M02", "M05"].includes(module.id) ? "Foundation slice" : "Not available yet"}</span></div><h2>{module.name}</h2><p>{module.description}</p>{module.id === "M02" ? <Link className="inline-link" to="/">Open directory<ArrowRight size={15} aria-hidden="true" /></Link> : module.id === "M05" ? <Link className="inline-link" to="/facilities" search={{}}>Open directory<ArrowRight size={15} aria-hidden="true" /></Link> : <Link className="inline-link" to="/$module" params={{ module: module.path }}>View module<ArrowRight size={15} aria-hidden="true" /></Link>}</article>)}</div></>;
}

export function UnavailablePage({ path }: { path: string }) {
  const module = moduleForPath(path);
  if (!module) return <NotFoundPage />;
  return <><PageHeader eyebrow={`${module.id} · Workspace module`} title={module.name} description={module.description} /><EmptyState icon={Layers3} title="Not available in this increment"><p>This module is part of the AuxiliumOS destination. Its workflows are not available in the current development workspace.</p><div className="button-row centered"><Link className="button primary" to="/">Open account directory<ArrowRight size={16} aria-hidden="true" /></Link><Link className="button secondary" to="/modules">View all modules<Grid2X2 size={16} aria-hidden="true" /></Link></div></EmptyState></>;
}

export function NotFoundPage() {
  return <><PageHeader title="Page not found" /><EmptyState icon={FolderNotFoundIcon} title="This page is not available"><p>Use your directory or workspace navigation to continue.</p><Link className="button primary" to="/">Open account directory<ArrowRight size={16} aria-hidden="true" /></Link></EmptyState></>;
}

const FolderNotFoundIcon = Grid2X2;
