import type { ResolvedSurface, SpatialDocument, SurfaceDomain, SurfacePoint, SurfaceRef, Point3 } from '../types';
import { pathLength, pathPoint, roomBoundary, wallPath } from './geometry';
import { profileRing } from './cutoutGeometry';
/** F04 candidate adapter. Reconcile this lookup with F03's actual resolver at integration. */
export function uncutSurfaceDomain(document:SpatialDocument,ref:SurfaceRef):SurfaceDomain|null{
 const floor=document.floors.find(f=>f.id===ref.floorID);if(!floor)return null;
 if(ref.kind==='wall'){
  const wall=floor.walls.find(w=>w.id===ref.wallID);if(!wall)return null;const length=pathLength(wallPath(floor,wall));
  return{polygons:[{outer:[{u:0,v:0},{u:length,v:0},{u:length,v:wall.height},{u:0,v:wall.height}],holes:floor.openings.filter(o=>o.wallID===wall.id).map(o=>[{u:o.offset,v:o.bottom},{u:o.offset+o.width,v:o.bottom},{u:o.offset+o.width,v:o.bottom+o.height},{u:o.offset,v:o.bottom+o.height}])}]};
 }
 const room=floor.rooms.find(r=>r.id===ref.roomID);if(!room||ref.kind==='ceiling'&&room.ceiling?.id!==ref.ceilingID)return null;
 return{polygons:[{outer:roomBoundary(floor,room).map(p=>({u:p.x,v:p.z})),holes:[]}]};
}
export const samePhysicalSurface=(a:SurfaceRef,b:SurfaceRef)=>a.floorID===b.floorID&&a.kind===b.kind&&(a.kind==='wall'&&b.kind==='wall'?a.wallID===b.wallID:a.kind!=='wall'&&b.kind!=='wall'&&a.roomID===b.roomID&&(a.kind!=='ceiling'||b.kind==='ceiling'&&a.ceilingID===b.ceilingID));
export function resolveSurface(document:SpatialDocument,ref:SurfaceRef):ResolvedSurface|null{
 const domain=uncutSurfaceDomain(document,ref);if(!domain)return null;
 const floor=document.floors.find(f=>f.id===ref.floorID)!;
 const holes=(floor.cutouts??[]).filter(c=>samePhysicalSurface(c.surface,ref)).map(c=>profileRing(c.profile));
 // All first-scope cutouts are strictly inside the uncut host and disjoint.
 for(const hole of holes)domain.polygons[0].holes.push(hole);
 return{ref:structuredClone(ref),sourceRevision:document.revision,domain};
}
export function surfacePointToWorld(document:SpatialDocument,ref:SurfaceRef,p:SurfacePoint):Point3|null{
 const floor=document.floors.find(f=>f.id===ref.floorID);if(!floor||!uncutSurfaceDomain(document,ref))return null;
 if(ref.kind!=='wall'){const room=floor.rooms.find(r=>r.id===ref.roomID)!;return{x:p.u,z:p.v,y:floor.elevation+(ref.kind==='ceiling'?room.ceiling!.height:0)};}
 const wall=floor.walls.find(w=>w.id===ref.wallID)!,point=pathPoint(wallPath(floor,wall),p.u);return{...point,y:floor.elevation+wall.baseY+p.v};
}
export function wallRun(document:SpatialDocument,ref:Extract<SurfaceRef,{kind:'wall'}>,lo:number,hi:number):{tx:number;tz:number}|null{
 const f=document.floors.find(f=>f.id===ref.floorID),w=f?.walls.find(w=>w.id===ref.wallID);if(!f||!w)return null;
 const path=wallPath(f,w);let cursor=0,run:{tx:number;tz:number}|null=null;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(hi>cursor+1e-6&&lo<cursor+length-1e-6){const next={tx:(b.x-a.x)/length,tz:(b.z-a.z)/length};if(run&&Math.hypot(run.tx-next.tx,run.tz-next.tz)>1e-6)return null;run=next;}cursor+=length;}
 return lo>=-1e-6&&hi<=cursor+1e-6?run:null;
}
/** Maximal contiguous collinear run containing u. Rigid gestures cannot jump runs. */
export function wallRunBounds(document:SpatialDocument,ref:Extract<SurfaceRef,{kind:'wall'}>,u:number):{lo:number;hi:number;tx:number;tz:number}|null{
 const f=document.floors.find(f=>f.id===ref.floorID),w=f?.walls.find(w=>w.id===ref.wallID);if(!f||!w)return null;const path=wallPath(f,w),segments:{lo:number;hi:number;tx:number;tz:number}[]=[];let cursor=0;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z);segments.push({lo:cursor,hi:cursor+length,tx:(b.x-a.x)/length,tz:(b.z-a.z)/length});cursor+=length;}
 const index=segments.findIndex(s=>u>=s.lo-1e-6&&u<s.hi-1e-6);const i=index<0&&Math.abs(u-cursor)<1e-6?segments.length-1:index;if(i<0)return null;const basis=segments[i];let lo=i,hi=i;
 const same=(s:typeof basis)=>Math.hypot(s.tx-basis.tx,s.tz-basis.tz)<1e-6;while(lo>0&&same(segments[lo-1]))lo--;while(hi<segments.length-1&&same(segments[hi+1]))hi++;return{...basis,lo:segments[lo].lo,hi:segments[hi].hi};
}
