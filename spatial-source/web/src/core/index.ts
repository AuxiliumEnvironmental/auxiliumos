export { GeometryValidationError, validateDocument, requireValidDocument, validID } from './validation';
export { applyCommands, restorationMappings } from './editor';
export { EPSILON, wallPath, roomBoundary, pathLength, pathPoint, closedRoomBoundary, triangulate, signedArea, contains, strictlyContains, distance, interpolate } from './geometry';
export { buildScene, evaluateCutaway, displayCeilings, nearestSceneHit } from './scene';
export type { CutawayResult, SceneRayHit } from './scene';
export { WalkNavigation } from './navigation';
