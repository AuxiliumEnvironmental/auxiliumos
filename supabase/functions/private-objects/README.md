# Private-file synthetic transport

Bounded M19/C01/C02/C07 transport supporting future M13 evidence. This builds on
the reviewed reservation migration and ADR-003; it does not replace either.
Reservations remain immutable. The new transport relation references the exact
reservation and adds one server attempt, one immutable server-computed byte
binding, one provider-readback receipt, and a user-authorized finalization.

`reserved → receiving → stored_unverified → finalized` is transport progression,
not scan, review or release. Every row is **quarantined**, `scan_state=pending`,
`clearance_state=pending`. No content/download, signing, scanner, clearance,
adoption, document version, destruction or release route exists. Uploaders cannot
read back bytes. Legacy document labels grant nothing. Future DOC-001 adoption
must enforce exact immutable version/digest bindings and close all ingest access
in its own reviewed transaction; this slice provides no callable adoption stub.

## Wire surface

The deployed slug is `private-objects`, rooted at `/functions/v1/private-objects`.
Requests use the current user's bearer JWT and the project publishable API key.
No filenames, raw paths, actors, digests, times, release flags or arbitrary JSON
are accepted. JSON shapes reject additional fields.

| Method and suffix | Input | Result |
| --- | --- | --- |
| POST root | `accountId`, `facilityId`, `idempotencyKey` UUIDs; `byteSize` integer; exact `mediaType=text/plain` | Reservation/current safe status; HTTP 201 also on exact replay |
| PUT `/{id}/bytes` | Raw UTF-8 `text/plain`; `X-State-Revision`; no range, encoding, disposition or upsert | Actual provider upload with `upsert:false`, then exact byte SHA-256/type/size readback and restricted receipt; safe stored status |
| POST `/{id}/finalize` | `expectedStateRevision` only | User authorization, new provider readback, then separate current-user finalization; quarantined status |
| GET `/{id}` | No query parameters | Original-uploader/current-ingest-authority safe status only |

Files are 1–65,536 bytes and must start with `AuxiliumOS synthetic fixture\n`.
That marker is accident prevention, **not** PHI detection or real-upload approval.
Client acknowledgment is not authority. OD-001/003 designated actors/audiences,
OD-011 retention/export, and OD-013 incident procedure/real-upload gates remain
unaccepted. No production configuration is provided.

Responses project only object ID, bounded state/revision, expiry, pending scan and
clearance, quarantine, bounded failure/next-action. All responses use no-store and
nosniff. Missing and forbidden objects return identical `not_found_or_unavailable`
404 JSON. Invalid Auth is 401; invalid input 400/413; conflicts/expiry 409; provider
and infrastructure failures 503. Raw provider errors/keys/content are not logged
or returned. The frontend adapter/component handles only this surface and keeps
file/status state in memory, scoped to runtime user/account/facility.

## Authority, retries and preservation

Each Edge request creates a user-JWT client and calls `auth.getUser(token)` against
the intended project. User authorization/claim/finalization RPCs never run under
service credentials. Separate fresh service clients can resolve only registered
attempt targets, bind the server-computed digest, and record verified receipts or
bounded diagnostics. A secret key is not a human and cannot call finalization.
Public RPCs are invoker wrappers; private definer helpers have empty search paths,
explicit grants and no direct base-table privileges for client/service roles.

User transactions use the existing configuration/profile/account/membership/
facility/ordered-grant SHARE-lock order, then the transport row UPDATE lock. No
provider I/O holds a database lock. Finalization repeats current entitlement and
expiry checks after I/O. Revoked access leaves existing bytes and evidence intact
but denies the next status/finalization. This does not claim recall of metadata
already returned or resistance to an operator holding a privileged key.

The first user claim allocates exactly one attempt. The backend binds exactly one
digest/length computed from bounded request bytes. Changed retries conflict before
Storage. PUT is non-overwriting even when raced/repeated. If the provider committed
but its response was lost, exact provider readback can recover. Missing/corrupt
bytes never create a receipt. If receipt recording fails, bytes remain preserved;
retrying the same PUT or finalizing a bound receiving attempt re-reads/reconciles
them. Exact receipt/finalization retries emit no duplicate transition events.

Lifecycle revisions are 1 (reservation), 2 (claim), 3 (receipt), 4 (finalization).
Diagnostic failure changes do not advance the lifecycle CAS revision. Claim
revision 1 remains a replay key for its one immutable attempt; otherwise current
revision is required. Finalization accepts its exact prior revision on replay.
Expiry prevents a new claim/bind/final commit; it never deletes bytes or history.
Technical readback may preserve a late receipt, but cannot override expiry or
current user permission to finalize. No automated cleanup deletes objects.

Consequential transitions audit atomically; failed audit insertion rolls the
transition back. User claim/finalization use user provenance; service bind/receipt/
diagnostic events use null human actors and the fixed system key with distinct
operation-source names. The immediately preceding intake audit families are
preserved. Gateway denial collection and provider/direct-denial coverage remain
explicit M19 gaps; this is not a full audit-investigation/export workflow.

