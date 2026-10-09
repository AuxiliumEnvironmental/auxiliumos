# Development owner onboarding

The owner's 2026-10-09 instruction makes usable owner access an immediate outcome. It is independent of document release and the 20-module completion boundary. The existing identity, access, audit, intake and private-file contracts remain authoritative. This supplements ADR-002's previously unimplemented invitation/recovery boundary; it does not create a general public signup or role-management API.

## Identity and scope

`scripts/owner-onboarding.mjs` accepts only the explicitly authorized owner's normalized email, checked against a fixed SHA-256 allowlist. The email itself is supplied through a nonsecret manual workflow input, not committed to source. Neither email, Auth UUID, passwords, links, OTPs nor generated tokens appear in its receipt or errors. The existing `auxiliumos-dev` project is fixed to `https://txofqxictwecgcnvezlb.supabase.co`; Moldo and other backends are rejected.

The dedicated persistent development rows use these IDs. No foundation seed profile is reassigned.

| Existing object | Reserved ID | Meaning |
| --- | --- | --- |
| Client Account | `80f693ae-4109-442c-b719-000000000001` | AuxiliumOS Development |
| User Profile | `80f693ae-4109-442c-b719-000000000101` | Development owner, linked once to the verified Auth identity |
| Account Membership | `80f693ae-4109-442c-b719-000000000201` | Existing `system_admin` designation, without implied capabilities |
| Facility | `80f693ae-4109-442c-b719-000000000301` | Owner Workflow Sandbox |

`is_demo=true` restricts these rows to the existing development authorization path. The owner is a real person using synthetic development records, not a disposable test identity. Test cleanup must never adopt or delete this owner. No production identity, real client data, retention policy or Moldo access is inferred.

| Exact capability | Scope | Reserved grant suffix |
| --- | --- | --- |
| `view_account` | Dedicated account only | `701` |
| `view_asset` | Dedicated facility only | `702` |
| `submit_request` | Dedicated facility only | `703` |
| `triage_request` | Dedicated facility only | `704` |
| `ingest_private_object` | Dedicated facility only | `705` |

Grant IDs use the same `80f693ae-4109-442c-b719-000000000` prefix. No all-facilities grant, clearance reviewer, technical reviewer, release authority, signer, financial authority, scanner role or unrestricted administrative mutation is assigned. Administrative designation does not mean an access-management interface already exists. Current quarantine, PHI escalation, exact-version and release checks continue to apply to every file.

## Protected workflow

The existing `.github/workflows/ci.yml` defines a separate `owner-onboarding` job. It has no dependency on API acceptance, Storage, document review/release or other modules. Only the exact reviewed repository and `wip/recovery-2026-10-08` branch can reach a secret-bearing step, which checks out the dispatch SHA.

The privileged key is injected only into the explicit owner operation, never installation, browser code, artifacts or workflow inputs. Configure the existing **GitHub Actions repository secret `AUXILIUMOS_TEST_SERVICE_ROLE_KEY`** for development project `txofqxictwecgcnvezlb` through GitHub's protected secret form. An agent must never request or accept its value in chat. The registered workflow path and an operator's actual dispatch access are separate prerequisites from secret availability.

| Manual input | Behavior |
| --- | --- |
| `owner_onboarding_action=preflight-only` | Default. Reads schema, availability of the service-only activation helper, Auth inventory, reserved rows and immutable audit history. Does not create an identity, send mail or modify access. |
| `owner_onboarding_action=invite-and-provision` | Explicitly sends one supported invitation when no owner Auth identity exists; provisions only the exact rows above and activates initial access atomically. An exact active configuration is a read-only idempotent result. |
| `owner_onboarding_action=send-recovery` | Requires the exact active owner configuration, verifies redirect resolution and sends recovery through the public Auth API. No access changes. |
| `owner_onboarding_action=skip` | Runs no owner operation. |
| `owner_email` | The already-authorized recipient. Other addresses fail before requests. |
| `reviewed_owner_auth_id` | Normally empty. Required to adopt an existing, independently reconciled and entirely unlinked Auth identity for that same recipient. Cannot override another profile, lifecycle, hash or linkage check. |
| `run_development_acceptance=false` | Avoids rerunning the broader API suite during a focused owner task. |
| `run_connected_ui=true` | Independent focused connected browser job; requires its own current synthetic document ID/revision and Storage gates. It is not an owner-provisioning dependency. |

`owner-access-configuration.json` contains only bounded status, exact application IDs/capabilities, target, source commit and time. It always distinguishes application access from personal password setup and successful owner login. `owner-access-configuration.log` contains only sanitized failures. Tracked old copies are cleared before the operation. A mail API success means the provider accepted a request, not that the owner received the email.

## Invitation, recovery and redirect checks

