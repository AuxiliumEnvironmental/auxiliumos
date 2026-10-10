import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { RuntimeConfig } from "./config";
import type { AuthPersistence, AuthStorageLease } from "./auth-storage";
import { consumePasswordLink, recoveryRedirect, unavailablePasswordLink, validateNewPassword, type PasswordLink, type PasswordLinkKind } from "./auth-links";
import { createRuntimeClient, DirectoryApi, type RuntimeContext } from "./directory-api";
import { asRuntimeError, isAbort, RuntimeError, serviceError } from "./errors";
import { PlanningDirectory } from "./use-planning-context";
import type { PlanningDraftEntry } from "./use-draft-transition";
import { WorkspacePlanApi } from "./workspace-plan-api";

export type RuntimeState =
  | { status: "checking" }
  | { status: "unauthenticated"; expired: boolean }
  | { status: "ready"; context: RuntimeContext; revision: number }
  | { status: "access_unavailable" }
  | { status: "password_setup"; kind: PasswordLinkKind; email: string }
  | { status: "auth_link_error"; error: RuntimeError }
  | { status: "error"; error: RuntimeError }
  | { status: "signout_error"; error: RuntimeError };

type RuntimeValue = {
  api: DirectoryApi;
  config: RuntimeConfig;
  state: RuntimeState;
  planningDirectory: PlanningDirectory | null;
  draftMemory: Map<string, PlanningDraftEntry>;
  isCurrentAccess: (revision: number) => boolean;
  recheck: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  setPassword: (password: string, confirmation: string) => Promise<void>;
  retryPasswordLink: () => Promise<void>;
  showSignIn: () => void;
  handleFailure: (error: RuntimeError) => void;
};

const Runtime = createContext<RuntimeValue | null>(null);

// Capture once, before the router initializes. React StrictMode may repeat
// effects, but must neither consume a link twice nor retain it in history.
let startupPasswordLink = consumePasswordLink(window.location.href, (url) => window.history.replaceState(null, "", url));