## Deployment/provisioning prerequisites

The integration lead has applied the six reviewed migrations and deployed
`private-objects` version 1 to the existing development target. Exact source
readback is recorded in `docs/00-control/evidence/development-private-function.json`.
This does not establish genuine signed-in upload acceptance. The latest database
receipt records the private bucket absent and reservation configuration disabled.

Use only the existing `auxiliumos-dev` project `txofqxictwecgcnvezlb`, or an explicit
local Supabase test stack. The integration lead owns migration review, target
reconciliation, current policy/advisor inventory, bucket provisioning, secrets,
function deployment, config and accepted evidence. Never create a replacement
backend. Migration `20261008234953_private_file_transport.sql` must follow
`20261008234951_intake_triage.sql`. It changes no old migration/seed/helper.

The migration assumes actual provider `storage.objects` and `storage.buckets`
relations. It adds restrictive, bucket-scoped policies for anon/authenticated,
including in the presence of unrelated permissive policies. It does not create or
write provider bucket/object metadata. The provisioning script defaults to
read-only; authorized `--create` calls the supported Storage API with private,
64-KiB, text/plain restrictions. It never updates an existing bucket. Existing
entries require explicit reconciliation and `--reviewed-existing`; that flag is
an operator assertion, not proof of policies, signing history or byte inventory.

Provisioning/test environment uses `AUXILIUMOS_TEST_URL`,
`AUXILIUMOS_TEST_PUBLISHABLE_KEY` and `AUXILIUMOS_TEST_SERVICE_ROLE_KEY`, via secure
runtime configuration only. No key belongs in source, logs, prompts or the UI.

```sh
node scripts/private-object-provision.mjs
# Only after explicit development provisioning authorization:
node scripts/private-object-provision.mjs --create
```

Edge `index.ts` pins `npm:@supabase/supabase-js@2.117.3`, matching the existing lock.
Keep platform `verify_jwt=true`; the handler still verifies every user's token
itself. Built-in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and either
`PRIVATE_OBJECT_PUBLISHABLE_KEY` or built-in `SUPABASE_ANON_KEY` are needed.
Only the exact existing development URL defaults
`PRIVATE_OBJECT_TRANSPORT_MODE` to `synthetic-only`, with exact origins
`http://127.0.0.1:4179,http://localhost:4179`. An explicit disabled, empty or unknown
mode disables transport. `PRIVATE_OBJECT_ALLOWED_ORIGINS` replaces that list;
an empty setting clears CORS access, and invalid/nonlocal origins disable the
transport. Overrides accept exact HTTP(S) localhost/127.0.0.1 origins with an
explicit nondefault port, not production hosts, wildcards, paths or credentials.
Local stack serving additionally needs `PRIVATE_OBJECT_ALLOW_LOCAL_TEST=true`
and explicit synthetic mode; it inherits no origin defaults. Unknown project
URLs remain disabled. These defaults neither provision a bucket nor enable SQL.
Only a trusted database owner can enable the existing synthetic reservation config;
there is no client/service enable RPC. Broad backend credentials remain privileged,
not magically bucket-scoped. Never lower user/Storage checks to clear a deployment
failure. Server fetches have bounded bodies/timeouts and forbid redirects.

## Verification and remaining gates

```sh
node --test tests/database/private-file-transport.test.mjs
node --test tests/unit/private-object-gateway.test.mjs
node --test tests/api/private-file-transport.test.mjs
npm run build
```

Database tests use PostgreSQL in PGlite with simulated Auth/session and minimal
test-only Storage relations. Handler tests inject provider/DB failures. Neither
proves genuine JWT, PostgREST, Edge deployment, Storage route behavior or multiple
concurrent target sessions. The authentic API suite fails its prerequisite when
secure configuration is missing; it never skips to a passing result. It creates
fresh synthetic Auth/application fixtures, retains all object bytes/manifests/
audit history, and uses the accepted exact-identity cleanup helper to retire only
its own access/identities. It must run only after operator-authorized provisioning.

The genuine suite checks provider SHA-256/size, real user gateway roundtrip,
cross-account/facility isolation, immutable retries, retained-JWT revocation,
direct ordinary download/list/overwrite/signing denials and finalization audits.
Further target checks remain: real concurrent transactions, DELETE/HEAD/info/
copy/move/public-serving/transforms/resumable/S3 policy/route inventory, deployment
hash parity, provider audit/denial coverage, current advisors, restore byte
inventory, real scanning and designated human clearance. No full M19/C01/C02/C07,
M13, production, release, no-PHI detection or scanner acceptance is claimed.

Current primary docs consulted: [Edge Auth](https://supabase.com/docs/guides/functions/auth),
[Auth headers and key semantics](https://supabase.com/docs/guides/functions/auth-headers),
[standard non-overwriting uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads),
[bucket creation](https://supabase.com/docs/guides/storage/buckets/creating-buckets),
and [changelog](https://supabase.com/changelog). The Supabase/Postgres skills
informed explicit ACLs, current Auth validation, isolated privileged clients and
provider-API-only storage provisioning.
