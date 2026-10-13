// Transport shapes are the existing Swift/JSON geometry contracts, not a new graph.
export interface Point2 { x: number; z: number }
export interface Point3 { x: number; y: number; z: number }
export type Origin = 'captured' | 'edited' | 'inferred' | 'synthetic';
export type ReviewState = 'needsReview' | 'reviewed';
export type Confidence = 'low' | 'medium' | 'high' | 'unknown';
export type HeightBasis = 'captured' | 'assumed' | 'edited' | 'synthetic';
export type OpeningKind = 'door' | 'window' | 'passage';
export interface Node { id: string; point: Point2 }
export interface Provenance { origin: Origin; sourceIDs: string[]; classificationConfidence: Confidence }
export interface Wall { id: string; nodeIDs: string[]; baseY: number; height: number; heightBasis: HeightBasis; provenance: Provenance }
export type OpeningStyleID = 'door_single' | 'door_double' | 'door_sliding' | 'door_pocket' | 'door_bifold' | 'doorway_open' | 'window';
export interface OpeningStyle { id: OpeningStyleID; end?: 'start' | 'end'; side?: 'positive' | 'negative'; provenance: Provenance }
export interface Opening { id: string; wallID: string; kind: OpeningKind; offset: number; width: number; bottom: number; height: number; provenance: Provenance; style?: OpeningStyle }
export interface WallReference { wallID: string; reversed: boolean }
export interface Ceiling { id: string; height: number; heightBasis: HeightBasis; provenance: Provenance }
export interface CeilingTarget { floorID: string; roomID: string }
export interface CeilingHeightEdit { type: 'setCeilingHeights'; targets: CeilingTarget[]; mode: 'absolute' | 'delta'; value: number }
export interface EditFence { documentID: string; expectedRevision: number; contextKey: string; generation: number }
export type SurfaceRef = { floorID: string; kind: 'wall'; wallID: string; side: 'positive' | 'negative' } | { floorID: string; kind: 'floor'; roomID: string } | { floorID: string; kind: 'ceiling'; roomID: string; ceilingID: string };
export interface SurfacePoint { u: number; v: number }
export interface SurfacePolygon { outer: SurfacePoint[]; holes: SurfacePoint[][] }
export interface SurfaceDomain { polygons: SurfacePolygon[] }
export type SurfaceTransform = readonly [number, number, number, number, number, number];
export interface ResolvedSurface { ref: SurfaceRef; sourceRevision: number; domain: SurfaceDomain }
export interface SurfaceRemap { from: SurfaceRef; to: SurfaceRef | null; sourceDomain: SurfaceDomain; transform: SurfaceTransform | null; outcome: 'exact' | 'clipped_needs_review' | 'unresolved' }
export interface SurfaceRemapReceipt { sourceRevision: number; resultingRevision: number; mappings: SurfaceRemap[] }
export interface Room { id: string; label: string; boundary: WallReference[]; ceiling?: Ceiling | null }
export interface SemanticArea { id: string; label: string; polygon: Point2[]; provenance: Provenance }
export interface Floor { id: string; label: string; elevation: number; nodes: Node[]; walls: Wall[]; openings: Opening[]; rooms: Room[]; areas?: SemanticArea[] }
export interface SpatialDocument { schemaVersion: '1.0.0' | '1.1.0' | '1.2.0' | '1.3.0'; documentID: string; revision: number; parentRevision?: number; title: string; coordinateSystem: 'meters_y_up_right_handed'; measurementStatus: 'unverified'; reviewState: ReviewState; floors: Floor[] }
export interface ValidationIssue { code: string; path: string; message: string }
export interface SceneFace { objectID: string; role: string; vertices: Point3[]; triangles: number[][] }
export interface SceneEdge { objectID: string; role: string; a: Point3; b: Point3 }
export interface GraphicScene { schemaVersion: string; documentID: string; revision: number; floorID: string; faces: SceneFace[]; edges: SceneEdge[] }
export interface GeometryIDMapping { floorID: string; objectKind: string; sourceID: string; resultingIDs: string[]; requiresOverlayReview: boolean }
export interface EditReceipt { sourceRevision: number; resultingRevision: number; mappings: GeometryIDMapping[]; surfaceRemaps?: SurfaceRemapReceipt }
type OnFloor = { floorID: string };
export type EditCommand =
  | CeilingHeightEdit
  | ({ type: 'moveNode'; nodeID: string; point: Point2 } & OnFloor)
  | ({ type: 'moveWall'; wallID: string; translation: Point2 } & OnFloor)
  | ({ type: 'addWall'; wall: Wall; newNodes: Node[] } & OnFloor)
  | ({ type: 'deleteWall'; wallID: string } & OnFloor)
  | ({ type: 'splitWall'; wallID: string; offset: number; newWallID: string; newNodeID?: string } & OnFloor)
  | ({ type: 'joinWalls'; firstWallID: string; secondWallID: string } & OnFloor)
  | ({ type: 'mergeNodes'; sourceNodeID: string; targetNodeID: string } & OnFloor)
  | ({ type: 'disconnectNode'; wallID: string; nodeID: string; newNodeID: string } & OnFloor)
  | ({ type: 'addOpening'; opening: Opening } & OnFloor)
  | ({ type: 'moveOpening'; openingID: string; offset: number } & OnFloor)
  | ({ type: 'updateOpening'; opening: Opening } & OnFloor)
  | ({ type: 'setOpeningStyle'; openingID: string; styleID: OpeningStyleID | null } & OnFloor)
  | ({ type: 'flipOpening'; openingID: string; axis: 'horizontal' | 'vertical' } & OnFloor)
  | ({ type: 'deleteOpening'; openingID: string } & OnFloor)
  | ({ type: 'renameRoom'; roomID: string; label: string } & OnFloor)
  | ({ type: 'addRoom'; room: Room } & OnFloor)
  | ({ type: 'setRoomBoundary'; roomID: string; boundary: WallReference[] } & OnFloor)
  | ({ type: 'deleteRoom'; roomID: string } & OnFloor)
  | ({ type: 'splitRoom'; roomID: string; dividerWallID: string; newRoomID: string; newLabel: string } & OnFloor)
  | ({ type: 'mergeRooms'; firstRoomID: string; secondRoomID: string; ceilingHeight?: number } & OnFloor)
  | ({ type: 'setArea'; area: SemanticArea } & OnFloor)
  | ({ type: 'deleteArea'; areaID: string } & OnFloor)
  | ({ type: 'updateFloor'; label: string; elevation: number } & OnFloor)
  | { type: 'addFloor'; floor: Floor }
  | ({ type: 'deleteFloor' } & OnFloor);
