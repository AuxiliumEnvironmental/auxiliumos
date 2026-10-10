# AuxiliumOS coordinated build maps

Edition: October 9, 2026, America/Chicago. These maps extend the reviewed launch-reference package. They organize development responsibilities and acceptance. They do not certify the existing product as finished or change live code.

## The approach

Work backward from the finished outcome, then build forward in small connected increments. For each outcome, identify the authoritative facts, actors, decisions, rules, interface, failure recovery and evidence that make it real. Assign one accountable owner to each requirement and one active writer to each allocated file. Integrate each useful workflow as it becomes ready.

Eight maps divide the work into manageable areas. They are not eight new applications, deployment services or concurrent write permissions. A UI map supplies shared experience rules; domain maps implement complete features using those rules. A platform map supplies reusable foundations; domain teams can implement their own backend work within the agreed contracts. Verification starts with each task.

## Files to use

| File or folder | Purpose |
| --- | --- |
| `00_Master_Build_Map.md` | Product outcomes, ownership, dependencies and the route to useful software |
| `Owner_Quickstart.pdf` | Short explanation of how to start the chats and preserve coordination |
| `maps/01_Platform_Backend_Security.md` | Shared identity, access, platform services, audit and backend foundations |
| `maps/02_User_Experience.md` | Navigation, context, role-appropriate work, forms, responsive behavior and shared components |
| `maps/03_Professional_Workflows.md` | Intake, scope, sampling, execution and controlled change |
| `maps/04_Commercial_Authority.md` | ROM, agreements, authorization, vendors and operational finance |
| `maps/05_Enterprise_Readiness_Reporting.md` | Accounts, programs, portfolios, sites, readiness and reporting |
| `maps/06_Evidence_Communications_AI.md` | Controlled documents, contextual communication and bounded runtime AI |
| `maps/07_Tools_Integrations_Spatial_Moldo.md` | Shared tool hosting, standalone Spatial, independent Moldo and approved adapters |
| `maps/08_Verification_Release_Operations.md` | Evidence, change review, source reconciliation, recovery and release acceptance |
| `contracts/` | Twenty named producer/consumer handoffs and their required semantics |
| `coordination/` | How chats reserve work, change shared contracts, review and merge without racing |
| `chat-prompts/` | One coordinator prompt and eight map-specific assignments |
| `coverage/` | Every canonical acceptance criterion assigned once, all catalogs accounted for, dependency-ready slices |
| `reference/` | The complete previous reviewed source/reference package, unchanged |

The original source package is embedded so this download can stand on its own. Do not replace live application files with `reference/`. Its contents remain dated sources, including known stale historical instructions. Later actual code, approved decisions and owner instructions must be reconciled before implementation.

## Start with one coordinator

Give the coordinator this package and `chat-prompts/00_Integration_Lead.txt`. It verifies current source, active writers and existing state, then dispatches the first bounded work. Open map chats as needed using their supplied prompts. Start with no more than three active specialists, following the existing repository limit; the other maps remain available without creating extra writers.

A chat cannot be assumed to see another chat's unsaved work, local files or messages. Coordination must use a verified shared repository, precise commits/contracts and saved return records. If a writer cannot share durable work, it returns an exact patch/package and stays out of the same shared write surface until the integrator reconciles it.

Each map is a responsibility across the build, not an instruction to finish every line of that map in isolation before integration. The coordinator chooses a small task from the dependency-ready slice map and assigns an exact path allocation. No whole-map task may claim every file under `web/` or every migration indefinitely.

## What is preserved

All 20 product modules, all 28 requirement sets and all 163 acceptance criteria are retained. Each criterion has one accountable map and named collaborating maps. All 171 original catalog candidates and 18 relationship types remain traced to their source. The same 17 owner-decision records gate their affected real activation; there is no new approval workbook.

The newer owner instruction to use `spatialauxilium.io` for independently hosted Spatial is recorded as product direction. It does not establish that DNS, hosting, access controls or physical-device delivery are complete. The full shared editor inside OS remains required. See `coordination/OWNER_DIRECTION_UPDATES.md`.

## Verification and future changes

Run `python3 tools/verify_maps.py` from the extracted package. It checks hashes, the unchanged baseline, scope ownership, interface references and the executable work sequence's dependencies. This checks the map package, not application behavior.

The existing repository keeps the live requirements, queue, state, decisions and evidence. Adopt these maps as coordinated documentation under `docs/11-launch/build-maps/` with adjusted links. Translate the proposed slices into existing queue parents. Do not create a second mutable queue from this snapshot.

Additional improvements can be captured after the original outcome is clear. Fixing a defect, removing unnecessary steps or improving performance inside that outcome is ordinary implementation. A new product capability needs a source requirement or an explicit new owner decision. No speculative feature is introduced by this edition.
