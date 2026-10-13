# Shared geometry compatibility

Semantic reference: recovered Swift source at
`41f000be361f0cf0c96963ffa1904b2295258769`. This TypeScript implementation
adapts that source directly; historical Swift results are not evidence that the
TypeScript implementation passed.

| TypeScript path | Existing reference | Compatibility evidence |
| --- | --- | --- |
| `src/core/validation.ts` | geometry 1.0/1.1 schemas; `Validation.swift` | Strict shape, enum, bounds, references, topology, provenance and malicious-input tests |
| `src/core/geometry.ts` | `Geometry.swift`, `FloorGeometryIndex.swift`, `RoomBoundaryBuilder` | Shared node closure, concavity, deterministic triangulation and explicit ring ordering |
| `src/core/editor.ts` | `Editor.swift`, `RoomTopology.swift` | All 23 command variants, atomic rollback, dependent lineage, all join orientations, room split/merge, floor and area edits |
| `src/core/scene.ts` | `Scene.swift`, `Cutaway.swift` | Exact equality to existing Swift-produced `fixtures/scene.json`; real triangle holes, ray picking, view-dependent cutaway and display ceilings |
| `src/core/navigation.ts` | `Navigation.swift` | Door/passage admission, collision sweep, no tunneling, blocked windows/unknown connections, revision binding, rotation/elevation compatibility |

Deliberate admission differences:

- The strict 1.0 transport schema forbids an `areas` field even when empty. The
  Swift value validator alone allowed an empty array. Web admission follows the
  transport schema and requires explicit 1.1 for this field.
- Optional `parentRevision: null` is accepted by the existing JSON schemas and
  normalized to absence, matching Swift optional decoding.
- JavaScript sparse arrays and non-JSON objects are rejected before geometric
  evaluation. Published portal summaries are frozen against caller mutation.

Run from `web/`:

```
node --import tsx --test tests/core/*.test.ts
node_modules/.bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck src/core/index.ts tests/core/*.test.ts
```

October 9, 2026, Linux x86_64 / Node 24.19.0 / TypeScript 5.8.3:
92 new TypeScript cases passed; the targeted strict TypeScript compilation
exited 0. Exact input hashes are recorded in `evidence.json`.

The subsequent shared text-admission correction rejects unpaired UTF-16
surrogates before they can enter a durable draft. Valid astral characters retain
the unchanged 256-code-point budget. Six new tests cover all document/floor/room/
area text fields, atomic command rejection, durable reopening, and actual
geometry/exchange export followed by strict import. All 98 cases and strict
TypeScript compilation passed on the input snapshot recorded separately in
`evidence-unicode-and-provenance.json`; the earlier 92-case evidence is retained.

The scene builder now preflights exact output counts before allocating meshes.
The unchanged 1.0/1.1 scene contract admits at most 200,000 faces, 400,000
edges, and 1,000 vertices/triangles per face. Tests retain the existing 400,000
edge budget, reject oversized edge-only and combined output, and exercise the
1,000-vertex room boundary without lowering any product acceptance target.
The original 88-case input snapshot remains in `evidence-initial-core.json`.

Environment failures retained separately: `npx tsx --test ...` failed before
executing cases because its IPC pipe was denied (`EPERM`). Node's `--import tsx`
test runner works. One compiler attempt from the repository root selected the
unrelated npm `tsc@2.0.4` wrapper and exited 1; the explicit installed compiler
command above then passed. Neither failure was a geometry assertion failure.

This evidence establishes portable behavior only. It does not establish browser
interaction, touch performance, native Apple compilation, physical capture,
LiDAR alignment, device recovery, live OS integration, publication or release.
The implementation review here is the author's review, not an independent review.
