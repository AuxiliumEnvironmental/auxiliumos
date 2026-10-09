import { RuntimeError } from "./errors";

function storageFailure(): RuntimeError {
  return new RuntimeError("storage", "Browser storage is unavailable. This tab is locked. Clear this site's browser data before continuing.");
}

function interrupted(): RuntimeError {
  return new RuntimeError("session_expired", "Sign-in was interrupted. Sign in again to continue.");
}

type LeaseMode = "persistent" | "staged" | "logout" | "blocked";
const GENERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Each SDK client keeps its generation forever. Storage events only update the
// UI: authority comes from the durable pointer and this generation's tombstone.
export class AuthStorageLease {
  readonly values = new Map<string, string>();
  constructor(readonly owner: AuthPersistence, public mode: LeaseMode, readonly generation: string | null) {}
  readonly storage = {
    getItem: (key: string): string | null => {
      if (!this.owner.ownsKey(key) || this.mode === "blocked") return null;
      // The SDK may read this snapshot only for the original client's signOut.
      if (this.mode === "logout") return this.values.get(key) ?? null;
      if (!this.owner.isCurrent(this)) return null;
      if (this.mode === "staged") return this.values.get(key) ?? null;
      return this.owner.readCredential(this, key);
    },
    setItem: (key: string, value: string): void => {
      if (!this.owner.ownsKey(key) || this.mode === "blocked" || this.mode === "logout") return;
      if (!this.owner.isCurrent(this)) return;
      if (this.mode === "staged") this.values.set(key, value);
      else this.owner.writeCredential(this, key, value);
    },
    removeItem: (key: string): void => {
      if (!this.owner.ownsKey(key) || this.mode === "blocked") return;
      if (this.mode === "logout") { this.values.delete(key); return; }
      if (!this.owner.isCurrent(this)) return;
      if (this.mode === "staged") this.values.delete(key);
      else this.owner.removeCredential(this, key);
    },
  };
  revoke() { this.mode = "blocked"; this.values.clear(); }
}

export class AuthPersistence {
  readonly sessionKey: string;
  readonly generationKey: string;
  readonly initiallyLocked: boolean;
  private readonly storage: Storage;
  private readonly initialGeneration: string | null;
  private active: AuthStorageLease | null = null;
  private failed = false;

  constructor(url: string) {
    this.sessionKey = `auxiliumos.auth.${new URL(url).host}`;
    this.generationKey = `${this.sessionKey}.generation`;
    try { this.storage = window.localStorage; } catch { throw storageFailure(); }
    this.initialGeneration = this.readGeneration();
    // Never import credentials from the superseded single-slot format. Its
    // legacy marker is retained, and only these three exact SDK keys are purged.
    const legacyIntent = this.read(`${this.sessionKey}.logout-intent`);
    this.purgeLegacy();
    this.initiallyLocked = this.initialGeneration === null
      ? legacyIntent !== null : !this.generationReady(this.initialGeneration);
    // A pending generation may still be committing in another tab. Only an
    // immutable logout tombstone permits cleanup during construction.
    if (this.initialGeneration && this.read(this.logoutKey(this.initialGeneration)) !== null) this.purgeGeneration(this.initialGeneration);
    this.purgeSuperseded();
  }

  private credentialKeys() { return [this.sessionKey, `${this.sessionKey}-user`, `${this.sessionKey}-code-verifier`]; }
  ownsKey(key: string) { return this.credentialKeys().includes(key); }
  private slot(generation: string, key: string) { return `${this.sessionKey}.generation.${generation}${key.slice(this.sessionKey.length)}`; }
  private logoutKey(generation: string) { return `${this.sessionKey}.generation.${generation}.logout-intent`; }
  private committedKey(generation: string) { return `${this.sessionKey}.generation.${generation}.committed`; }

