# Installed shared workspace

The app embeds the build from `web/`. It is not a second authoring application.
The Xcode target links the retained Swift capture controller, capture pipeline,
Apple surface adapter, device access gate and canonical packages by source path.
Existing native authoring remains preserved in source history and the old target;
it is not the authoring interface loaded by this target.

The developer build sequence from the repository root is:

```sh
npm --prefix web ci
npm --prefix web run build
python3 capacitor/prepare.py
bash capacitor/build_unsigned.sh
```

`prepare.py` copies the actual built application, adds a stricter installed-host
CSP, and records source/packaged asset hashes. It refuses missing builds, symlinks
and font binaries. `generate_project.py` deterministically regenerates the checked
in Xcode project. Capacitor SwiftPM is pinned exactly to 8.5.3, matching the web
runtime. Local Spatial packages and capture files are referenced, not forked.
Do not run `cap add` over this generated host.

Xcode 26 or newer on an authorized Mac is required for Capacitor 8. The unsigned
device SDK build does not need a paid Apple Developer membership or signing
credentials. Installing on a physical iPhone needs separately configured signing
and actual device access. No signing or TestFlight action is performed here.

Apple-hosted synthetic policy and retained-source tests can run with:

```sh
xcodebuild test -project capacitor/ios/AuxiliumSpatial.xcodeproj \
  -scheme AuxiliumSpatial -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath capacitor/.build-simulator CODE_SIGNING_ALLOWED=NO
```

Choose an actually installed simulator from `xcrun simctl list devices available`.
These tests do not invoke LiDAR and do not establish physical capture acceptance.

`AuxiliumCapture` v1 exposes `capabilities` and `capture`. Both accept only
`{bridgeVersion: "1.0.0"}`. The capture screen uses the actual RoomPlan controller,
retained ARSession, compatible StructureBuilder inputs and explicit recovery.
Completion returns a persisted canonical document after verifying raw retention.
A process death before the web import leaves the native capture available in the
capture recovery chooser. The shared workspace must treat that output as a
revisioned input and preserve any existing corrections when adopting it.

`AuxiliumFiles.saveExport` v1 accepts `bridgeVersion`, a safe ASCII basename,
`mimeType` and base64 bytes. Only JSON, ZIP, SVG, GLB, PDF and PNG are admitted,
up to 32 MiB. It opens an explicit native share sheet, protects staging files and
cleans them after completion, cancellation or app backgrounding. Cancellation
returns `completed: false`. The bridge does not upload, grant publication rights,
or claim a destination completed when the activity did not acknowledge success.

Native bridge messages must originate from the main frame at
`capacitor://localhost`. Remote URLs, iframes, local file proxies, arbitrary native
HTTP and hot-update built-ins are blocked. The app loads bundle assets only.
The existing device-owner lock shields the entire workspace and capture UI.
Native raw archives stay under `NSFileProtectionComplete` and are excluded from
cloud backup. Web persistence retention, touch interaction, permission prompts,
interruption recovery and performance still require actual installed-device tests.
