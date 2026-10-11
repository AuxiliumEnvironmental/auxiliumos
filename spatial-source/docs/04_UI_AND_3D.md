# Visual and interaction specification

## Visual direction

Use a clean white/light canvas and an equally deliberate dark mode. Crisp dark
architectural edges, optional pale-blue surface fills, restrained selection color,
strong hierarchy and generous spacing. The user's reference is in
 design/user_visual_reference.jpeg. Its checkerboard is NOT a desired background.
No checkered transparency, photo textures, default coordinate grid, flashing
particles, noisy gradients, decorative charts, or automatic rotating model.

Design tokens in design/tokens.json are proposed implementation defaults, not an
assertion of an existing Auxilium brand standard. Use system typography and SF
Symbols where appropriate. Do not redistribute Apple or third-party font files.
Use clear US English: "Color", "Saved on device", "Needs review", "Not connected".

## Essential screens

1. Workspace list: local drafts, last edit, delivery state, New scan and Import.
   Name/location context is visible without exposing client detail unnecessarily.
2. Capture: near-full camera guidance, current room, Finish room, retained-room
   count, visible interruption/storage/thermal state, and an accessible Cancel.
3. Review/editor: canvas occupies most space; compact project/floor context above;
   segmented 2D / 3D; thumb-accessible bottom tools; contextual selection controls;
   issue list as a dismissible sheet, not a permanent narrow side panel on phones.
4. Publication/export: preview exact revision, destination, included artifacts,
   unresolved issues and status. Local export works without a cloud integration.
5. Recovery: retained work first, failed action second, then the most direct remedy.
   Never an endless spinner or an automatic restart that discards previous work.

Do not show every possible tool simultaneously. Default bottom actions: Select,
Draw, Opening, Label, Undo. Contextual actions show only after selection. Full
labels should be available to new users. iPad/desktop layouts can have a inspector
column, but phone layouts must not inherit a compressed desktop sidebar.

## 2D interactions

Tap selects; dragging a selected handle edits; two-finger pan/pinch navigates.
Prevent a pan from being mistaken for drawing. Provide a visible mode indicator.
Use screen-space hit targets larger than thin visual strokes, and a disambiguation
menu for overlapping elements. Keep the target visible above a finger when needed.
Optional magnification/crosshair assists must not jitter or hide the selection.

One-tap undo remains reachable. Actions have press feedback. No modal confirmation
for every harmless reversible edit; confirm destructive published-data operations.
Provide alternatives to precision dragging: choose object, then tap destination,
step controls, or an optional coordinate adjustment panel. Keyboard shortcuts are
additive, not necessary on iPhone. Long-press is not the only way to discover an action.

Keep context on 2D/3D switch. Selecting a room in 2D selects the same room in 3D.
Returning from a sheet restores selection, zoom and scroll position. A failed save
never empties the editor or discards its undoable draft.

## 3D model, not photorealism

Native RealityKit scene in non-AR viewing mode. Orthographic-like overview framing
or a mild perspective camera, plus orbit/pan/zoom. Build visual faces and semantic
architectural edges from the same graph used by 2D. Do not turn triangleFillMode
into the final wireframe: triangulation diagonals are not building edges.

Doors and windows need actual voids in wall faces. Drawing a window-colored
rectangle over an uncut wall is not sufficient. Use captured heights when valid;
missing heights are explicitly assumed display geometry. Avoid claiming measured
wall thickness. Floors are triangulated from accepted room boundaries, not a
whole-building convex hull. Keep ceilings off in overview; optional ceiling/cutaway
controls must keep interiors readable. Hide or fade obstructing near walls using
presentation state, not deleted geometry.

Default solid/light cutaway rendering prioritizes clarity. Optional translucent
blue faces match the reference style, but require correct blending and acceptable
sorting/depth behavior [A15]. X-ray mode is explicit; avoid all hidden rear edges
showing through by accident. Windows/doors keep identifiable styles even without
color. No furniture unless a future scope explicitly adds it.

## Move-through navigation

Provide an actual move-through mode, not only orbit. Begin from a selected room
or visible floor position. Tap-to-move is the default mobile action; optional
thumb controls or keyboard navigation can supplement it. Camera movement remains
within the modeled walkable floor and accepted door/passage portals. Windows
are not portals. Stop at unknown/disconnected areas. No invisible teleport to
unmodeled spaces and no forced stairs/multi-floor connection.

Use a modest collision radius and eye height as display settings, never as code
compliance/egress assertions. No head bob. Respect Reduce Motion; allow immediate
room jumps with clear destinations instead of animated travel. Provide Reset view
and Exit walk mode at all times. Orientation indicators must not imply GPS north.

## Accessibility and precision

At least 44 x 44 point primary touch regions [A11], readable type, Dynamic Type,
VoiceOver descriptions, logical focus order, noncolor status and adequate contrast.
Canvas content needs an accessible object/room list and actionable selection path.
Test small phones, display zoom, portrait/landscape, dark mode, large text, keyboard
appearance, gloves/one-handed field use, and VoiceOver. No clipped primary controls.

## Fluency and rendering lifecycle

Local feedback first; compute expensive topology after gesture completion. Keep
selection/highlight overlays cheap. Batch/coalesce geometry scene updates and
cancel stale jobs. Do not rebuild a complete scene on every SwiftUI body refresh.
Retain/reuse stable entities and release old models, subscriptions and buffers.
While a model is idle, avoid needless custom update loops; pause inactive views.
Changing preview quality must not degrade stored geometry.

## Design acceptance

Record actual device journeys and screenshots from the built app, not mockups
labeled as working UI. Compare task completion, correction time and failed gestures
with a consistent starting file. Polish means legible, responsive and recoverable,
not merely attractive. The tokens and this document are requirements to implement;
they do not establish that a beautiful finished UI exists in this ZIP.
