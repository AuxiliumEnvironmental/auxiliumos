# Independent Spatial delivery

Owner-selected address: `spatialauxilium.io`. The full editor is maintained in
this repository's `web/`. Preserve its mobile 2D/3D appearance, geometry, native
bridge and history. Do not clone the whole OS into a new Lovable project or ask
another generator to recreate the editor from a description.

The standalone browser entry mounts `SpatialWorkspace` directly. OS embedding
mounts the same component through `SpatialPage.tsx` with authenticated context.
Capacitor packages the same workspace and adds the native capture bridge. Native
source, raw captures, accounts and business records are not copied into a browser
deployment merely to give it its own address.

## Actual build and verification

After preserving and committing current web changes, the developer runs:

```bash
python3 integration/package_standalone.py /absolute/new/release-directory
python3 integration/package_standalone.py /absolute/new/release-directory --verify
```

The command extracts committed web source into a temporary directory, installs
the exact lockfile using `npm ci --prefer-offline` (cached packages first), runs the
real TypeScript/Vite build, and produces:

- `site/`: the full application and offline assets to serve at the new host.
- `source/web/`: the matching source, tests and lockfile for the hosting build.
- `RELEASE.json`: input and output hashes, full commit, environment and explicit
  prepared/not-deployed status. This file is not publisher authorization.
- `site/spatial-release.json`: exact source and aggregate input identity for
  verifying which build a host actually serves. It contains no credentials.

The command rejects uncommitted web changes, existing output directories,
environment files and symlinks. It never reuses an old `dist` directory or writes
to AuxiliumOS. Use `--offline` when dependency downloads are unavailable. A missing
cache entry then fails explicitly, never selecting different versions. Release verification rejects missing, modified or
unlisted files and recomputes the input identity.

## Dedicated Lovable project

The owner supplied the separate SpatialAuxilium project
`addeb89f-cdf1-4688-9157-b208793ffb8e`. Its starter commit
`0436dbd7d21fb3f7fd1368bd8e20194b97157c11` is preserved in the transfer evidence.
The actual implementation was imported under `spatial-source/`; the host root
route mounts its full `SpatialWorkspace`. Root readback verified all 41 original
runtime files against canonical commit `1fede19ded45b3ce2b2919d47759a43134533a69`.
The 831-file package identity and host build results are separately attributed
in `evidence/lovable-transfer-2026-10-10/`. Later manual improvements replace
only matching canonical source; preserve all independent host and newer work.
Do not generate another editor or copy the OS application.

Lovable's Git integration creates a project repository and supports two-way sync
on its active branch. Creating that remote repository is a separate owner action
or explicit authorization; this build has not created one. Once a permitted
source-transfer path is verified, the developer owns import, build diagnostics,
browser checks and comparison of the served revision. Keep publication disabled
until the actual access policy is implemented and verified. Connect
`spatialauxilium.io` to that dedicated project after those checks.

Use one canonical source history. Improvements made through Lovable must be
reconciled into the same maintained workspace before regenerating the OS module
and native assets. An independently hosted application is not a second geometry
editor, and a source attachment alone is not proof of successful installation.

References checked October 10, 2026: Lovable Git sync
<https://docs.lovable.dev/integrations/github>, custom domains
<https://docs.lovable.dev/features/custom-domain>, and published access
<https://docs.lovable.dev/features/publish>.

## Hosting and account boundary

The independent project now exists because the owner created and supplied it.
The actual preview is
`https://id-preview--addeb89f-cdf1-4688-9157-b208793ffb8e.lovable.app/`.
It remains unpublished; no DNS record was changed by this transfer. The selected
Lovable workspace reports Pro and owner access.
Lovable supports a custom domain on this plan, but its built-in restricted
published website audience requires Business/Enterprise. This does not prevent
an app from implementing its own verified sign-in. Do not purchase an upgrade,
invent a browser-only password gate, or publish this local standalone build as
an access-controlled app. Select the authorized protected hosting or real app
authentication mechanism before connecting production DNS. Host access and
authorized OS project exchange are separate contracts.

The standalone workspace is local-first and has no verified home-route sign-in
gate. A pre-existing MCP setup task unexpectedly resumed during initial import
and enabled Cloud/OAuth despite the source-only transfer instruction. Its source
was preserved and the owner informed; secrets were excluded from evidence. The
MCP app-info response is constant; layouts do not use that backend or a live
publisher. Do not expand or claim acceptance of that setup. Host-owned raw error
forwarding was removed, but provider-injected instrumentation remains unverified.
A signed-in OS session is not automatically available at the new origin. Do not copy a
session token or put a reusable credential into a launch URL. Opening the new
address must not be described as native scanning or automatic cloud sync.

The host has a separate static offline entry importing the same workspace. Its
owned service worker caches only hash-verified code assets, refuses foreign
workers and waits for existing tabs to close before an update takes over. Tests
of its local production build are distinct from the development preview, where
offline registration is intentionally unavailable. Hosted production delivery,
Safari and physical-device offline acceptance remain open. See the preserved
initial failures and corrected host evidence; do not rerun unchanged offline
journeys just because the source transfer is refreshed.

## Preserve the OS and saved work

Preserve the existing OS route and its authenticated adapter until the reviewed
cutover. Compare actual current OS source first. Do not remove OS features or
replace the entire application to complete this separation. The earlier GitHub
write failure has no retained cause and must not be bypassed or called a domain
problem.

The owner's latest direction keeps the OS tool-selection UI only for now. Treat
the current embedded editor as a preserved prior integration, not the development
destination. Its exact observed source is backed up under
`evidence/os-separation-2026-10-10/`; this is a recovery snapshot, not another
maintained editor. At cutover, change only the Spatial route adapter and remove
the obsolete generated assets after checking references and protecting existing
drafts. Preserve the selector, auth gates and all unrelated OS changes. A later
full-workspace integration consumes the same verified standalone source through
the scoped contract; a launcher is only an interim entry, not final acceptance.

Browser storage is isolated by origin. Existing OS drafts remain in their current
profile namespace at the old origin. Explicit local-document export/import can
transfer a chosen saved layout; it does not transfer OS access rights or native
raw captures. Keep the original saved work and backup until identity/revision and
reopen checks succeed at the new host. Do not silently clear storage or promise
that undo history and every frozen revision migrate in a single layout export.

## Activation evidence still required

Actual hosting must prove the expected served source identity, restricted entry,
create/edit/undo/save/reopen, import/export and mobile layout, including refresh
and a return from another app. Preserve useful fixtures without calling them a
physical scan. Apple installation, RoomPlan/connected-room/relocalization and
native-device recovery remain separate gates. DNS and a successful web build
cannot satisfy them. The developer owns compiler diagnostics and deployment
integration; the owner supplies only genuinely missing account or device access.

## Latest exact refresh

The current dedicated preview is at host commit
`b81e824a9c15a247ff20c7323b2475efdcd94240`, using canonical runtime source
`5def609090f12b96f76012689b345ebfa9e4ef94`. All 65 transferred files match exactly.
Connected rooms, direct opening placement, group editing and interrupted drawing
recovery are available in that preview. The strict host return check is enabled.
Read `evidence/transfer-ready-2026-10-10/FINAL_HOST_COMPARISON.json` for attribution.
Production access/domain, OS cutover/project exchange and physical capture remain
unfinished; no production publication occurred.
