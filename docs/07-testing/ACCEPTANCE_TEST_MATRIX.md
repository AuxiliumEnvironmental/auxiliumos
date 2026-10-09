# Acceptance test matrix
The canonical outcomes are REQUIREMENTS.json. Each module remains planned until implemented and associated with appropriate current evidence. This file maps risk to verification strategy rather than duplicating all acceptance prose.

| Risk or capability | Smallest meaningful evidence | Representative system gate |
| --- | --- | --- |
| C01 membership/tenant/facility isolation | Real database/RLS/API identities, positive and negative cases; direct joins, exports and storage paths | Removed user with existing session and another role cannot read or mutate. |
| C02 documents | Database transaction/API tests for exact version, review, grants, replacement and holds | Client sees only released audience-approved version; new draft leaves current report intact. |
| C03 scope/signature/money authority | State-transition, concurrency, idempotency and effective-amendment tests | Ordinary job from request through signed scope, changed work and reconciled invoice. |
| C04 recovery/scale | Restore, migration/recovery drill and measured representative workload | Restore isolated database and file inventory; reconcile versions/audit and measure approved recovery target. |
| C05 UX | Component accessibility plus a small set of real browser workflows | Simple, enterprise, internal and vendor tasks at phone/desktop widths with keyboard and recoverable failures. |
| C06 integration | Contract/API tests with disconnected, duplicate, stale and revoked peer | Moldo continues independently; OS scoped projection reconciles without unintended access. |
| C07 no-PHI/AI | Quarantine and source-grounded evaluation cases; malicious input treated as data | Sensitive input cannot escape permitted processing or supply agent instructions. |
| GOV-001 continuation | Node control tests, source fingerprints, importer failure/recovery tests | A fresh chat identifies the next incomplete task and does not trust stale evidence. |

The supplied foundation-contract profile tests SQL text only. The existing Playwright harness covers a static shell only. Neither establishes RLS, auth, private storage, release or full workflows. Current profiles are listed in VERIFICATION_PROFILES.json; future runtime profiles must include all source/test/config/dependency inputs plus target revision, database/migration state and fixture identity.

Development: test the changed behavior and its dependent invariants. Integration: run required gates for shared contracts. Release: run required full acceptance, security and recovery gates against the actual candidate. Do not rerun unchanged suites just because the chat changed. Capture first failure and diagnose it; no retry-until-green or skip-to-pass. Evidence reuse is valid only within the declared fingerprint and trustworthy environment assumptions.


## Current directory increment evidence

`directory-database` executes the original and additive migrations in PostgreSQL 18.3 through PGlite 0.5.8, with deliberately mocked Auth functions and simulated subjects. The observed cloud backend is PostgreSQL 17.6.1.127, so target-version execution remains a separate gate. `runtime-build` checks TypeScript and bundles the application. `directory-browser-fixture` exercises the actual React app/Supabase SDK against intercepted synthetic HTTP responses and is labeled `browser_fixture`, never `browser` or `api` evidence.

`directory-api` is prepared for authentic synthetic Supabase users and Data API denial checks but has not run against a configured service. It fails before any request when required secure configuration is missing. SEC-001B remains blocked for authentic API and real-service browser acceptance; SEC-001C remains independent work. No full product requirement is marked implemented by these bounded checks. Exact environment and browser provenance are recorded in [runtime environment](../00-control/RUNTIME_VERIFICATION_ENVIRONMENT.json).
