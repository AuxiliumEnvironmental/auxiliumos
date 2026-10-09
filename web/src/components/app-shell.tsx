import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, Box, BarChart3, BriefcaseBusiness, Building2, ChevronRight, ClipboardCheck, ClipboardList, FileText, FolderKanban, Grid2X2, Layers3, LayoutList, LogOut, Menu, MessageSquare, Network, ScanLine, ShieldCheck, UserCircle, Users, Wallet, WandSparkles, X } from "lucide-react";
import { useRuntime } from "../lib/runtime";
import { moduleForPath } from "../lib/modules";
import { Brand, DevelopmentBanner } from "./shared";
import { Button } from "./button";

const groups = [
  { title: "Workspace", items: [
    { path: "core", label: "Home", icon: LayoutList }, { path: "accounts", label: "Accounts", icon: BriefcaseBusiness },
    { path: "facilities", label: "Facilities", icon: Building2 }, { path: "intake", label: "Intake", icon: ClipboardList },
    { path: "projects", label: "Projects", icon: FolderKanban }, { path: "documents", label: "Documents", icon: FileText },
    { path: "spatial", label: "Spatial", icon: Box },
    { path: "messages", label: "Communications", icon: MessageSquare },
  ] },
  { title: "Planning & delivery", items: [
    { path: "programs", label: "Programs / MSA", icon: Layers3 }, { path: "portfolios", label: "Portfolios", icon: Network },
    { path: "readiness", label: "Site passport", icon: ScanLine }, { path: "scope", label: "Scope", icon: LayoutList },
    { path: "sampling", label: "Sampling", icon: Activity }, { path: "estimates", label: "ROM estimates", icon: BarChart3 },
    { path: "approvals", label: "Authorization", icon: ClipboardCheck }, { path: "vendors", label: "Vendors", icon: Users },
  ] },
  { title: "Oversight", items: [
    { path: "finance", label: "Finance", icon: Wallet }, { path: "reports", label: "Reporting / QBR", icon: BarChart3 },
    { path: "ai", label: "AI assistance", icon: WandSparkles }, { path: "audit", label: "Audit", icon: ShieldCheck },
    { path: "integrations", label: "Integrations", icon: Network },
  ] },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const active = pathname === "/" ? "accounts" : pathname.slice(1);
  const [filter, setFilter] = useState("");
  return <nav aria-label="Primary navigation" onClick={event => { if ((event.target as Element).closest("a")) close?.(); }}>
    <div className="nav-search"><label className="sr-only" htmlFor={close ? "mobile-module-filter" : "module-filter"}>Filter navigation</label><input id={close ? "mobile-module-filter" : "module-filter"} type="search" placeholder="Find a module" value={filter} onChange={event => setFilter(event.target.value)} /></div>
    {groups.map(group => {
      const items = group.items.filter(item => item.label.toLowerCase().includes(filter.toLowerCase()));
      return items.length ? <div key={group.title}><p className="nav-label">{group.title}</p><ul className="nav-list">{items.map(item => <li key={item.path}>{item.path === "accounts" ? <Link to="/" className={`nav-link${active === item.path ? " is-active" : ""}`} aria-current={active === item.path ? "page" : undefined}><item.icon size={17} aria-hidden="true" />{item.label}</Link> : item.path === "spatial" ? <Link to="/spatial" className={`nav-link${active === item.path ? " is-active" : ""}`} aria-current={active === item.path ? "page" : undefined}><item.icon size={17} aria-hidden="true" />{item.label}</Link> : item.path === "facilities" || item.path === "intake" || item.path === "documents" ? <Link to={`/${item.path}`} search={{}} className={`nav-link${active === item.path ? " is-active" : ""}`} aria-current={active === item.path ? "page" : undefined}><item.icon size={17} aria-hidden="true" />{item.label}</Link> : <Link to="/$module" params={{ module: item.path }} className={`nav-link${active === item.path ? " is-active" : ""}`} aria-current={active === item.path ? "page" : undefined}><item.icon size={17} aria-hidden="true" />{item.label}</Link>}</li>)}</ul></div> : null;
    })}
    {filter && !groups.some(group => group.items.some(item => item.label.toLowerCase().includes(filter.toLowerCase()))) && <p className="nav-empty" role="status">No matching modules</p>}
    <div className="nav-account"><Link to="/modules" className="nav-link" activeProps={{ className: "is-active", "aria-current": "page" }}><Grid2X2 size={17} />All modules<ArrowUpRight className="nav-tail" size={14} /></Link><Link to="/account" className="nav-link" activeProps={{ className: "is-active", "aria-current": "page" }}><UserCircle size={17} />My account</Link></div>
  </nav>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state, config, signOut } = useRuntime();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const screen = pathname === "/" ? "Accounts" : pathname === "/facilities" ? "Facilities" : pathname === "/account" ? "My account" : pathname === "/modules" ? "All modules" : moduleForPath(pathname.slice(1))?.name ?? "Workspace";
  const dialog = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => dialog.current?.close();
  const displayName = state.status === "ready" ? state.context.displayName : "";
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 900) dialog.current?.close(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar"><div className="sidebar-brand"><Brand /><p>Enterprise operating suite</p></div><Navigation /><div className="sidebar-note"><span className="status-dot" /><div><strong>Development workspace</strong><span>Synthetic records only</span></div></div></aside>
    <dialog ref={dialog} id="mobile-navigation" className="mobile-navigation" aria-label="Workspace navigation" onClose={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}><div className="mobile-navigation-header"><Brand /><Button variant="text-button" className="icon-button" aria-label="Close navigation" onClick={closeMenu}><X size={22} /></Button></div><Navigation close={closeMenu} /></dialog>
    <div className="workspace"><DevelopmentBanner local={config.localTestBackend} /><header className="workspace-header"><div className="header-location"><Button variant="text-button" className="icon-button mobile-menu-button" aria-label="Open navigation" aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={() => { dialog.current?.showModal(); setMenuOpen(true); }}><Menu size={22} /></Button><Link to="/$module" params={{ module: "core" }}>Workspace</Link><ChevronRight size={14} /><span className="breadcrumb-current">{screen}</span></div><div className="session-controls"><span className="session-name"><span className="avatar"><UserCircle size={19} /></span><span>{displayName}</span></span><Button variant="text-button" className="compact" onClick={() => { void signOut(); }}>Sign out<LogOut size={16} /></Button></div></header><main id="main-content" className="page-content" tabIndex={-1}>{children}</main><footer className="workspace-footer">AuxiliumOS<span>Assigned access · Private workspace</span></footer></div>
  </div>;
}

export function PageHeader({ eyebrow = "Your workspace", title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { document.title = `${title} | AuxiliumOS`; heading.current?.focus({ preventScroll: true }); }, [title]);
  return <header className="page-header"><div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1 ref={heading} tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-actions">{action}</div>}</header>;
}
