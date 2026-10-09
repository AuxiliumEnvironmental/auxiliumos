import { createRootRoute, createRoute, createRouter, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AppShell } from "./components/app-shell";
import { AuthGate } from "./components/auth";
import { useRuntime } from "./lib/runtime";
import { AccountsPage, FacilitiesPage } from "./pages/directory";
import { IntakePage } from "./pages/intake";
import { PrivateFilesPage } from "./pages/private-files";
import { ModulesPage, NotFoundPage, ProfilePage } from "./pages/workspace";

import { ModuleWorkspace } from "./pages/module-workspace";

function ScreenAccessCheck() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const previousPath = useRef(pathname);
  const { recheck, state } = useRuntime();
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (state.status === "ready") void recheck();
  }, [pathname, recheck, state.status]);
  return null;
}

const rootRoute = createRootRoute({
  component: () => <><ScreenAccessCheck /><AuthGate><AppShell><Outlet /></AppShell></AuthGate></>,
  notFoundComponent: NotFoundPage,
  errorComponent: () => <div className="status-card" role="alert"><h1>This page could not be opened</h1><p>Reload the workspace to try again.</p><a className="button primary" href="/">Reload workspace</a></div>,
});

const pageHead = (title: string, description: string) => () => ({ meta: [{ title: `${title} | AuxiliumOS` }, { name: "description", content: description }, { property: "og:title", content: `${title} | AuxiliumOS` }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] });

const accountsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", head: pageHead("Accounts", "Your assigned AuxiliumOS account directory."), component: AccountsPage });
const facilitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/facilities",
  head: pageHead("Facilities", "Assigned facilities and account context in AuxiliumOS."),
  validateSearch: (search: Record<string, unknown>): { account?: string } => ({ account: typeof search.account === "string" ? search.account : undefined }),
  component: FacilitiesRoute,
});

function FacilitiesRoute() {
  const { account } = facilitiesRoute.useSearch();
  const navigate = facilitiesRoute.useNavigate();
  return <FacilitiesPage accountId={account} onAccountChange={(accountId) => { void navigate({ search: accountId ? { account: accountId } : {} }); }} />;
}

const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: "/account", head: pageHead("My account", "Your AuxiliumOS workspace identity and assigned directory access."), component: ProfilePage });
const intakeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/intake",
  head: pageHead("Intake", "Distinct incidents and project requests with assigned review and next actions."),
  validateSearch: (search: Record<string, unknown>): { account?: string } => ({ account: typeof search.account === "string" ? search.account : undefined }),
  component: IntakeRoute,
});
function IntakeRoute() {
  const { account } = intakeRoute.useSearch();
  const navigate = intakeRoute.useNavigate();
  return <IntakePage accountId={account} onAccountChange={(id) => { void navigate({ search: id ? { account: id } : {} }); }} />;
}
const modulesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/modules", head: pageHead("All modules", "The complete AuxiliumOS workspace module directory."), component: ModulesPage });
const privateFilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documents",
  head: pageHead("Private documents", "Private upload staging, immutable document versions and exact-version download."),
  validateSearch: (search: Record<string, unknown>): { account?: string } => ({ account: typeof search.account === "string" ? search.account : undefined }),
  component: PrivateFilesRoute,
});
function PrivateFilesRoute() {
  const { account } = privateFilesRoute.useSearch();
  const navigate = privateFilesRoute.useNavigate();
  return <PrivateFilesPage accountId={account} onAccountChange={(id) => { void navigate({ search: id ? { account: id } : {} }); }} />;
}
const moduleRoute = createRoute({ getParentRoute: () => rootRoute, path: "/$module", validateSearch: (search: Record<string, unknown>): { account?: string } => ({ account: typeof search.account === "string" ? search.account : undefined }), head: ({ params }) => pageHead(params.module === "core" ? "Home" : params.module.charAt(0).toUpperCase() + params.module.slice(1), `AuxiliumOS ${params.module} workspace and connection status.`)(), component: () => <ModuleWorkspace path={moduleRoute.useParams().module} accountId={moduleRoute.useSearch().account} /> });

const routeTree = rootRoute.addChildren([accountsRoute, facilitiesRoute, profileRoute, intakeRoute, privateFilesRoute, modulesRoute, moduleRoute]);
export const router = createRouter({ routeTree, defaultPreload: false, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
