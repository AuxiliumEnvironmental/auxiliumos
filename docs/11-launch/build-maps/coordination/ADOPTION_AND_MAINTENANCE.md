# Adopt these maps without creating competing sources of truth

## Adoption is a documentation change, not an application reset

This package adds coordinated development maps around the reviewed reference source. It does not replace current GitHub, Lovable, backend or Spatial source. The map baseline is dated. Before implementing anything, reconcile the actual current heads, working changes, pending operations and owner instructions. Preserve valid later work and treat implementation observations according to their evidence level.

Suggested live documentation destination: `docs/11-launch/build-maps/`. Adopt only the new maps, their contract/coverage references and coordination guidance. Keep the embedded `reference/` as a frozen archival reference or link to the existing originals; do not copy its full application tree into the live repository again. Do not add a second copy of every historical artifact merely to support the new links.

The package includes a byte-for-byte copy of the prior reviewed reference directory. Its own index/verifier stays intact under `reference/`. The new scope direction is recorded outside it in `OWNER_DIRECTION_UPDATES.md`, preserving the provenance of both editions.

## Reconcile and adopt once

1. Verify this package. Compare its pinned source to current controlling source. Read the current `AGENTS.md` and owner instructions; historical restrictions in the archive do not override later authorization.
2. Resolve only actual conflicts. A source file proves code exists; actual runtime evidence proves its tested behavior; an owner instruction governs intended product direction. Preserve these distinctions instead of choosing whichever source is newest for every purpose.
3. Adopt the maps into the selected documentation destination through one reviewed change. Fix relative links and `repo:`/`baseline:`/`spatial:` aliases for that home. Keep an explicit pointer to archived source pins.
4. Reconcile every exact acceptance alias against current `REQUIREMENTS.json`. Retain its canonical ID/text. If criteria were reordered or changed, update aliases and hashes with a recorded reason; never quietly substitute a weaker criterion.
5. Bind each proposed interface to its actual existing or reviewed source contract when needed. Keep schema/state/error examples in the owning domain's current documentation. Do not create a duplicate OpenAPI or SQL definition from the prose register.
6. Translate selected Sxx/map-local proposals into bounded children of existing queue parents. Retire the proposal as a dispatch aid once its live task exists; do not maintain parallel completion statuses here.
7. Record the adopted source/document revision in the existing control history. Assign one current integration lead and exact active path allocations before writers start.

## Authoritative records

| Concern | Live record | Map-package role |
| --- | --- | --- |
| Product acceptance | `REQUIREMENTS.json` | Exact source-linked accountability and dependency coverage |
| Work and assignments | `BUILD_QUEUE.json` | Outcome proposals and map-local packet suggestions |
| Observed implementation and access | `BUILD_STATE.json` | Dated source facts and cautions to reconcile |
| Owner policy and activation | `OWNER_DECISIONS.json`, `config/policy-defaults.json` | Existing decision IDs, exact gate text and responsible workstream |
| Verification | `VERIFICATION_PROFILES.json`, actual receipts | Evidence rules and targeted gaps; no new test framework |
| Source continuation | Existing checkpoint, resume and source reconciliation records | Consistent cross-chat return protocol |
| Domain API/data contract | Current owning domain docs, code and migration history | Named producer/consumer semantics and shared review boundaries |

## Keep detail useful

The maps go deep enough to prevent major logic and ownership gaps. They intentionally do not invent final table names, algorithms, visual dimensions, policy values or API signatures for unfinished domains. Such precision without current source and reviewed domain meaning would create false certainty. The next bounded task supplies the missing implementation detail and updates the owning contract once.

Use a short decision record when a real ambiguity affects interfaces, authority, stored meaning or user workflow: source problem, controlling requirement, options considered, chosen minimal approach, affected consumers, compatibility/recovery, evidence and remaining gate. A routine local helper or spacing change does not need a new architectural decision.

If an original capability remains difficult, expose its precise missing dependency. Do not remove it to make the map look complete, and do not build unrelated infrastructure to avoid it. If an owner explicitly changes the destination, preserve the prior requirement/history and update the canonical source and linked maps together.

## Improvement intake after or within the original plan

Use the existing issue/queue system with these fields only when they help the decision:

- Observed problem or explicit source outcome, affected audience and evidence.
- Current cost: steps, re-entry, waiting, error rate, latency or lost work, measured when possible.
- Smallest proposed improvement and its acceptance.
- Affected map/interfaces and data/authority implications.
- Whether this is an original-scope defect/efficiency fix or a new capability needing owner direction.

This is an evaluation method, not an additional feature backlog. Do not populate it with speculative tools. The first priority remains a useful, connected, accepted implementation of the existing destination.

## Completion language

Say **specified** when a contract is written; **implemented** when reviewed code exists; **verified** only for the exact executed evidence; **deployed** only after target readback; and **activated** only for the named capability under applicable authority. A map can be fully accounted for before its software is finished. A PDF, diagram or complete coverage count cannot guarantee no bugs.
