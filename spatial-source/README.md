# Auxilium Spatial implementation

This is the continued product source, with its original Swift capture engine and
recoverable Git history. One maintained React/TypeScript workspace provides 2D
correction, graphic 3D navigation, revisions, durable save/reopen, strict imports
and exact-version exports. It runs independently in a browser, as the full editor
in the existing AuxiliumOS development application, and inside the Capacitor
iPhone target. The versioned native bridge invokes retained RoomPlan/ARKit capture.
No browser sensor substitute, panoramic pipeline or second editor was introduced.

Both Apple app targets compiled and linked without signing using Xcode26.3 and
the iOS26.2 SDK at the exact input in `evidence/shared-workspace/APPLE_COMPILE.json`.
Later lifecycle and simulator results are recorded there separately. Physical
capture, installed-device recovery/privacy, native accessibility, performance and
release are **not accepted**. Compiled source is not an installed or tested iPhone.

Current source has fresh TypeScript geometry, persistence/security and actual
Chromium workflow tests. These include process termination/reopen, precise copy
provenance backups, undo and conflict recovery, real portal collision, cutaway,
tap movement, retained framing, 200% text and exact SVG/PDF/PNG/GLB outputs.
Each evidence file records its input hashes; older Swift and failed runs remain
separate. Read `evidence/shared-workspace/REQUIREMENTS.json` for all48 requirements
and the remaining gates. Do not reuse historical counts as new-platform evidence.

The existing protected development host serves `/spatial` and
`/spatial/standalone` at
https://id-preview--0b7bbfc6-627f-4ca0-9217-98f5b164b419.lovable.app.
Both use the same complete editor. Existing sign-in is required. OS project access
is not yet connected: drafts are explicitly personal synthetic browser work,
without fabricated project IDs, business writes or publication rights. Moldo and
companion work remain independent. Live publishing and TestFlight remain disabled.

Developer commands:

```sh
npm --prefix web ci
npm --prefix web run build
npm --prefix web test
npm --prefix web run dev
```

`web/` is the standalone source. `integration/package_os.py` exports its built
library into an existing authorized OS checkout with input/output hashes; it does
not replace the host. `capacitor/README.md` documents unsigned Apple compilation
and installed-host composition. `tests/native/DEVICE_ACCEPTANCE.md` retains the
physical test journeys. A local server is not a live development URL.

Start or resume with `START_HERE.md` and `RESUME.md`. The delivery archive's
top-level `RECOVERY.json` identifies its exact full commit and every source hash;
`recovery/repository.bundle` preserves history. Any dirty work is stored separately
under `uncommitted/`. No measurement accuracy or production-readiness claim is made.