export interface WalkSettings { radius: number; eyeHeight: number; headClearance: number; maximumMove: number }
export interface WalkPosition { documentID: string; revision: number; floorID: string; roomID: string; point: Point2; eyeY: number }
export interface WalkPortal { openingID: string; wallID: string; roomIDs: string[]; a: Point2; b: Point2 }
export interface WalkRestriction { openingID: string; reason: string }
export type WalkStop = 'wall' | 'unknownBoundary' | 'ambiguousRooms' | 'invalidTarget' | 'requestTooLong';
export interface WalkMove { position: WalkPosition; requested: Point2; reachedTarget: boolean; stop?: WalkStop; blockingObjectID?: string; crossedPortalIDs: string[] }
export interface Selection { floorID: string; kind: 'node' | 'wall' | 'opening' | 'room' | 'ceiling' | 'area'; objectID: string }
// OS context is supplied only by its authenticated adapter after an authorized lookup.
export type WorkspaceContext = { mode: 'standalone'; namespace: string } | { mode: 'auxiliumos-personal'; namespace: string; profileID: string; assertAccess: () => Promise<void> } | { mode: 'auxiliumos'; namespace: string; profileID: string; accountID: string; projectID: string; projectLabel: string; assertAccess: () => Promise<void> };
export interface SourceIdentity { documentID: string; revision: number; sha256: string; reason: string }
// Optional provenance is local-backup metadata; it never changes graph identity.
// Both fields must be present together and verified before persistence or export.
export interface SourceProvenance { sourceIdentity?: SourceIdentity; sourceBytes?: Uint8Array }
export interface ImportedWorkspace extends SourceProvenance { document: SpatialDocument }
export interface FrozenRevision extends SourceProvenance { document: SpatialDocument; hash: string; bytes: Uint8Array; createdAt: string }
export interface StoredWorkspace { document: SpatialDocument; canUndo: boolean; canRedo: boolean; updatedAt: string; receipt?: EditReceipt; sourceIdentity?: SourceIdentity }
export interface WorkspaceSummary { documentID: string; title: string; revision: number; updatedAt: string }
export type ExportFormat = 'geometry' | 'scene' | 'svg' | 'pdf' | 'png' | 'glb' | 'bundle' | 'local-document';
export interface ExportArtifact { filename: string; mimeType: string; bytes: Uint8Array; revision: number; hash: string }

/** A gesture may commit only against the immutable authority/view/revision it began in. */
export interface OpeningEditFence { documentID: string; floorID: string; revision: number; generation: number; scope: string; view: string; openingID: string }
