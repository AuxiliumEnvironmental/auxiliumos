# Shared workspace implementation contract

Input revision: 41f000be361f0cf0c96963ffa1904b2295258769. The owner's October 9
architecture correction makes this the one maintained authoring workspace.
The prior Swift model and contracts remain the semantic reference.

`src/types.ts` is lead-owned. Workers request changes instead of editing it.

Core owns `src/core/` and `tests/core/`. Its index exports:
- `validateDocument(value: unknown): ValidationIssue[]`
- `requireValidDocument(value: unknown): SpatialDocument` (throws on any invalid input)
- `applyCommands(document, commands: EditCommand[], expectedRevision: number): {document: SpatialDocument; receipt: EditReceipt}`
- `wallPath(floor, wall): Point2[]`, `roomBoundary(floor, room): Point2[]`
- `buildScene(document, floorID): GraphicScene`
- `WalkNavigation` constructor `(document, floorID, settings?: Partial<WalkSettings>)`,
  fields portals/restrictions/roomIDs, `start(roomID): WalkPosition`,
  `place(point): WalkPosition`, `move(position, target): WalkMove`.

Data owns `src/data/`, `tests/data/`. Its index exports:
- `SpatialWebStore` constructor `(namespace: string)`; async `list(): WorkspaceSummary[]`,
  `create(document): StoredWorkspace`, `open(documentID): StoredWorkspace`,
  `apply(documentID, expectedRevision, commands): StoredWorkspace`,
  `undo(documentID, expectedRevision): StoredWorkspace`,
  `redo(documentID, expectedRevision): StoredWorkspace`,
  `freeze(documentID, expectedRevision): FrozenRevision`, `close(): void`.
- `importDocument(bytes: Uint8Array, filename: string): Promise<SpatialDocument>`
- `exportRevision(frozen: FrozenRevision, format: ExportFormat, floorID?: string): Promise<ExportArtifact>`
  All exports bind the frozen revision, all-floor profiles preserve every floor.
  Raw Apple captures are retained by native storage, never silently reconstructed by web import.
- Additional durable outbox API may be designed inside data scope with disabled real transport.

UI owns `src/ui/`, `tests/ui/`. Exports `SpatialWorkspace` React component from
`src/ui/SpatialWorkspace.tsx` accepting `{context?: WorkspaceContext}`. Default
standalone namespace `auxilium-spatial-local-v1`. Use core/data entrypoints above.
Use `src/capture.ts` lead-owned bridge wrapper for native capture. It exports
`captureCapabilities(): Promise<{available:boolean;reason?:string}>` and
`captureRoom(): Promise<SpatialDocument>`; browser explicitly unsupported.
UI has real SVG editing and Three.js 3D built from GraphicScene. No second geometry.

Native owns `capacitor/` and `tests/capacitor/`. Integrates existing Swift capture
controller/pipeline into CAPPlugin Swift entrypoint with v1 envelope. Lead owns
web capacitor config/package and root shared controls. Register plugin as
`AuxiliumCapture` with methods `capabilities` and `capture`, returning
`{bridgeVersion:'1.0.0', available, reason?}` and
`{bridgeVersion:'1.0.0', document: SpatialDocument, nativeSourceRetained:true}`.
Capture must show actual native guided capture UI, await saved geometry, fail
closed on cancellation/errors and never return synthetic geometry as capture.

No worker touches OS, root configuration, schemas, control state or another
worker's tests. Evidence is new TypeScript testing, never recycled Swift acceptance.