Both supported callbacks are pinned to the existing Lovable preview origin:

- `https://id-preview--0b7bbfc6-627f-4ca0-9217-98f5b164b419.lovable.app/?auth=invite`
- `https://id-preview--0b7bbfc6-627f-4ca0-9217-98f5b164b419.lovable.app/?auth=recovery`

Before an actual invitation or recovery email, the command creates one uniquely named synthetic Auth identity through `auth.admin.createUser`, with no application profile, grants or password. For both callbacks it uses supported `auth.admin.generateLink` recovery requests and checks the provider-resolved `properties.redirect_to` exactly. It neither prints, follows nor persists the generated link, token hash or OTP. It revalidates the exact generated Auth ID/email and absence of application linkage before deleting only that disposable identity through Admin API. Any redirect mismatch or unconfirmed cleanup prevents owner email. A transport failure before creation confirmation may require independent Auth inventory reconciliation; the command never guesses a deletion target.

This probes effective callback resolution. It does not inspect or change Auth configuration, verify a custom mail template, guarantee invitation/recovery mail delivery, or certify the owner's first browser login. Default read-only preflight does not create this probe. The provider must permit email authentication and be able to send to the authorized recipient. An unexpected fallback requires fixing provider Auth URL configuration, never weakening the target allowlist.

The actual owner invitation uses `auth.admin.inviteUserByEmail`; the command never creates an owner password, retrieves an owner link, calls `generateLink` for the owner or signs in as the owner. The owner personally opens the delivered link, creates their password in the application and signs in. Expired links use the application's password-recovery action or the explicit supported recovery action. The script creates no public signup-to-membership trigger and reads no `user_metadata` for authority.

## Atomic activation and interruption recovery

Migration `20261009130331_owner_onboarding_activation.sql` adds only the private activation function and public invoker wrapper, both executable solely by `service_role`. The private function requires the existing trusted PostgREST service context. `p_preflight=true` with null Auth ID is read-only. All browser roles are denied even if historical provider default function grants are broad.

The mutating operation reads and locks the exact Auth email/ID, then the fixed profile, account, access, facility, memberships and five capabilities. It requires matching initial system-audit provenance and no relevant revocation, removal or deletion history. `FOR UPDATE` profile/access locks also serialize foreign-key-dependent grant/membership inserts. It activates only a never-active suspended profile. An already-active exact state is read-only idempotent; a formerly active suspended profile cannot be revived. The ordinary immutable audit trigger records the actual system operation without impersonating the human owner or a professional approver.

Provisioning uses supported Auth APIs and normal trusted Data API inserts. No SQL writes to `auth.users`, resets, upserts, historical relinking, deletion of application rows or grant restoration occur. The profile remains suspended until the final activation transaction. A failure after invitation but before creating its profile needs the explicitly reviewed existing Auth UUID. A failure after creating a suspended profile can resume against its matching immutable initial history and exact reserved rows. Unexpected existing metadata, broader permissions, missing historical grants or removed identities fail closed for review. Never clear immutable history to make onboarding pass.

## Verification and remaining acceptance

Focused tests are `tests/unit/owner-onboarding.test.mjs` and `tests/database/owner-onboarding.test.mjs`. They exercise the real script/SQL with only the fixed recipient hash replaced by a synthetic fixture hash. Unit tests check supported API calls, paging, exact recipient/identity guards, read-only default/idempotence, redirect cleanup, partial setup, recovery, secret-safe errors and endpoint pinning. PostgreSQL tests check function grants, trusted context, exact scope, system provenance, wrong email/identity, revocation history and denial of reactivation. PGlite uses simulated Auth claims and is not hosted or concurrent-session proof.

Actual hosted invitation, provider mail delivery, owner password setup and the owner's first login remain unverified until individually observed and recorded in the existing control records. The integration lead owns deployment/readback and secure dispatch. A passing unit suite, migration application or emitted `configured=true` must not be reported as a successful personal login.

Provider mechanisms checked against the installed SDK `@supabase/supabase-js@2.117.3` and current official references: [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [Auth redirect handling](https://supabase.com/docs/guides/auth/redirect-urls), and [provider generate-link redirect validation](https://github.com/supabase/auth/blob/master/internal/api/mail.go). Provider behavior is not business-authority approval.

For initial owner setup, select `invite-and-provision`, the authorized owner email, leave `reviewed_owner_auth_id` empty while the verified Auth inventory is empty, and keep both acceptance switches false. Selecting `private_bucket_mode=create-if-absent` also runs independent private storage preparation under the reviewed same-target guard. This prepares the missing bucket without making owner access wait for storage or starting tests against disabled gates. Keep `reviewed_existing_private_bucket=false` for the verified empty initial inventory.
