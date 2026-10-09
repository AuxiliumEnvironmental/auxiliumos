# Personal workspace planning drafts

This development-only surface saves personal, synthetic preparation notes for the forty field-bearing panels in `web/src/pages/module-screen-definitions.ts`. The complete twenty-module destination remains unchanged. AI adoption history, governed audit access and the three Moldo integration panels remain truthful read-only status surfaces. Moldo operates independently; companion work remains deferred.

The owner authorized durable preparation without granting new business authority. Existing `submit_request`, active account membership, `view_account` and the applicable `view_asset` grant authorize these creator-only notes at one synthetic account/facility. No new capability is introduced; the exact five owner-onboarding grants and recovery guards are unchanged. Another user at the same facility, including an administrator or triage user, cannot see or edit the author's drafts. The authenticated profile and original Auth UUID must both match.

Saving never sends a message, queries audit events, creates a request, assigns or schedules work, records a financial transaction, approves scope/sampling, signs terms, adopts AI output, generates or releases a report, changes document/object controls or connects Moldo. References and checkboxes are unverified preparation text. UI actions must say **Save planning draft**, independently of an existing panel's future operational consequence label. The state returned is always `planning_draft`, with `is_demo: true`.

## RPC contract

All methods require a genuine nonanonymous authenticated Data API context and recheck current application authority. Direct table access is revoked and default-deny RLS is enabled. Public invoker wrappers call restricted private definer implementations with an empty search path.

| RPC | Arguments | Result |
| --- | --- | --- |
| `list_workspace_plans` | `p_account_id uuid`, `p_facility_id uuid`, `p_module_key text`, `p_panel_key text` | Array of the latest 100 personal summaries, newest first; an authorized empty list is `[]`. |
| `get_workspace_plan` | `p_plan_id uuid` | Latest full saved record. |
| `save_workspace_plan` | `p_plan_id uuid`, `p_account_id uuid`, `p_facility_id uuid`, `p_module_key text`, `p_panel_key text`, `p_expected_revision integer`, `p_request_id uuid`, `p_title text`, `p_values jsonb`, `p_rows jsonb`, `p_checks jsonb` | Full immutable saved revision. |

The fixed module keys are `scope`, `projects`, `programs`, `portfolios`, `readiness`, `estimates`, `approvals`, `sampling`, `messages`, `vendors`, `finance`, `reports`, `ai`, and `audit`. A panel key is the module key plus its one-based source screen index, for example `scope.1`, `scope.2`, `scope.3`. Only `ai.1`, `ai.2`, `audit.1` and `audit.2` are writable in those last two modules. Fieldless status/history panels have no save contract.

Full records contain `id`, `account_id`, `facility_id`, `module_key`, `panel_key`, `title`, `revision`, `values`, `rows`, `checks`, `created_at`, `updated_at`, `is_demo`, and `state`. Summaries omit `values`, `rows`, and `checks`; fetch a record before editing it. List limits are deliberate development bounds; older records remain retrievable by their known IDs. General pagination and shared planning are future work.

Values are a string-valued object keyed by exact field labels in the frozen SQL catalogue. Rows are an array of string-valued objects keyed by that panel's exact repeat-field labels; local React row IDs are not sent. Checks are a boolean-valued object keyed by exact checklist labels. Review panels also allow `Current revision notes` and `Proposed revision notes`; every checklist allows `Review notes`. A schedule's month filter is local UI state. Missing fields are allowed for an incomplete draft; unknown fields, arbitrary nested JSON, actor/authority fields and nonboolean checks are rejected.

Bounds: title is trimmed and 1–120 characters; text fields are at most 500 characters; multiline fields at most 4,000; dates are empty or actual `YYYY-MM-DD` dates; money is empty or plain signed decimal with at most 12 integer and 2 fractional digits; quantity allows 6 fractional digits; select values are empty or exact catalogue options. Up to 50 repeat rows and 64 KiB of serialized values/rows/checks are accepted. URL schemes, `www.` addresses and recognizable credential/token markers are rejected; this is a bounded synthetic-note surface, not a comprehensive PHI/secret detector. No files, executable content, source URL fetching or external actions exist. Do not enter real sensitive data.

Create with a fresh client-generated plan UUID, expected revision `0`, and a fresh request UUID. Edit with the latest returned revision, the same plan/context/panel, and a fresh request UUID. For a deliberate retry of an uncertain response, preserve every original argument and the request UUID. An exact retry rechecks current identity/access, makes no writes and returns the original saved revision. If a later revision exists, this historical receipt may be older: refresh `get_workspace_plan` after success and never regress a newer UI snapshot. A request UUID binds one full intent per author, including plan, expected revision and content; changed intent conflicts. A fresh request with an old expected revision conflicts without overwriting.

| SQLSTATE | Meaning |
| --- | --- |
| `42501` | Unauthenticated, inactive, inaccessible, noncreator, wrong scope, missing record or unavailable operation. Do not infer record existence. |
| `22023` | Invalid catalogue key, shape, field type, title or payload bound. |
| `40001` | Stale revision or request UUID reused for different intent. Reload and let the user reconcile; do not automatically overwrite. |

## Storage and evidence

Migration `20261009170854_workspace_plans.sql` adds private draft heads and immutable revisions only. Mutations lock the current identity/access rows, then serialize the author's request keys and the selected plan. Revision CAS and the immutable content insert occur in one transaction. Scope, author and catalogue keys never move. Updates/deletes/truncation of revisions and deletes/truncation of heads are denied. Every new revision appends one protected `workspace_plan_created` or `workspace_plan_revised` event, with synthetic/user provenance and identifiers/revision metadata only; no entered text, check values, URLs or credentials enter the audit metadata. Existing audit families are preserved.

The focused PostgreSQL-engine tests exercise authorization, cross-account/facility and same-facility isolation, inactivity/revocation, typed catalogue validation, exact retries, stale revisions, immutable history, safe audit, and absence of approved-domain mutations. Simulated Auth database tests do not prove hosted Auth, Data API, true concurrent sessions or browser completion. The integration lead owns real deployment, hosted checks and canonical control records.