  private fail(generation = this.active?.generation ?? this.initialGeneration): never {
    this.failed = true;
    this.revoke();
    // Best effort only: the browser can refuse both intent and deletion. Never
    // touch the pointer or another generation, even during failure recovery.
    if (generation) {
      try { this.storage.setItem(this.logoutKey(generation), "1"); } catch { /* Recovery requires clearing site data. */ }
      for (const key of this.credentialKeys()) {
        try { this.storage.removeItem(this.slot(generation, key)); } catch { /* Same persistent failure lock. */ }
      }
    }
    throw storageFailure();
  }
  private healthy() { if (this.failed) throw storageFailure(); }
  private read(key: string, generation = this.active?.generation ?? this.initialGeneration): string | null {
    this.healthy();
    try { return this.storage.getItem(key); } catch { return this.fail(generation); }
  }
  private write(key: string, value: string, generation = this.active?.generation ?? this.initialGeneration) {
    this.healthy();
    try { this.storage.setItem(key, value); } catch { this.fail(generation); }
  }
  private remove(key: string, generation = this.active?.generation ?? this.initialGeneration) {
    this.healthy();
    try { this.storage.removeItem(key); } catch { this.fail(generation); }
  }
  private readGeneration(failureGeneration = this.active?.generation ?? this.initialGeneration) {
    const generation = this.read(this.generationKey, failureGeneration);
    if (generation !== null && !GENERATION.test(generation)) this.fail(failureGeneration);
    return generation;
  }
  private generationReady(generation: string) {
    return this.read(this.committedKey(generation), generation) === "1" && this.read(this.logoutKey(generation), generation) === null;
  }
  private purgeLegacy() { for (const key of this.credentialKeys()) this.remove(key); }
  private purgeGeneration(generation: string) {
    for (const key of this.credentialKeys()) this.remove(this.slot(generation, key), generation);
  }
  private purgeSuperseded(failureGeneration = this.active?.generation ?? this.initialGeneration) {
    this.healthy();
    const candidates = new Set<string>();
    const prefix = `${this.sessionKey}.generation.`;
    // Storage exposes map keys as named properties. One [[OwnPropertyKeys]]
    // result gives us a stable names array; length + key(index) reads a moving
    // order and can skip credentials when another tab removes an earlier key.
    // This snapshots names only, not values or a cross-agent transaction.
    let names: string[];
    try {
      names = Object.getOwnPropertyNames(this.storage);
    } catch { this.fail(failureGeneration); }
    for (const key of names) {
      if (!key.startsWith(prefix)) continue;
      const generation = key.slice(prefix.length).replace(/-(user|code-verifier)$/, "");
      if (GENERATION.test(generation)) candidates.add(generation);
    }
    for (const generation of candidates) {
      // A physical credential proves this generation already published its
      // pointer. Publication occurs only once, so if the current pointer differs
      // it cannot legitimately become current later. Read the pointer HERE,
      // not before enumeration: a newer login can commit during this cleanup.
      if (this.readGeneration(generation) === generation) continue;
      this.lockGeneration(generation);
      this.purgeGeneration(generation);
    }
  }
  private lockGeneration(generation: string) {
    // Tombstones are never removed, including by a successful/stale login.
    this.write(this.logoutKey(generation), "1", generation);
    if (this.read(this.logoutKey(generation), generation) !== "1") this.fail(generation);
  }

