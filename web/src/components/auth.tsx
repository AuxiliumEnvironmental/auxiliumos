import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { asRuntimeError, type RuntimeError } from "../lib/errors";
import { useRuntime } from "../lib/runtime";
import type { PasswordLinkKind } from "../lib/auth-links";
import { Brand, DevelopmentBanner, LoadingState } from "./shared";

export function PublicLayout({ children, local = false }: { children: ReactNode; local?: boolean }) {
  return <div className="public-layout"><DevelopmentBanner local={local} /><header className="public-header"><Brand /><span className="public-label">Development access</span></header><main id="main-content" className="public-main">{children}</main><footer className="public-footer">Auxilium Environmental<span>AuxiliumOS</span></footer></div>;
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
  const [recovering, setRecovering] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try { await signIn(email.trim(), password); }
    catch (failure) { setError(asRuntimeError(failure)); }
    finally { setPending(false); setPassword(""); }
  };

  if (recovering) return <RecoveryScreen initialEmail={email} onBack={() => setRecovering(false)} />;
  return <PublicLayout local={config.localTestBackend}><div className="login-grid"><section className="login-intro"><p className="eyebrow">Auxilium Environmental</p><h1>AuxiliumOS</h1><p className="intro-description">Enterprise client portal and internal operating suite</p><div className="login-spine" aria-label="Workspace context"><span>Accounts & facilities</span><span>Requests & authorized work</span><span>Private documents & review</span></div><p className="intro-footnote"><ShieldCheck size={17} aria-hidden="true" />Access is assigned. Authority is verified.</p></section><section className="login-card" aria-labelledby="login-title"><span className="state-icon"><LockKeyhole size={24} aria-hidden="true" /></span><h2 id="login-title">Sign in</h2><p className="muted">Use the email and password for your workspace account.</p>{expired && <p className="notice" role="status">Your session has expired. Sign in again to continue.</p>}<form onSubmit={submit}><div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} aria-describedby={error ? "login-error" : undefined} /></div><div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} aria-describedby={error ? "login-error" : undefined} /></div>{error && <p id="login-error" className="form-error" role="alert">{error.message}</p>}<button type="submit" className="button primary full-width" disabled={pending}>{pending ? "Signing in…" : "Sign in"}<ArrowRight size={17} aria-hidden="true" /></button></form><button type="button" className="button text-button full-width" disabled={pending} onClick={() => { setPassword(""); setRecovering(true); }}>Forgot password?</button><div className="login-help"><ShieldCheck size={18} aria-hidden="true" /><p>New here? Open your invitation email to set a password. Workspace access is assigned by your administrator.</p></div></section></div></PublicLayout>;
}

function RecoveryScreen({ initialEmail = "", onBack, linkError }: { initialEmail?: string; onBack: () => void; linkError?: RuntimeError }) {
  const { config, requestPasswordReset, retryPasswordLink } = useRuntime();
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<RuntimeError | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try { await requestPasswordReset(email); setSent(true); }
    catch (failure) { setError(asRuntimeError(failure)); }
    finally { setPending(false); }
  };
  return <PublicLayout local={config.localTestBackend}>
    <section className="login-card" style={{ width: "100%", maxWidth: "28rem", minWidth: 0 }} aria-labelledby="recovery-title">
      <span className="state-icon"><LockKeyhole size={24} aria-hidden="true" /></span>
      <h2 id="recovery-title">{linkError ? "Link unavailable" : "Reset your password"}</h2>
      {linkError ? <p className="form-error" role="alert">{linkError.message}</p> : <p className="muted">Enter your workspace email to request a password link.</p>}
      {sent ? <><p className="notice" role="status">If this email has an eligible account, a password link will be sent. Check your inbox and spam folder. Use the email address from your invitation.</p><button type="button" className="button text-button full-width" onClick={() => setSent(false)}>Use a different email</button></> :
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="recovery-email">Email</label><input id="recovery-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} aria-describedby={error ? "recovery-error" : undefined} /></div>
          {error && <p id="recovery-error" className="form-error" role="alert">{error.message}</p>}
          <button type="submit" className="button primary full-width" disabled={pending}>{pending ? "Requesting link…" : "Send password link"}<ArrowRight size={17} aria-hidden="true" /></button>
        </form>}
      {linkError?.retryable && <button type="button" className="button secondary full-width" disabled={pending} onClick={() => { void retryPasswordLink(); }}>Retry secure link<RefreshCw size={16} aria-hidden="true" /></button>}
      <button type="button" className="button text-button full-width" disabled={pending} onClick={onBack}>Back to sign in</button>
    </section>
  </PublicLayout>;
}

