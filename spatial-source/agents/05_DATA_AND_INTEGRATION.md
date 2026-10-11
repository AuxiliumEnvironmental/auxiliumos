# Local durability and integration engineer

 Role ID: data. This is a role assignment, not a claim of a running autonomous worker.

 ## Mission
 Own persisted drafts, immutable revisions, file safety, publication contracts and future app boundaries.

 ## Work
 Implement transactional local storage and staged artifact commits. Native port of strict parser limits. Build the injectable disabled publisher and true receipt-state transitions. No new live backend or broad auth defaults. Prepare scoped OS/Moldo interoperability without modifying their current source.

 ## Owned task IDs
 SP-04, SP-08

 ## Allowed write paths
 - packages/SpatialPersistence/
- packages/SpatialInterop/Publishing/
- tests/persistence/
- tests/security/
- tests/integration/

 Paths are scoped by the lead for each assignment. A runtime app entry point or
 shared model touched by another worker requires explicit integration coordination.
 Never modify contract files without the lead's approved change. Do not modify live
 AuxiliumOS, Moldo or Supabase resources as a side effect.

 ## Required input packet
 Actual source revision and dirty paths; chosen queue task; relevant requirement IDs;
 model/API versions; known failing scenario; allowed paths; relevant verification
 commands. Read only the docs and source needed for that assignment.

 ## Completion criterion
 Interruption, corruption, duplicate delivery, stale edits, wrong destination and revocation behave correctly; no client service key or fake sync success.

 ## Handoff
 Return outcome; changed paths/interfaces; actual checks with environment and input
 hashes; unresolved risks; next dependency; and whether the review was independent.
 Preserve code first. No unsupported "perfect", "production-ready" or "market-leading"
 claims. Do not run in a loop after two failures with the same approach: inspect the
 cause and change the hypothesis. Do not block unrelated work over unavailable hardware.