export function RuntimeProvider({ api, config, persistence, children }: { api: DirectoryApi; config: RuntimeConfig; persistence: AuthPersistence; children: ReactNode }) {
  const [state, updateState] = useState<RuntimeState>({ status: "checking" });
  const recovery = useRef({ identity: "", drafts: new Map<string, PlanningDraftEntry>() });
  const planningDirectory = useRef<PlanningDirectory | null>(null);
  const setState = useCallback((next: RuntimeState) => {
    // Keep inaccessible work only while verification is pending or transiently
    // unavailable. Replacing the map fences late cleanup writes into the old map.
    if (next.status !== "ready" && next.status !== "checking" && !(next.status === "error" && next.error.retryable)) {
      recovery.current = { identity: "", drafts: new Map() };
    }
    if (next.status !== "ready") planningDirectory.current = null;
    updateState(next);
  }, []);
  const [client, setClient] = useState(api.client);
  const currentRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const activeAccess = useRef<number | null>(null);
  const authOperation = useRef(0);
  const scheduledCheck = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const hadSession = useRef(false);
  const signingOut = useRef(false);
  const signoutLocked = useRef(persistence.initiallyLocked);
  const passwordLink = useRef<PasswordLink | null>(startupPasswordLink);
  const passwordLinkStarted = useRef(false);
  const passwordLinkActive = useRef(passwordLink.current !== null);
  const passwordSession = useRef<null | { lease: AuthStorageLease; client: DirectoryApi["client"]; operation: number; userId: string }>(null);

  const invalidate = useCallback(() => {
    activeAccess.current = null;
    generation.current += 1;
    currentRequest.current?.abort();
    currentRequest.current = null;
    clearTimeout(scheduledCheck.current);
    return generation.current;
  }, []);

  const recheck = useCallback(async () => {
    if (!mounted.current || signingOut.current || signoutLocked.current) return;
    const request = invalidate();
    const controller = new AbortController();
    currentRequest.current = controller;
    // Hide all protected UI and cancel its requests until access is re-established.
    // Only identity-scoped draft snapshots survive this unmount, in memory.
    setState({ status: "checking" });
    try {
      if (!persistence.isCurrent()) {
        signoutLocked.current = true;
        setState({ status: "unauthenticated", expired: hadSession.current });
        return;
      }
      const result = await api.loadRuntimeContext({ signal: controller.signal });
      if (!mounted.current || request !== generation.current) return;
      if (!persistence.isCurrent()) {
        signoutLocked.current = true;
        setState({ status: "unauthenticated", expired: hadSession.current });
        return;
      }
      if (result.status === "ready") {
        const identity = `${result.context.authUserId}:${result.context.profileId}`;
        if (recovery.current.identity !== identity) recovery.current = { identity, drafts: new Map() };
        const directory = new PlanningDirectory(api, controller.signal);
        const planApi = new WorkspacePlanApi(api.client);
        // A profile check alone does not establish facility membership. Recheck
        // every retained scope, including drafts on inactive module routes.
        for (const [id, entry] of recovery.current.drafts) {
          if (!entry.scope) continue;
          const allowed = await directory.resolve(entry.scope.accountId, entry.scope.facilityId);
          if (!mounted.current || request !== generation.current) return;
          if (!allowed.account || !allowed.facility) recovery.current.drafts.delete(id);
          // Planning uses submit_request, independently revocable from directory
          // access. Its existing list RPC proves that authority before recovery.
          else await planApi.list(entry.scope, controller.signal);
        }
        if (!mounted.current || request !== generation.current) return;
        if (!persistence.isCurrent()) {
          signoutLocked.current = true;
          setState({ status: "unauthenticated", expired: hadSession.current });
          return;
        }
        planningDirectory.current = directory;
        activeAccess.current = request;
        hadSession.current = true;
        setState({ status: "ready", context: result.context, revision: request });
      } else if (result.status === "unauthenticated") {
        setState({ status: "unauthenticated", expired: hadSession.current });
      } else {
        setState({ status: "access_unavailable" });
      }
    } catch (error) {
      if (!mounted.current || request !== generation.current || isAbort(error)) return;
      const failure = asRuntimeError(error);
      if (failure.code === "session_expired") {
        setState({ status: "unauthenticated", expired: true });
      } else if (failure.code === "access_unavailable") {
        setState({ status: "access_unavailable" });
      } else {
        setState({ status: "error", error: failure });
      }
    }
  }, [api, invalidate, persistence, setState]);

  const retryPasswordLink = useCallback(async () => {
    const link = passwordLink.current;
    if (!link) return;
    const operation = ++authOperation.current;
    signingOut.current = false;
    signoutLocked.current = true;
    passwordLinkActive.current = true;
    passwordSession.current = null;
    invalidate();
    setState({ status: "checking" });
    let lease: AuthStorageLease | null = null;
    try {
      // A callback supersedes any saved session but remains memory-only until
      // password setup and independent identity verification both succeed.
      lease = persistence.beginLogin();
      if (link.kind === "invalid") throw link.error;
      const previousClient = api.client;
      const nextClient = createRuntimeClient(config, lease);
      api.client = nextClient;
      setClient(nextClient);
      void previousClient.auth.dispose().catch(() => {});
      const { data, error } = await nextClient.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });
      if (error) {
        const failure = serviceError(error);
        throw failure.retryable ? failure : unavailablePasswordLink();
      }
      if (!data.session || !data.user || data.user.is_anonymous) throw unavailablePasswordLink();
      const verified = await nextClient.auth.getUser(data.session.access_token);
      if (verified.error) {
        const failure = serviceError(verified.error);
        throw failure.retryable ? failure : unavailablePasswordLink();
      }
      if (!verified.data.user || verified.data.user.is_anonymous || verified.data.user.id !== data.user.id || !verified.data.user.email) throw unavailablePasswordLink();
      if (operation !== authOperation.current || nextClient !== api.client || !persistence.isCurrent(lease)) throw unavailablePasswordLink();
      passwordSession.current = { lease, client: nextClient, operation, userId: verified.data.user.id };
      passwordLink.current = null;
      if (mounted.current) setState({ status: "password_setup", kind: link.kind, email: verified.data.user.email });
    } catch (error) {
      lease?.revoke();
      if (operation !== authOperation.current) return;
      const failure = asRuntimeError(error);
      if (!failure.retryable) passwordLink.current = null;
      if (mounted.current) setState({ status: "auth_link_error", error: failure });
    }
  }, [api, config, invalidate, persistence]);

  useEffect(() => {
    mounted.current = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      // This callback is deliberately synchronous. Calling a Supabase method here
      // can deadlock versions that dispatch events while holding the Auth lock.
      if (!mounted.current || client !== api.client) return;
      if (signingOut.current || signoutLocked.current) return;
      // Broadcast events can belong to a superseded SDK client. Recheck our
      // own lease/session instead of trusting the event's identity or payload.
      if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        invalidate();
        setState({ status: "checking" });
        scheduledCheck.current = setTimeout(() => { void recheck(); }, 0);
      }
    });
    // Also check explicitly: startup does not depend on an event being delivered.
    if (passwordLinkActive.current) {
      if (!passwordLinkStarted.current) {
        passwordLinkStarted.current = true;
        startupPasswordLink = null;
        void retryPasswordLink();
      }
    } else if (signoutLocked.current) setState({ status: "unauthenticated", expired: false });
    else scheduledCheck.current = setTimeout(() => { void recheck(); }, 0);
    const onVisible = () => {
      if (!hadSession.current || signoutLocked.current) return;
      if (document.visibilityState === "visible") {
        void client.auth.startAutoRefresh().catch(() => {});
        void recheck();
      } else {
        void client.auth.stopAutoRefresh().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const onStorage = (event: StorageEvent) => {
      if (client !== api.client || !persistence.observesStorageKey(event.key)) return;
      let failure: RuntimeError | null = null;
      try { if (persistence.isCurrent()) return; } catch (error) { failure = asRuntimeError(error); }
      authOperation.current += 1;
      passwordSession.current = null;
      passwordLink.current = null;
      passwordLinkActive.current = false;
      signingOut.current = false;
      signoutLocked.current = true;
      persistence.revoke();
      invalidate();
      void client.auth.stopAutoRefresh().catch(() => {});
      setState(failure ? { status: "error", error: failure } : { status: "unauthenticated", expired: false });
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mounted.current = false;
      invalidate();
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [api, client, invalidate, persistence, recheck, retryPasswordLink]);

  const signIn = useCallback(async (email: string, password: string) => {
    const operation = ++authOperation.current;
    passwordSession.current = null;
    passwordLink.current = null;
    passwordLinkActive.current = false;
    signingOut.current = false;
    signoutLocked.current = true;
    invalidate();
    const lease = persistence.beginLogin();
    const previousClient = api.client;
    const nextClient = createRuntimeClient(config, lease);
    api.client = nextClient;
    setClient(nextClient);
    // The old storage lease is already irrevocably blocked, including late writes.
    void previousClient.auth.dispose().catch(() => {});
    try {
      const { data, error } = await nextClient.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === "invalid_credentials" || error.code === "email_not_confirmed" || error.status === 400) {
          throw new RuntimeError("credentials", "Unable to sign in with those details. Check your assigned email and password.");
        }
        if (error.status === 401 || error.status === 403) {
          throw new RuntimeError("configuration", "The workspace connection was rejected. Ask your administrator to check its development configuration.");
        }
        throw serviceError(error);
      }
      if (!data.session || !data.user) throw new RuntimeError("credentials", "Sign-in could not be completed. Try your assigned login again.");
      const verified = await nextClient.auth.getUser(data.session.access_token);
      if (verified.error) throw serviceError(verified.error);
      if (!verified.data.user || verified.data.user.is_anonymous || verified.data.user.id !== data.user.id) {
        throw new RuntimeError("credentials", "Sign-in could not be verified. Try your assigned login again.");
      }
      if (operation !== authOperation.current || nextClient !== api.client) {
        throw new RuntimeError("session_expired", "Sign-in was interrupted. Sign in again to continue.");
      }
      persistence.commitLogin(lease);
      signoutLocked.current = false;
      await nextClient.auth.startAutoRefresh();
      if (operation === authOperation.current && nextClient === api.client) await recheck();
    } catch (error) {
      lease.revoke();
      // Failed credentials or verification never commit a new generation.
      throw error;
    }
  }, [api, config, invalidate, persistence, recheck]);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await api.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: recoveryRedirect(window.location.origin) });
    if (error) {
      // A response must not reveal whether an address exists or is eligible.
      // Connectivity/rate-limit errors are actionable without exposing that.
      const failure = serviceError(error);
      if (failure.retryable) throw new RuntimeError("network", "The password link request could not be completed. Check your connection or wait a moment, then try again.", true);
    }
  }, [api]);

  const setPassword = useCallback(async (password: string, confirmation: string) => {
    validateNewPassword(password, confirmation);
    const pending = passwordSession.current;
    if (!pending || pending.operation !== authOperation.current || pending.client !== api.client || !persistence.isCurrent(pending.lease)) throw unavailablePasswordLink();
    let passwordSaved = false;
    try {
      const verified = await pending.client.auth.getUser();
      if (verified.error) throw serviceError(verified.error);
      if (!verified.data.user || verified.data.user.is_anonymous || verified.data.user.id !== pending.userId) throw unavailablePasswordLink();
      if (pending.operation !== authOperation.current || !persistence.isCurrent(pending.lease)) throw unavailablePasswordLink();
      const { data, error } = await pending.client.auth.updateUser({ password });
      if (error) {
        if (error.code === "weak_password") throw new RuntimeError("validation", "Choose a stronger password. Your workspace password requirements were not met.");
        if (error.code === "same_password") throw new RuntimeError("validation", "Choose a password you have not used for this account.");
        if (error.code === "reauthentication_needed" || error.code === "reauthentication_not_valid") throw unavailablePasswordLink();
        throw serviceError(error);
      }
      if (!data.user || data.user.id !== pending.userId) throw unavailablePasswordLink();
      passwordSaved = true;
      const confirmed = await pending.client.auth.getUser();
      if (confirmed.error) throw serviceError(confirmed.error);
      if (!confirmed.data.user || confirmed.data.user.is_anonymous || confirmed.data.user.id !== pending.userId) throw unavailablePasswordLink();
      if (pending.operation !== authOperation.current || pending.client !== api.client) throw unavailablePasswordLink();
      persistence.commitLogin(pending.lease);
      passwordSession.current = null;
      passwordLinkActive.current = false;
      signoutLocked.current = false;
      await pending.client.auth.startAutoRefresh();
      if (pending.operation === authOperation.current && pending.client === api.client) await recheck();
    } catch (error) {
      const failure = asRuntimeError(error);
      if (pending.operation !== authOperation.current) return;
      if (passwordSaved || ["session_expired", "access_unavailable", "credentials", "storage"].includes(failure.code)) {
        pending.lease.revoke();
        passwordSession.current = null;
        setState({ status: "auth_link_error", error: failure.code === "storage" ? failure : passwordSaved
          ? new RuntimeError("credentials", "Your password was saved, but access could not be verified. Go back to sign in with your new password, or request a new password link.")
          : unavailablePasswordLink() });
      }
      throw failure;
    }
  }, [api, persistence, recheck]);

  const signOut = useCallback(async () => {
    const operation = ++authOperation.current;
    passwordSession.current = null;
    passwordLink.current = null;
    passwordLinkActive.current = false;
    const logoutClient = api.client;
    let logoutLease: AuthStorageLease | null = null;
    signingOut.current = true;
    signoutLocked.current = true;
    invalidate();
    setState({ status: "checking" });
    let failure: RuntimeError | null = null;
    try {
      logoutLease = persistence.beginLogout();
      await logoutClient.auth.stopAutoRefresh();
      const { error } = await logoutClient.auth.signOut({ scope: "local" });
      if (error) failure = serviceError(error);
    } catch (error) {
      failure = asRuntimeError(error);
    } finally {
      try { persistence.finishLogout(logoutLease); } catch (error) { failure = asRuntimeError(error); }
      if (operation === authOperation.current) signingOut.current = false;
    }
    if (!mounted.current || operation !== authOperation.current || logoutClient !== api.client) return;
    if (failure) setState({ status: "signout_error", error: failure });
    else {
      hadSession.current = false;
      setState({ status: "unauthenticated", expired: false });
    }
  }, [api, invalidate, persistence]);

  const showSignIn = useCallback(() => {
    // Showing a form is not an unlock. Only a fresh generation can be committed.
    invalidate();
    setState({ status: "unauthenticated", expired: false });
  }, [invalidate]);

  const handleFailure = useCallback((error: RuntimeError) => {
    if (error.code !== "session_expired" && error.code !== "access_unavailable") return;
    invalidate();
    setState(error.code === "session_expired"
      ? { status: "unauthenticated", expired: true }
      : { status: "access_unavailable" });
  }, [invalidate]);

  const isCurrentAccess = useCallback((revision: number) => {
    if (activeAccess.current !== revision) return false;
    try {
      if (persistence.isCurrent()) return true;
      signoutLocked.current = true;
      invalidate();
      setState({ status: "unauthenticated", expired: hadSession.current });
    } catch (error) {
      invalidate();
      setState({ status: "error", error: asRuntimeError(error) });
    }
    return false;
  }, [invalidate, persistence, setState]);
  return <Runtime.Provider value={{ api, config, state, planningDirectory: planningDirectory.current, draftMemory: recovery.current.drafts, isCurrentAccess, recheck, signIn, signOut, requestPasswordReset, setPassword, retryPasswordLink, showSignIn, handleFailure }}>{children}</Runtime.Provider>;
}

export function useRuntime() {
  const value = useContext(Runtime);
  if (!value) throw new Error("RuntimeProvider is missing");
  return value;
}
