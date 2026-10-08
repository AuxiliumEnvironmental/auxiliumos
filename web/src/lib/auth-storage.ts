import { RuntimeError } from "./errors";

function storageFailure(): RuntimeError {
  return new RuntimeError("storage", "Browser storage is unavailable. This tab is locked. Clear this site's browser data before continuing.");
}

type LeaseMode = "persistent" | "staged" | "logout" | "blocked";

// Supabase's documented storage option, with one permanently revocable lease per
// client. An old refresh can finish after dispose(), so disposal alone is not enough.
export class AuthStorageLease {
  readonly values = new Map<string, string>();
  constructor(readonly owner: AuthPersistence, public mode: LeaseMode, readonly intent: string | null) {}
  readonly storage = {
    getItem: (key: string): string | null => {
      if (this.mode === "blocked") return null;
      if (this.mode !== "persistent") return this.values.get(key) ?? null;
      if (this.owner.getIntent() !== null) { this.revoke(); return null; }
      return this.owner.read(key);
    },
    setItem: (key: string, value: string): void => {
      if (this.mode === "blocked" || this.mode === "logout") return;
      if (this.mode === "staged") { this.values.set(key, value); return; }
      if (this.owner.getIntent() !== null) { this.revoke(); return; }
      this.owner.write(key, value);
    },
    removeItem: (key: string): void => {
      if (this.mode === "blocked") return;
      if (this.mode !== "persistent") { this.values.delete(key); return; }
      if (this.owner.getIntent() !== null) { this.revoke(); return; }
      this.owner.remove(key);
    },
  };
  revoke() { this.mode = "blocked"; this.values.clear(); }
}

export class AuthPersistence {
  readonly sessionKey: string;
  readonly logoutKey: string;
  readonly initiallyLocked: boolean;
  private readonly storage: Storage;
  private active: AuthStorageLease | null = null;

  constructor(url: string) {
    this.sessionKey = `auxiliumos.auth.${new URL(url).host}`;
    this.logoutKey = `${this.sessionKey}.logout-intent`;
    try { this.storage = window.localStorage; } catch { throw storageFailure(); }
    this.initiallyLocked = this.getIntent() !== null;
    if (this.initiallyLocked) this.purgeSession();
  }

  read(key: string): string | null {
    try { return this.storage.getItem(key); } catch { this.revoke(); throw storageFailure(); }
  }
  write(key: string, value: string) {
    try { this.storage.setItem(key, value); } catch { this.revoke(); throw storageFailure(); }
  }
  remove(key: string) {
    try { this.storage.removeItem(key); } catch { this.revoke(); throw storageFailure(); }
  }
  getIntent() { return this.read(this.logoutKey); }
  revoke() { this.active?.revoke(); }
  private ownedKeys() { return [this.sessionKey, `${this.sessionKey}-user`, `${this.sessionKey}-code-verifier`]; }
  private purgeSession() { for (const key of this.ownedKeys()) this.remove(key); }
  private saveIntent(intent: string) {
    this.write(this.logoutKey, intent);
    if (this.getIntent() !== intent) { this.revoke(); throw storageFailure(); }
  }

  initialLease() {
    this.active = new AuthStorageLease(this, this.initiallyLocked ? "blocked" : "persistent", this.getIntent());
    return this.active;
  }

  beginLogin() {
    this.revoke();
    const intent = this.getIntent() ?? crypto.randomUUID();
    this.saveIntent(intent);
    this.purgeSession();
    this.active = new AuthStorageLease(this, "staged", intent);
    return this.active;
  }

  commitLogin(lease: AuthStorageLease) {
    if (this.active !== lease || lease.mode !== "staged" || this.getIntent() !== lease.intent) {
      lease.revoke();
      throw new RuntimeError("session_expired", "Sign-in was interrupted. Sign in again to continue.");
    }
    if (!lease.values.has(this.sessionKey)) { lease.revoke(); throw storageFailure(); }
    try {
      for (const [key, value] of lease.values) this.write(key, value);
      this.remove(this.logoutKey);
      if (this.getIntent() !== null) throw storageFailure();
      lease.values.clear();
      lease.mode = "persistent";
    } catch {
      lease.revoke();
      try { this.saveIntent(lease.intent!); this.purgeSession(); } catch { /* Still locked in this tab. */ }
      throw storageFailure();
    }
  }

  beginLogout() {
    const snapshot = new Map<string, string>();
    try {
      for (const key of this.ownedKeys()) { const value = this.read(key); if (value !== null) snapshot.set(key, value); }
      this.saveIntent(crypto.randomUUID());
      // The SDK may read this snapshot only to attempt its supported signOut.
      // Refresh results cannot write back to persistent storage during logout.
      if (this.active) {
        this.active.revoke();
        this.active.mode = "logout";
        for (const [key, value] of snapshot) this.active.values.set(key, value);
      }
      this.purgeSession();
    } catch (error) {
      this.revoke();
      throw error;
    }
  }

  finishLogout() {
    this.revoke();
    this.purgeSession();
    // Keep intent through reload; only a verified fresh password login clears it.
  }
}
