# Required device evidence

Status: not executed in this Linux implementation window. Preserve synthetic
fixture tests as a different evidence class. Do not mark any case passed without
observing the built app on the named physical device.

Record: source commit, source/dependency/config hashes, Xcode+SDK versions,
iPhone model, iOS version, available storage, thermal/Low Power state, workload,
and the resulting artifacts/screen recordings without private client content.

1. Build the native target and native synthetic tests. Record compiler output.
2. Deny camera permission, reopen saved synthetic layout, then grant permission
   in Settings and start a real room. Try unsupported iPhone hardware separately.
3. Capture an asymmetric room with an angled wall, door and window. Finish once
   and rapidly twice. Confirm one raw source, one processed source, one report,
   one draft. No geometry must be substituted with a fixture.
4. Interrupt with app switching, device lock, camera contention and a phone call.
   Confirm saved count/source status is honest. Reopen/recover after each stage;
   never merge the result with a different tracking frame without reviewed proof.
5. Force a finish callback beyond 20 seconds. If the callback arrives while the
   attempt remains open, confirm one raw archive and no duplicate draft. Confirm
   an old delegate cannot overwrite a later attempt. Missing return means unsaved.
6. Force low disk/protected-data denial/serious thermal state. A failed archive
   must keep the returned source on screen with Retry and explicit-discard Close.
   Terminate after source-file persistence but before SQLite registration; verify
   the explicit interrupted-source recovery action registers identical bytes.
7. Terminate after raw archive, during RoomBuilder, after processed archive,
   after normalization report, and after draft commit. Reopen without duplicating
   or losing acknowledged work. Confirm original context and incomplete warnings.
8. Correct a near-miss corner with explicit merge; reject an unsafe loop; create
   a valid room; add/move/delete an opening; rename; undo/redo; reopen. Reject an
   invalid edit without changing the prior revision. Force save failure and retry.
9. Switch 2D/3D repeatedly with selection/zoom context. Check real door/window
   wall-face voids, concave floor shape, semantic edges, dark mode, and no furniture
   or triangle diagonals. Record allocations and frame timing on the declared
   workloads in docs/07_VERIFICATION.md, including repeated open/close.
10. Test all actions with Dynamic Type, VoiceOver, display zoom, landscape and
    one hand. Primary controls need 44-point regions. Record failed gestures and
    total scan-plus-correction time, without calling synthetic data field evidence.
11. Export the chosen revision as JSON, bundle, GLB, SVG pages, PDF, PNG pages and
    all-floor local archive; verify bytes and identities
    using portable readers. Try malicious/oversized import and a provider file
    replaced during reading. Confirm no raw scan export or automatic cloud send.
12. Confirm protected file access fails while locked and sensitive layout content
    is covered in the application switcher. Check offline capture/edit/export.

13. Capture three connected rooms with a shared doorway and a repeated observation
    of the first room. Verify one shared coordinate frame, retained completed-room
    progress, StructureBuilder-compatible inputs, stable or explicitly mapped IDs,
    and no duplicate shared walls. Check actual output room-wall ID correspondence.
14. Close/reopen with an identified world map, observe true relocalization, and
    continue. Also fail relocalization and choose separate recovery without moving
    old rooms. Edit the saved draft during a retained capture and verify no overwrite.
    Test same-level floor noise and genuinely mixed levels: do not relax admission
    merely to make fixtures pass or silently flatten floors.
15. Try first/next/separate/relocalize capture after permission denial, unsupported
    hardware, background, lock and permission revocation in Settings. No path may
    instantiate/run a sensor session before current admission succeeds. Distinguish
    the system permission prompt's transient inactive state from actual background.
16. In a real corrected layout, place the viewpoint on a visible modeled floor,
    walk through accepted doors/passages, and stop at jambs, walls, windows and
    unknown/exterior boundaries. Verify no tap through an opaque wall. Exit/Reset
    remain reachable at largest Dynamic Type. Test cutaway independently from
    all-edges mode, concave room selection, ceilings and narrow/ambiguous portals.
17. Create and edit semantic areas, change a floor label/elevation, rehost an opening,
    split/merge rooms, save, kill/reopen and undo/redo. Test selected corner removal
    while its numeric field is active. A pending area sketch must not say Saved.
18. Interrupt a geometry save before acknowledgement and explicitly recover a new
    copy, preserving the last acknowledged layout. Preview old-history cleanup,
    change/pin a revision before confirming, then verify the stale preview is denied.
    Confirm a fresh batch, interrupt removal, and resume only the confirmed files.
    Original captures, current/first/undo/frozen/outbox/recovery files remain intact.
19. Verify device-owner authentication and the privacy shield over every modal,
    including Files export and capture. Retain unsaved editor state across lock,
    deny protected reads while locked, and do not restart the camera behind a shield.
20. Inspect the real emitted PDF and PNG at full size and print scale, including
    Unicode/long labels, multi-page label directory, all-floor packaging, orientation,
    true opening gaps, noncolor window styling and exact source revision identity.

Every case remains unexecuted until a named actual device/build record is supplied.
These device journeys do not authorize live integration, account provisioning,
distribution, client release, public sharing or competitive claims.
