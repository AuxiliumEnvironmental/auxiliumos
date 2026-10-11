# Verification, performance and competitive proof

## Evidence classes

A. Portable tests: geometry, edits, serializers, schemas and delivery state.
B. Apple build: actual Xcode target compiles/links with native frameworks.
C. Physical capture: observed scan/session behavior on real supported hardware.
D. Field usability: tasks completed by representative users in real spaces.
E. Integration: genuine receiver/auth/storage and adverse-delivery behavior.
F. Release: signing/distribution/privacy/access gates for intended deployment.

Evidence does not jump classes. Current shared source has fresh TypeScript and
browser execution, hash-bound independent review, both unsigned Apple app builds
and 14 synthetic simulator tests. No physical-device or field acceptance is claimed.
See evidence/shared-workspace/REQUIREMENTS.json and APPLE_COMPILE.json for current
results; earlier continuation reports remain historical. Active work is recorded
in BUILD_STATE.json. The workloads and acceptance targets below remain unchanged.

## Initial workload and capture profiles

Capture pilot: small single-floor interiors, initially within the historical
Apple residential MultiRoom guidance cited in A02, with bright/low-contrast and
occluded variations. This is an evaluation profile, not a guaranteed accuracy
limit. Keep multiple floors as separately reviewed layouts in v1.

Proposed rendering/edit stress profile: 100 rooms, 1,000 walls, 500 openings and
2,000 overlay markers on a selected floor. Those counts test the application
engine, not the LiDAR operating envelope. Add an extended 10x synthetic stress
case only to identify controlled degradation, not certify scanning such a site.
Safety parser caps are upper rejection limits, not advertised usable capacity.

## Proposed performance budgets

- Ordinary local action acknowledgment: p95 <= 100 ms after touch processing.
- Warm 2D/3D switching: p95 <= 500 ms for the agreed pilot model after assets load.
- Active manipulation: target 60 Hz on baseline iPhone 15 Pro; measure p95 frame
  work against approximately 16.7 ms, noting OS scheduling and thermal state.
- No continuing retained-memory growth across 20 open/edit/close cycles after
  allowing caches to stabilize. Establish absolute memory budget by profiling.
- No network required for local edits or already-saved document reopening.
- Successful durable save must survive tested app-kill/relaunch scenarios; include
  adverse interruptions around DB/file boundaries. Do not promise hardware-proof
  immortality or equate atomic replacement alone with power-loss protection.

Record actual device/OS, model counts, warm/cold state, profiler settings, network,
thermal state and sample count. Do not assert p95 from a handful of runs or change
budgets without an explicit documented trade-off review. Frame-rate averages are
not enough to detect gesture stutters.

## Essential physical journeys

CAPTURE: permission denied; unsupported device; asymmetric room; connected rooms;
open-plan areas; rotated/angled wall; curve/nonuniform wall; missed doorway;
mirrors/glass; clutter; low light; tall wall; tracking loss; user cancellation;
Finish twice; new capture while old processing completes; app background/lock;
relocalization success/failure; low disk; severe thermal state; processing failure.

EDIT/3D: shared-corner movement; wall split/join; opening resize/host change; invalid
room closure; disjoint spaces; 2D/3D selection consistency; wall holes visible in
3D; no triangle seams; cutaway; walk through valid portals but not windows;
unknown-space stop; Reduce Motion; VoiceOver list; small screen/large text;
undo/relaunch; edit after publish retains old revision.

EXPORT/DELIVERY: offline local export; exact SVG/PDF/PNG/3D orientation match;
malicious filenames/labels; malformed indices; archive traversal/bomb; duplicate
JSON keys; unsupported schema; failed transfer; receipt mismatch; same ID replay;
old source version; revoked membership; cross-business target; receiver outage;
metadata-only backup restore does not masquerade as recovered object bytes.

## Minimum golden geometry fixtures

Rectangle, L-shaped room, concave room, angled corridor, shared wall/door,
open-plan area boundary, closely parallel walls, stacked openings, curved path,
nonuniform height, disconnected rooms and distinct floors. Include asymmetric
orientation markers and negatives. Physical scan fixtures are added only with
consent and sanitized storage. Synthetic fixtures cannot establish sensor quality.

## Competitive benchmarking

Compare the same completed task, not feature-list length. Record capture time,
correction time, successful room connections, missed/false openings, operator
interventions, crashes/lost saves and usable export time. For unmeasured layouts,
use topology/relative shape checks and an independently established reference;
do not advertise survey accuracy. Use fixed instructions, comparable training,
novice/experienced cohorts and honest sample sizes. No competitor code or copied
UI. Treat superiority as an empirical result, never a starting assertion.

## Efficient verification

- Core-only change: targeted unit/golden/property tests plus affected serializers.
- UI change: targeted gestures/accessibility/screenshots and profiled hot paths.
- Shared schema: all affected readers/writers, migrations and old fixtures.
- Persistence/security: interruption, rejection and authorization tests.
- Capture/session change: required physical-device journeys, not more mock tests.
- Release candidate: integrated critical journeys once against an identified build.

Evidence reuse key includes source/dependency/config/fixture hashes and environment.
Unchanged evidence can be reused within its scope. Do not rerun unrelated tests
merely to create activity. Do not count repetitions as additional coverage.
