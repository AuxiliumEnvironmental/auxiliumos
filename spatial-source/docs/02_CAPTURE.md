# Apple capture contract

## Baseline pipeline

Preflight -> camera permission -> create one ARSession -> guided RoomPlan room
capture -> preserve raw CapturedRoomData -> RoomBuilder result -> preserve processed
CapturedRoom -> shared-space multi-room merge -> normalization -> local draft ->
review. Store session/frame identity and normalization version with the result.
Never claim that a raw capture or intermediate geometry is an accepted floorplan.

Verify API signatures in the actual stable SDK. Current documentation provides
RoomBuilder(options:), StructureBuilder(options:), capturedRoom(from:) and
capturedStructure(from:). Older presentation snippets may differ; the SDK and
current symbol reference govern compilation [A03, A14].

## Capability and permission

Use RoomCaptureSession.isSupported and supported AR configuration checks. Check
camera authorization before session creation. Unsupported hardware offers viewing,
manual editing/import where available, with an explicit explanation. Do not
request microphone, location or photo-library access for ordinary room capture.
No simulator capture certification. Pin actual tested OS/device combinations.

## State machine

idle -> preflight -> capturing -> finishing -> archived -> processing -> draftReady
Capturing can transition to interrupted, lowStorage or trackingLimited. A user
cancellation has its own terminal path. A new attempt receives a generation ID;
late callbacks from another generation cannot replace the active draft.
Persist state transitions needed for recovery. A second start/finish tap must not
create duplicate segments or race two RoomBuilders.

Finish stops room capture, not necessarily the world session. For consecutive
rooms, preserve the same ARSession and stop with pauseARSession:false. Do not reset
tracking between those rooms. Only merge captures with compatible world space.
Room names, timestamps, same address or visually similar geometry do not establish
compatibility [A02, A03].

## Interruptions and relocalization

App backgrounding, phone calls, lock, camera contention, thermal problems or a
tracking reset may end continuity. Persist completed segments promptly. Never
promise the active ARSession survives a background suspension.

When supported, save an ARWorldMap with session identity for relocalization.
Loading one is not proof of success: guide the user back to known space and wait
for normal tracking before joining new geometry to that coordinate frame [A03].
Failed relocalization creates a new, clearly marked segment; require explicit
alignment/review. Keep old segments. Do not overwrite them with a plausible guess.

Before restarting, show what was actually retained: "2 rooms saved; current room
needs another scan" is acceptable when true. "All saved" is not acceptable when
only an in-memory preview exists.

## Guiding efficient capture

Use Apple's instructions/quality signals first [A04]. Provide one useful next
instruction rather than a wall of alerts. Guide corners and doorway transitions;
show a compact accumulated outline and a clear Finish room action. Allow users
to label rooms after capture rather than requiring lengthy data entry mid-scan.
Retain work when they dismiss an optional label prompt.

Quality review is a queue of actionable geometric concerns: disconnected rooms,
missing portal connection, unclosed boundaries, competing wall matches, or an
unreviewed approximation. Tap an issue to focus the relevant location. If a
suggestion cannot be supported by observed data, present it as a manual check,
not an automatically detected defect or numeric accuracy score.

## Sensor discipline

CapturedRoom confidence concerns feature classification, not verified dimension
accuracy [A06]. ARDepthData confidence is different and can support filtering
when depth is actually collected [A07]. Store source and meaning, not one synthetic
"98% accurate" badge. Do not conflate normal tracking with a complete floorplan.

Optional depth/scene geometry can corroborate plane geometry when available.
Validate the coordinate transforms, timestamp alignment and on-device cost first.
Enable only needed frame semantics. No continuous RGB video retention. Raw Apple
result archives are retained locally under the data policy, not uploaded by default.
The exact sensor streams available are defined by public Apple APIs, not by claims
of unrestricted access to Apple's internal fusion or Neural Engine controls.

## Resource and difficult-scene handling

Preflight free disk space using a measured reserve. Serialize heavy postprocessing
and bound capture queues. Monitor thermalState and Low Power Mode; reduce preview
work and optional depth checks before core capture, and offer a safe checkpoint
when the device needs to cool [A10]. Pause/resume status must reflect what the SDK
actually permits. Avoid retained pixel buffers, repeated large image copies and
unbounded per-frame allocations.

Test mirrors, glass, low contrast, clutter, partial occlusion, angled walls, curved
surfaces, tall rooms and open-plan areas. Don't invent geometry behind furniture
or force all corners to right angles. A failure must leave an editable, clearly
incomplete result or a retained segment, not a fabricated closed room.

## Device acceptance

Complete the journeys in docs/07_VERIFICATION.md. Include moving between rooms,
entering and leaving the application, locking the device, interruption during
processing, insufficient storage and unsuccessful relocalization. Record the real
iPhone model, iOS/Xcode versions and inputs. Check total time including correction,
not just sensor-running time. No general superiority claim follows from these tests.
