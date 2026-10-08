import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { RuntimeConfig } from "./config";
import type { AuthPersistence } from "./auth-storage";
import { createRuntimeClient, DirectoryApi, type RuntimeContext } from "./directory-api";
import { asRuntimeError, isAbort, RuntimeError, serviceError } from "./errors";

export type RuntimeState =
  | { status: "checking" }
  | { status: "unauthenticated"; expired: boolean }
  | { status: "ready"; context: RuntimeContext; revision: number }
  | { status: "access_unavailable" }
  | { status: "error"; error: RuntimeError }
  | { status: "signout_error"; error: RuntimeError };

type RuntimeValue = {
  api: DirectoryApi;
  config: RuntimeConfig;
  state: RuntimeState;
  recheck: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  showSignIn: () => void;
  handleFailure: (error: RuntimeError) => void;
};

const Runtime = createContext<RuntimeValue | null>(null);

export function RuntimeProvider({ api, config, persistence, children }: { api: DirectoryApi; config: RuntimeConfig; persistence: AuthPersistence; children: ReactNode }) {
  const [state, setState] = useState<RuntimeState>({ status: "checking" });
  const [client, setClient] = useState(api.client);
  const currentRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const scheduledCheck = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const hadSession = useRef(false);
  const signingOut = useRef(false);
  const signoutLocked = useRef(persistence.initiallyLocked);

  const invalidate = useCallback(() => {
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
    // Unmount the authenticated subtree immediately. Every row is memory-only.
    setState({ status: "checking" });
    try {
      const result = await api.loadRuntimeContext({ signal: controller.signal });
      if (!mounted.current || request !== generation.current) return;
      if (result.status === "ready") {
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
  }, [api, invalidate]);

  useEffect(() => {
    mounted.current = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      // This callback is deliberately synchronous. Calling a Supabase method here
      // can deadlock versions that dispatch events while holding the Auth lock.
      if (!mounted.current || client !== api.client) return;
      if (event === "SIGNED_OUT") {
        invalidate();
        setState({ status: "unauthenticated", expired: !signingOut.current && hadSession.current });
        return;
      }
      if (signingOut.current || signoutLocked.current) return;
      if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        invalidate();
        setState({ status: "checking" });
        scheduledCheck.current = setTimeout(() => { void recheck(); }, 0);
      }
    });
    // Also check explicitly: startup does not depend on an event being delivered.
    if (signoutLocked.current) setState({ status: "unauthenticated", expired: false });
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
      if (event.key !== persistence.logoutKey || event.newValue === null) return;
      signoutLocked.current = true;
      persistence.revoke();
      invalidate();
      void client.auth.stopAutoRefresh().catch(() => {});
      setState({ status: "unauthenticated", expired: false });
    };
    window.addEventListener("storage", onStorage);
    return () => {
      mounted.current = false;
      invalidate();
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [api, client, invalidate, persistence, recheck]);

  const signIn = useCallback(async (email: string, password: string) => {
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
      persistence.commitLogin(lease);
      signoutLocked.current = false;
      await nextClient.auth.startAutoRefresh();
      await recheck();
    } catch (error) {
      lease.revoke();
      // Failed credentials or verification never remove persistent logout intent.
      throw error;
    }
  }, [api, config, invalidate, persistence, recheck]);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    signoutLocked.current = true;
    invalidate();
    setState({ status: "checking" });
    let failure: RuntimeError | null = null;
    try {
      persistence.beginLogout();
      await api.client.auth.stopAutoRefresh();
      const { error } = await api.client.auth.signOut({ scope: "local" });
      if (error) failure = serviceError(error);
    } catch (error) {
      failure = asRuntimeError(error);
    } finally {
      try { persistence.finishLogout(); } catch (error) { failure = asRuntimeError(error); }
      signingOut.current = false;
    }
    if (!mounted.current) return;
    if (failure) setState({ status: "signout_error", error: failure });
    else {
      hadSession.current = false;
      setState({ status: "unauthenticated", expired: false });
    }
  }, [api, invalidate, persistence]);

  const showSignIn = useCallback(() => {
    // Showing a form is not an unlock. Only commitLogin can clear the marker.
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

  return <Runtime.Provider value={{ api, config, state, recheck, signIn, signOut, showSignIn, handleFailure }}>{children}</Runtime.Provider>;
}

export function useRuntime() {
  const value = useContext(Runtime);
  if (!value) throw new Error("RuntimeProvider is missing");
  return value;
}
