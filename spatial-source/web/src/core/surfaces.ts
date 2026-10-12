import type { Point3, ResolvedSurface, SpatialDocument, SurfaceDomain, SurfacePoint, SurfaceRef } from '../types';
import { distance, pathLength, roomBoundary, wallPath } from './geometry';

/**
 * Baseline-compatible implementation of SURFACE_INTERFACE.md revision 2.
 * F03 owns ceiling initialization/editing; this resolver NEVER infers a ceiling.
 * Integration must retain F04's final material-domain subtraction here. F05 has
 * no cutout reconstruction or cosmetic-hole fallback.
 */
export function surfaceKey(ref: SurfaceRef): string {
  return ref.kind === 'wall' ? `${ref.floorID}:wall:${ref.wallID}:${ref.side}` : ref.kind === 'ceiling' ? `${ref.floorID}:ceiling:${ref.roomID}:${ref.ceilingID}` : `${ref.floorID}:floor:${ref.roomID}`;
}
export function resolveSurface(document: SpatialDocument, ref: SurfaceRef): ResolvedSurface | null {
  const floor = document.floors.find(f => f.id === ref.floorID);
  if (!floor) return null;
  let domain: SurfaceDomain;
  if (ref.kind === 'wall') {
    const wall = floor.walls.find(w => w.id === ref.wallID);
    if (!wall) return null;
    const length = pathLength(wallPath(floor, wall));
    const holes = floor.openings.filter(o => o.wallID === wall.id);
    if (holes.length > 500) throw new Error('This surface exceeds the affected-area domain capacity.');
    const ring = (u: number, v: number, w: number, h: number) => [{u,v},{u:u+w,v},{u:u+w,v:v+h},{u,v:v+h}];
    domain = { polygons: [{ outer: ring(0,0,length,wall.height), holes: holes.map(o => ring(o.offset,o.bottom,o.width,o.height)) }] };
  } else {
    const room = floor.rooms.find(r => r.id === ref.roomID);
    if (!room || ref.kind === 'ceiling' && (!room.ceiling || room.ceiling.id !== ref.ceilingID)) return null;
    domain = { polygons: [{ outer: roomBoundary(floor, room).map(p => ({u:p.x,v:p.z})), holes: [] }] };
  }
  return { ref: structuredClone(ref), sourceRevision: document.revision, domain };
}
export function surfacePointToWorld(document: SpatialDocument, ref: SurfaceRef, point: SurfacePoint): Point3 | null {
  if (![point.u,point.v].every(Number.isFinite)) return null;
  const floor=document.floors.find(f=>f.id===ref.floorID);if(!floor)return null;
  if(ref.kind!=='wall') {
    const room=floor.rooms.find(r=>r.id===ref.roomID);if(!room)return null;
    if(ref.kind==='ceiling'&&(!room.ceiling||room.ceiling.id!==ref.ceilingID))return null;
    return{x:point.u,y:floor.elevation+(ref.kind==='ceiling'?room.ceiling!.height:0),z:point.v};
  }
  const wall=floor.walls.find(w=>w.id===ref.wallID);if(!wall)return null;
  const path=wallPath(floor,wall);let start=0;
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],length=distance(a,b),end=start+length;
    // At an exact vertex the outgoing segment owns the chart, except at the end.
    if(point.u>=start-1e-8&&(point.u<end-1e-8||i===path.length-1&&point.u<=end+1e-8)) {
      const t=(point.u-start)/length;return{x:a.x+(b.x-a.x)*t,y:floor.elevation+wall.baseY+point.v,z:a.z+(b.z-a.z)*t};
    }start=end;
  }return null;
}
export function surfaceNormal(document: SpatialDocument, ref: SurfaceRef, u=0): Point3 | null {
  if(ref.kind!=='wall')return{x:0,y:ref.kind==='ceiling'?-1:1,z:0};
  const floor=document.floors.find(f=>f.id===ref.floorID),wall=floor?.walls.find(w=>w.id===ref.wallID);if(!floor||!wall)return null;
  const path=wallPath(floor,wall);let start=0;
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=distance(a,b),end=start+length;if(u<end-1e-8||i===path.length-1){const sign=ref.side==='positive'?1:-1;return{x:-(b.z-a.z)/length*sign,y:0,z:(b.x-a.x)/length*sign};}start=end;}return null;
}
