# Native navigation acceptance still required

Implemented source and 31 portable cases are not Apple compilation or hardware
interaction evidence. No running native app was available to this worker.

## Required built-app checks

- Compile/link the actual application with Apple SDKs, then run on supported
  iPhone hardware. Do not substitute a Linux parse or simulator for LiDAR capture.
- Open a corrected asymmetric connected-room scan. Start at the selected room
  and a visible floor point; attempt placement through an opaque wall and ceiling.
  Only an exposed floor can receive free placement. Named jumps are explicit.
- Tap/step through an accepted floor-level shared door and passage. Try a window,
  unknown exterior opening, nonshared coincident walls, narrow/raised/low opening,
  jamb-grazing diagonal and long request. Verify no tunneling or guessed routes.
- Test reset and exit after stopping at a wall, during movement, after a room jump,
  and after changing floor/revision. Exit and reset cannot scroll out of reach.
- Toggle Reduce Motion during use. Named jumps are immediate and labeled;
  tap-to-move has no head bob, and Reduce Motion uses immediate validated movement.
- Orbit around every side with Cutaway on/off. Only occluding near faces disappear;
  far faces and all semantic opening outlines remain. A ray through an actual
  opening must not incorrectly remove its host. Enable display ceilings and verify
  the assumed label and omission of rooms with inconsistent top heights.
- Select opening edges through holes; select concave floors without selecting
  their missing corners; verify overlapping edge/node disambiguation and shared
  node, wall, opening, room and semantic-area selection after 2D/3D switching.
  View selected walls from the back to confirm double-sided highlight visibility.
- Rapidly toggle 2D/3D, switch floor, edit, undo, close and reopen during movement
  and detached scene work. No late hit, old revision, retained resource growth,
  camera movement after exit, or reset to another floor may occur. Work cancels
  between bounded geometry phases; mid-phase timing remains a profiling risk.
- Check light/dark mode, large Dynamic Type, VoiceOver, small phone/landscape and
  display zoom. Verify 44-point controls/targets, status announcements and no
  clipping of pinned reset/exit. Horizontal optional tools remain discoverable.
- Measure actual touch acknowledgment, warm switching, active frame p95 and
  retained memory against docs/07_VERIFICATION.md, including the agreed stress
  profile. The entity/vertex safety cap is not a reduced performance budget or
  proof that its maximum is responsive. Oversize rejection preserves the draft.

## Primary API references used for source review

- https://developer.apple.com/documentation/realitykit/arview/project(_:)
- https://developer.apple.com/documentation/realitykit/arview/ray(through:)
- https://developer.apple.com/documentation/realitykit/perspectivecameracomponent/near
- https://developer.apple.com/documentation/realitykit/perspectivecameracomponent/far

No prototype screenshot, synthetic scan or portable result is accepted in place
of these real application journeys.