function PasswordSetupScreen({ kind, email }: { kind: PasswordLinkKind; email: string }) {
  const { config, setPassword, signOut } = useRuntime();
  const [password, changePassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RuntimeError | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try { await setPassword(password, confirmation); }
    catch (failure) { setError(asRuntimeError(failure)); }
    finally { setPending(false); changePassword(""); setConfirmation(""); }
  };
  return <PublicLayout local={config.localTestBackend}>
    <section className="login-card" style={{ width: "100%", maxWidth: "28rem", minWidth: 0 }} aria-labelledby="password-title">
      <span className="state-icon"><LockKeyhole size={24} aria-hidden="true" /></span>
      <h2 id="password-title">{kind === "invite" ? "Set your password" : "Reset your password"}</h2>
      <p className="muted" style={{ overflowWrap: "anywhere" }}>For {email}</p>
      <form onSubmit={submit}>
        <input name="username" autoComplete="username" type="hidden" value={email} />
        <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" name="new-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => changePassword(event.target.value)} disabled={pending} aria-describedby={error ? "password-help password-error" : "password-help"} /><p id="password-help" className="field-hint">Use at least 12 characters. A password manager can create one.</p></div>
        <div className="field"><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} aria-describedby={error ? "password-error" : undefined} /></div>
        {error && <p id="password-error" className="form-error" role="alert">{error.message}</p>}
        <button type="submit" className="button primary full-width" disabled={pending}>{pending ? "Saving password…" : "Save password and continue"}<ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      <button type="button" className="button text-button full-width" disabled={pending} onClick={() => { void signOut(); }}>Cancel and sign out</button>
      <div className="login-help"><ShieldCheck size={18} aria-hidden="true" /><p>Your assigned workspace permissions apply after setup. Professional review and release require separate authority.</p></div>
    </section>
  </PublicLayout>;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { state, config, recheck, signOut, showSignIn } = useRuntime();
  if (state.status === "ready") return children;
  if (state.status === "unauthenticated") return <LoginScreen expired={state.expired} />;
  if (state.status === "password_setup") return <PasswordSetupScreen kind={state.kind} email={state.email} />;
  if (state.status === "auth_link_error") return <RecoveryScreen linkError={state.error} onBack={() => { void signOut(); }} />;
  if (state.status === "checking") return <PublicLayout local={config.localTestBackend}><section className="status-card"><LoadingState label="Checking your access" /></section></PublicLayout>;
  const accessUnavailable = state.status === "access_unavailable";
  const signoutError = state.status === "signout_error";
  return <PublicLayout local={config.localTestBackend}><section className="status-card" role="alert"><span className="state-icon"><LockKeyhole size={26} aria-hidden="true" /></span><p className="eyebrow">Development access</p><h1>{accessUnavailable ? "Access unavailable" : signoutError ? "Sign-out could not finish" : "Workspace unavailable"}</h1><p>{accessUnavailable ? "This login does not currently have access to the workspace. Contact your workspace administrator." : signoutError ? (state.error.code === "storage" ? state.error.message : "Your directory and saved session have been cleared from this browser. Remote sign-out could not be confirmed. Sign in again to start a new session.") : state.error.message}</p><div className="button-row">{signoutError && state.error.code !== "storage" && <button className="button secondary" onClick={showSignIn}>Sign in again<ArrowRight size={16} aria-hidden="true" /></button>}{!signoutError && (accessUnavailable || state.error.retryable) && <button className="button primary" onClick={() => { void recheck(); }}>Check again<RefreshCw size={16} aria-hidden="true" /></button>}<button className={`button ${signoutError ? "primary" : "secondary"}`} onClick={() => { void signOut(); }}>{signoutError ? "Try signing out again" : "Sign out"}<LogOut size={16} aria-hidden="true" /></button></div></section></PublicLayout>;
}
