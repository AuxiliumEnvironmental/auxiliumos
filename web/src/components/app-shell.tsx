import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, BarChart3, Building2, ChevronRight, ClipboardCheck, ClipboardList, FileText, FolderKanban, Grid2X2, LogOut, Menu, MessageSquare, PanelsTopLeft, UserCircle, X } from "lucide-react";
import { useRuntime } from "../lib/runtime";
import { Brand, DevelopmentBanner } from "./shared";

const moduleNav = [
  { path: "projects", label: "Projects", icon: FolderKanban },
  { path: "documents", label: "Documents", icon: FileText },
  { path: "messages", label: "Messages", icon: MessageSquare },
  { path: "approvals", label: "Approvals", icon: ClipboardCheck },
  { path: "reports", label: "Reports", icon: BarChart3 },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return <nav aria-label="Primary navigation" onClick={(event) => { if ((event.target as Element).closest("a")) close?.(); }}><p className="nav-label">Workspace</p><ul className="nav-list"><li><Link to="/" activeOptions={{ exact: true }} className="nav-link" activeProps={{ className: "is-active", "aria-current": "page" }}><PanelsTopLeft size={18} aria-hidden="true" />Accounts</Link></li><li><Link to="/facilities" search={{}} className="nav-link" activeProps={{ className: "is-active", "aria-current": "page" }}><Building2 size={18} aria-hidden="true" />Facilities</Link></li><li><Link to="/intake" search={{}} className="nav-link" activeProps={{ className: "is-active", "aria-current": "page" }}><ClipboardList size={18} aria-hidden="true" />Intake</Link></li></ul><p className="nav-label nav-label-secondary">Continue exploring</p><ul className="nav-list">{moduleNav.map((item) => <li key={item.path}><Link to="/$module" params={{ module: item.path }} className={`nav-link${pathname === `/${item.path}` ? " is-active" : ""}`} aria-current={pathname === `/${item.path}` ? "page" : undefined}><item.icon size={18} aria-hidden="true" />{item.label}</Link></li>)}<li><Link to="/modules" className="nav-link" activeProps={{ className: "is-active", "aria-current": "page" }}><Grid2X2 size={18} aria-hidden="true" />All modules<ArrowUpRight className="nav-tail" size={14} aria-hidden="true" /></Link></li></ul><div className="nav-account"><Link to="/account" className="nav-link" activeProps={{ className: "is-active", "aria-current": "page" }}><UserCircle size={18} aria-hidden="true" />Account</Link></div></nav>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state, config, signOut } = useRuntime();
  const dialog = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => dialog.current?.close();
  const displayName = state.status === "ready" ? state.context.displayName : "";
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 900) dialog.current?.close(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><aside className="sidebar"><div className="sidebar-brand"><Brand /><p>Operating workspace</p></div><Navigation /><div className="sidebar-note"><span className="status-dot" aria-hidden="true" /><div><strong>Development only</strong><span>Directory and intake</span></div></div></aside><dialog ref={dialog} id="mobile-navigation" className="mobile-navigation" aria-label="Workspace navigation" onClose={() => setMenuOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) closeMenu(); }}><div className="mobile-navigation-header"><Brand /><button className="icon-button" aria-label="Close navigation" onClick={closeMenu}><X size={22} aria-hidden="true" /></button></div><Navigation close={closeMenu} /></dialog><div className="workspace"><DevelopmentBanner local={config.localTestBackend} /><header className="workspace-header"><div className="header-location"><button className="icon-button mobile-menu-button" aria-label="Open navigation" aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={() => { dialog.current?.showModal(); setMenuOpen(true); }}><Menu size={22} aria-hidden="true" /></button><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><span className="muted">Directory and intake</span></div><div className="session-controls"><span className="session-name"><span className="avatar" aria-hidden="true"><UserCircle size={19} /></span>{displayName}</span><button className="button text-button compact" onClick={() => { void signOut(); }}>Sign out<LogOut size={16} aria-hidden="true" /></button></div></header><main id="main-content" className="page-content" tabIndex={-1}>{children}</main><footer className="workspace-footer">AuxiliumOS<span>Synthetic development workspace</span></footer></div></div>;
}

export function PageHeader({ eyebrow = "Your workspace", title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} | AuxiliumOS`;
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1 ref={heading} tabIndex={-1}>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-actions">{action}</div>}</header>;
}
