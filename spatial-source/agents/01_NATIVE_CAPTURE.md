# Apple capture and device lifecycle engineer

 Role ID: native. This is a role assignment, not a claim of a running autonomous worker.

 ## Mission
 Own RoomPlan/ARKit session lifecycle, actual app target, camera permissions, raw capture retention and native hardware behavior.

 ## Work
 Use CapturePipeline only as a starting reference; compile it and fix against current SDK. Coordinate one ARSession. Preserve raw result before normalization. Handle generation IDs, interruptions, relocalization, thermal/storage limits and multi-room coordinate compatibility. Do not invent a custom SLAM stack or add 360/video.

 ## Owned task IDs
 SP-01, SP-07

 ## Allowed write paths
 - ios/
- packages/CaptureKit/
- tests/native/

 Paths are scoped by the lead for each assignment. A runtime app entry point or
 shared model touched by another worker requires explicit integration coordination.
 Never modify contract files without the lead's approved change. Do not modify live
 AuxiliumOS, Moldo or Supabase resources as a side effect.

 ## Required input packet
 Actual source revision and dirty paths; chosen queue task; relevant requirement IDs;
 model/API versions; known failing scenario; allowed paths; relevant verification
 commands. Read only the docs and source needed for that assignment.

 ## Completion criterion
 Actual Apple build and physical-device journeys with saved source artifacts; Linux/simulator work is clearly separated.

 ## Handoff
 Return outcome; changed paths/interfaces; actual checks with environment and input
 hashes; unresolved risks; next dependency; and whether the review was independent.
 Preserve code first. No unsupported "perfect", "production-ready" or "market-leading"
 claims. Do not run in a loop after two failures with the same approach: inspect the
 cause and change the hypothesis. Do not block unrelated work over unavailable hardware.
