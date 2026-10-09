import { Link } from "@tanstack/react-router";
import { ArrowRight, Grid2X2, Layers3, LockKeyhole, UserCircle } from "lucide-react";
import { PageHeader } from "../components/app-shell";
import { EmptyState, SyntheticBadge } from "../components/shared";
import { useRuntime } from "../lib/runtime";
import { ModuleFinder } from "./module-workspace";
import { RefreshButton } from "./directory";

export function ProfilePage() {
  const { state } = useRuntime();
  if (state.status !== "ready") return null;
  return <><PageHeader title="Account" description="Your current workspace profile." action={<RefreshButton />} /><section className="profile-panel" aria-labelledby="profile-heading"><span className="profile-avatar"><UserCircle size={32} aria-hidden="true" /></span><div><p className="entity-type">Signed in as</p><h2 id="profile-heading">{state.context.displayName}</h2><SyntheticBadge /></div></section><section className="info-panel"><div className="info-heading"><LockKeyhole size={20} aria-hidden="true" /><h2>Your directory access</h2></div><p>Account and facility entries reflect your current assigned access. Contact your workspace administrator to request a change.</p><Link className="inline-link" to="/">Open account directory<ArrowRight size={16} aria-hidden="true" /></Link></section></>;
}

export function ModulesPage() {
  return <><PageHeader eyebrow="AuxiliumOS · Operating suite" title="All modules" description="Account context, governed work and evidence across one operating suite." /><div className="module-boundary"><Layers3 size={20} /><p>Directory, intake and private-document adapters are connected for development. Other module records and actions are not connected.</p></div><ModuleFinder /></>;
}

export function NotFoundPage() {
  return <><PageHeader title="Page not found" /><EmptyState icon={FolderNotFoundIcon} title="This page is not available"><p>Use your directory or workspace navigation to continue.</p><Link className="button primary" to="/">Open account directory<ArrowRight size={16} aria-hidden="true" /></Link></EmptyState></>;
}

const FolderNotFoundIcon = Grid2X2;