  revoke() { this.active?.revoke(); }
  isCurrent(lease = this.active): boolean {
    this.healthy();
    if (!lease || lease !== this.active || !lease.generation || !["persistent", "staged"].includes(lease.mode)) return false;
    const current = this.readGeneration() === lease.generation
      && (lease.mode === "staged" || this.generationReady(lease.generation))
      && this.read(this.logoutKey(lease.generation)) === null
      && this.readGeneration() === lease.generation;
    if (!current) lease.revoke();
    return current;
  }
  observesStorageKey(key: string | null) {
    return key === null || key === this.generationKey
      || (!!this.active?.generation && key === this.logoutKey(this.active.generation));
  }
  readCredential(lease: AuthStorageLease, key: string) {
    if (!this.ownsKey(key) || !this.isCurrent(lease)) return null;
    const value = this.read(this.slot(lease.generation!, key), lease.generation);
    return this.isCurrent(lease) ? value : null;
  }
  writeCredential(lease: AuthStorageLease, key: string, value: string) {
    if (!this.ownsKey(key) || !this.isCurrent(lease)) return;
    this.write(this.slot(lease.generation!, key), value, lease.generation);
    // The pointer may have changed inside setItem. Cleanup stays in this
    // lease's physical slots; it cannot erase a fresh tab's session.
    if (!this.isCurrent(lease)) this.purgeGeneration(lease.generation!);
  }
  removeCredential(lease: AuthStorageLease, key: string) {
    if (!this.ownsKey(key) || !this.isCurrent(lease)) return;
    this.remove(this.slot(lease.generation!, key), lease.generation);
    if (!this.isCurrent(lease)) this.purgeGeneration(lease.generation!);
  }

  initialLease() {
    this.healthy();
    this.revoke();
    this.active = new AuthStorageLease(this, this.initiallyLocked || !this.initialGeneration ? "blocked" : "persistent", this.initialGeneration);
    return this.active;
  }

  beginLogin() {
    this.healthy();
    const previous = this.readGeneration();
    this.revoke();
    this.active = new AuthStorageLease(this, "staged", crypto.randomUUID());
    const lease = this.active;
    if (previous) this.lockGeneration(previous);
    // Publication happens once, before any credentials are persisted. Without
    // a committed marker, a reload of this generation remains locked.
    this.write(this.generationKey, lease.generation!, lease.generation);
    if (!this.isCurrent(lease)) throw interrupted();
    if (previous) this.purgeGeneration(previous);
    this.purgeLegacy();
    this.purgeSuperseded(lease.generation);
    if (!this.isCurrent(lease)) throw interrupted();
    return lease;
  }

  commitLogin(lease: AuthStorageLease) {
    try {
      if (lease.mode !== "staged" || !this.isCurrent(lease)) throw interrupted();
      if (!lease.values.has(this.sessionKey)) this.fail();
      for (const [key, value] of lease.values) {
        if (!this.ownsKey(key) || !this.isCurrent(lease)) throw interrupted();
        this.writeCredential(lease, key, value);
        if (!this.isCurrent(lease)) throw interrupted();
        if (this.read(this.slot(lease.generation!, key), lease.generation) !== value) this.fail(lease.generation);
      }
      if (!this.isCurrent(lease)) throw interrupted();
      this.write(this.committedKey(lease.generation!), "1", lease.generation);
      if (!this.isCurrent(lease)) throw interrupted();
      if (!this.generationReady(lease.generation!)) this.fail();
      lease.values.clear();
      lease.mode = "persistent";
    } catch (error) {
      lease.revoke();
      if (lease.generation) {
        try { this.lockGeneration(lease.generation); this.purgeGeneration(lease.generation); } catch { /* The tab stays locked on storage failure. */ }
      }
      if (this.failed) throw storageFailure();
      throw error;
    }
  }

  beginLogout() {
    this.healthy();
    const lease = this.active;
    if (!lease?.generation) { lease?.revoke(); return lease; }
    const snapshot = new Map<string, string>();
    try {
      if (this.isCurrent(lease)) {
        for (const key of this.credentialKeys()) {
          const value = lease.storage.getItem(key);
          if (value !== null) snapshot.set(key, value);
        }
      }
      this.lockGeneration(lease.generation);
      lease.revoke();
      lease.mode = "logout";
      for (const [key, value] of snapshot) lease.values.set(key, value);
      this.purgeGeneration(lease.generation);
      this.purgeSuperseded(lease.generation);
      return lease;
    } catch (error) {
      lease.revoke();
      throw error;
    }
  }

  finishLogout(lease: AuthStorageLease | null) {
    lease?.revoke();
    if (lease?.generation) this.purgeGeneration(lease.generation);
    // Never revoke the current client or change the pointer. This async logout
    // may belong to a generation superseded by a later verified password login.
  }
}
