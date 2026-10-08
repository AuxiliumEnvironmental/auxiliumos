import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Building2, Check, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { asRuntimeError, type RuntimeError } from "../lib/errors";
import { useRuntime } from "../lib/runtime";
import { Brand, DevelopmentBanner, LoadingState } from "./shared";

export function PublicLayout({ children, local = false }: { children: ReactNode; local?: boolean }) {
  return <div className="public-layout"><DevelopmentBanner local={local} /><header className="public-header"><Brand /><span className="public-label">Development access</span></header><main id="main-content" className="public-main">{children}</main><footer className="public-footer">Auxilium Environmental<span>Account and facility directory</span></footer></div>;
}

export function ConfigurationScreen({ error }: { error: RuntimeError }) {
  return <PublicLayout><section className="status-card" role="alert"><span className="state-icon"><LockKeyhole size={26} aria-hidden="true" /></span><p className="eyebrow">Workspace setup</p><h1>{error.code === "storage" ? "Browser storage unavailable" : "Connection needs configuration"}</h1><p>{error.message}</p>{error.code !== "storage" && <><p className="muted">Ask your workspace administrator to configure the approved development connection, then reload this page.</p><button className="button primary" onClick={() => window.location.reload()}>Reload page<RefreshCw size={16} aria-hidden="true" /></button></>}</section></PublicLayout>;
}

function LoginScreen({ expired }: { expired: boolean }) {
  const { signIn, config } = useRuntime();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RuntimeError | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try { await signIn(email.trim(), password); }
    catch (failure) { setError(asRuntimeError(failure)); }
    finally { setPending(false); setPassword(""); }
  };

  return <PublicLayout local={config.localTestBackend}><div className="login-grid"><section className="login-intro"><p className="eyebrow">Your workspace, connected</p><h1>A clear view of<br />your accounts.</h1><p className="intro-description">Find the accounts and facilities available to you, in one place.</p><div className="intro-card"><div className="intro-card-icon"><Building2 size={27} aria-hidden="true" /></div><div><strong>Start with your directory</strong><p>Your assigned access determines what appears.</p></div></div><p className="intro-footnote"><Check size={17} aria-hidden="true" />A focused first step in the AuxiliumOS workspace.</p></section><section className="login-card" aria-labelledby="login-title"><span className="state-icon"><LockKeyhole size={24} aria-hidden="true" /></span><h2 id="login-title">Sign in</h2><p className="muted">Use your assigned development login.</p>{expired && <p className="notice" role="status">Your session has expired. Sign in again to continue.</p>}<form onSubmit={submit}><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} aria-describedby={error ? "login-error" : undefined} /></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} aria-describedby={error ? "login-error" : undefined} /></div>{error && <p id="login-error" className="form-error" role="alert">{error.message}</p>}<button type="submit" className="button primary full-width" disabled={pending}>{pending ? "Signing in…" : "Sign in"}<ArrowRight size={17} aria-hidden="true" /></button></form><div className="login-help"><ShieldCheck size={18} aria-hidden="true" /><p>Need access? Contact your workspace administrator.</p></div></section></div></PublicLayout>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { state, config, recheck, signOut, showSignIn } = useRuntime();
  if (state.status === "ready") return children;
  if (state.status === "unauthenticated") return <LoginScreen expired={state.expired} />;
  if (state.status === "checking") return <PublicLayout local={config.localTestBackend}><section className="status-card"><LoadingState label="Checking your access" /></section></PublicLayout>;
  const accessUnavailable = state.status === "access_unavailable";
  const signoutError = state.status === "signout_error";
  return <PublicLayout local={config.localTestBackend}><section className="status-card" role="alert"><span className="state-icon"><LockKeyhole size={26} aria-hidden="true" /></span><p className="eyebrow">Development access</p><h1>{accessUnavailable ? "Access unavailable" : signoutError ? "Sign-out could not finish" : "Workspace unavailable"}</h1><p>{accessUnavailable ? "This login does not currently have access to the workspace. Contact your workspace administrator." : signoutError ? (state.error.code === "storage" ? state.error.message : "Your directory and saved session have been cleared from this browser. Remote sign-out could not be confirmed. Sign in again to start a new session.") : state.error.message}</p><div className="button-row">{signoutError && state.error.code !== "storage" && <button className="button secondary" onClick={showSignIn}>Sign in again<ArrowRight size={16} aria-hidden="true" /></button>}{!signoutError && (accessUnavailable || state.error.retryable) && <button className="button primary" onClick={() => { void recheck(); }}>Check again<RefreshCw size={16} aria-hidden="true" /></button>}<button className={`button ${signoutError ? "primary" : "secondary"}`} onClick={() => { void signOut(); }}>{signoutError ? "Try signing out again" : "Sign out"}<LogOut size={16} aria-hidden="true" /></button></div></section></PublicLayout>;
}
