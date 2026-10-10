import { createRootRoute, createRoute, createRouter, Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef } from "react";
import { AppShell } from "./components/app-shell";
import { AuthGate } from "./components/auth";
import { useRuntime } from "./lib/runtime";
import { AccountsPage, FacilitiesPage } from "./pages/directory";
import { IntakePage } from "./pages/intake";
import { PrivateFilesPage } from "./pages/private-files";
import { ModulesPage, NotFoundPage, ProfilePage } from "./pages/workspace";

import { ModuleWorkspace } from "./pages/module-workspace";
import { useDraftTransition } from "./lib/use-draft-transition";

// The complete Spatial authoring workspace loads only when opened.
const SpatialPage = lazy(() => import("./pages/spatial").then((module) => ({ default: module.SpatialPage })));
const SpatialLoading = () => <div className="status-card" role="status"><p>Opening Spatial…</p></div>;
const SpatialScreen = () => <Suspense fallback={<SpatialLoading />}><SpatialPage /></Suspense>;

/** Standalone Spatial is still behind sign-in, but without workspace navigation. */
function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const standalone = pathname === "/spatial/standalone";
  const transition = useDraftTransition();
  return <><ScreenAccessCheck />{transition.status === 'blocked' && <div className="status-card" role="alert"><p>Finish or retry the current planning save before changing context or leaving this screen.</p><button className="button primary" autoFocus onClick={transition.reset}>Return to draft</button></div>}<AuthGate>{standalone ? <main className="spatial-standalone"><Outlet /></main> : <AppShell><Outlet /></AppShell>}</AuthGate></>;
}

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
  // Omitted keys must stay absent so middleware can distinguish retention from explicit clearing.
  validateSearch: (search: Record<string, unknown>): { account?: string; facility?: string } => ({
    ...('account' in search ? { account: typeof search.account === 'string' ? search.account : undefined } : {}),
    ...('facility' in search ? { facility: typeof search.facility === 'string' ? search.facility : undefined } : {}),
  }),
  // Context is only a hint: each destination resolves permitted rows again.
  search: { middlewares: [({ search, next }) => {
    const result = next(search);
    const account = 'account' in result ? result.account : search.account;
    const facility = 'facility' in result ? result.facility : account === search.account ? search.facility : undefined;
    return { ...result, account, facility };
  }] },
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: () => <div className="status-card" role="alert"><h1>This page could not be opened</h1><p>Reload the workspace to try again.</p><a className="button primary" href="/">Reload workspace</a></div>,
});

const pageHead = (title: string, description: string) => () => ({ meta: [{ title: `${title} | AuxiliumOS` }, { name: "description", content: description }, { property: "og:title", content: `${title} | AuxiliumOS` }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] });

const accountsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", head: pageHead("Accounts", "Your assigned AuxiliumOS account directory."), component: AccountsPage });
const facilitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/facilities",
  head: pageHead("Facilities", "Assigned facilities and account context in AuxiliumOS."),
  component: FacilitiesRoute,
});

function FacilitiesRoute() {
  const { account } = facilitiesRoute.useSearch();
  const navigate = facilitiesRoute.useNavigate();
  return <FacilitiesPage accountId={account} onAccountChange={(accountId) => { void navigate({ search: { account: accountId || undefined, facility: undefined } }); }} />;
}

const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: "/account", head: pageHead("My account", "Your AuxiliumOS workspace identity and assigned directory access."), component: ProfilePage });
const intakeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/intake",
  head: pageHead("Intake", "Distinct incidents and project requests with assigned review and next actions."),
  component: IntakeRoute,
});
function IntakeRoute() {
  const { account } = intakeRoute.useSearch();
  const navigate = intakeRoute.useNavigate();
  return <IntakePage accountId={account} onAccountChange={(id) => { void navigate({ search: { account: id || undefined, facility: undefined } }); }} />;
}
const modulesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/modules", head: pageHead("All modules", "The complete AuxiliumOS workspace module directory."), component: ModulesPage });
const privateFilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/documents",
  head: pageHead("Private documents", "Private upload staging, immutable document versions and exact-version download."),
  component: PrivateFilesRoute,
});
function PrivateFilesRoute() {
  const { account } = privateFilesRoute.useSearch();
  const navigate = privateFilesRoute.useNavigate();
  return <PrivateFilesPage accountId={account} onAccountChange={(id) => { void navigate({ search: { account: id || undefined, facility: undefined } }); }} />;
}
const spatialRoute = createRoute({ getParentRoute: () => rootRoute, path: "/spatial", head: pageHead("Spatial", "Personal synthetic Spatial layouts with full 2D and 3D authoring."), component: SpatialScreen });
const spatialStandaloneRoute = createRoute({ getParentRoute: () => rootRoute, path: "/spatial/standalone", head: pageHead("Spatial workspace", "Full-screen personal Spatial authoring workspace."), component: SpatialScreen });
const moduleRoute = createRoute({ getParentRoute: () => rootRoute, path: "/$module", head: ({ params }) => pageHead(params.module === "core" ? "Home" : params.module.charAt(0).toUpperCase() + params.module.slice(1), `AuxiliumOS ${params.module} workspace and connection status.`)(), component: () => <ModuleWorkspace path={moduleRoute.useParams().module} accountId={moduleRoute.useSearch().account} facilityId={moduleRoute.useSearch().facility} /> });

const routeTree = rootRoute.addChildren([accountsRoute, facilitiesRoute, profileRoute, intakeRoute, privateFilesRoute, modulesRoute, spatialRoute, spatialStandaloneRoute, moduleRoute]);
export const router = createRouter({ routeTree, defaultPreload: false, scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}
