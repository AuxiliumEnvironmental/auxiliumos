import type { AffectedArea, AffectedKind, EditCommand, EditFence, Point2, Point3, SpatialDocument, SurfacePoint, SurfacePolygon, SurfaceRef } from '../types';
import { asDomain, domainBounds, rectangle, transformDomain } from '../core/affectedAreaGeometry';
import { distance, pathLength, wallPath } from '../core/geometry';
import { surfaceNormal, surfacePointToWorld } from '../core/surfaces';
import { projectToWall } from './openingManipulation';

export type AffectedFence = EditFence;
export interface AffectedTool { surface:SurfaceRef; kind:AffectedKind; mode:'draw'|'move'|'resize'; areaID?:string; verticalRange?:readonly [number,number]; token:string }
export type AffectedHandle = 'body' | 'start' | 'end' | 0 | 1 | 2 | 3;
export type AffectedCommit = (commands:EditCommand[],fence:AffectedFence)=>Promise<boolean>;
export interface AffectedDrag { start:SurfacePoint; original:SurfacePolygon|null; handle:AffectedHandle; planWall:boolean; verticalRange?:readonly [number,number]; fence:AffectedFence; pointerID:number }
export function affectedFenceMatches(a:AffectedFence,b:AffectedFence):boolean{return a.documentID===b.documentID&&a.expectedRevision===b.expectedRevision&&a.contextKey===b.contextKey&&a.generation===b.generation;}
export function currentAffectedFootprint(area:AffectedArea):{surface:SurfaceRef;footprint:SurfacePolygon}|null{
  const a=area.attachments[0];if(area.attachments.length!==1||!a?.surface||!a.transform||a.outcome==='unresolved')return null;
  return{surface:a.surface,footprint:transformDomain(asDomain(area.footprint),a.transform).polygons[0]};
}
export function affectedCorners(p:SurfacePolygon):SurfacePoint[]{const b=domainBounds(asDomain(p));return[{u:b.minU,v:b.minV},{u:b.maxU,v:b.minV},{u:b.maxU,v:b.maxV},{u:b.minU,v:b.maxV}];}
/** Preview only: original coordinates and finger grab offset are never rebased. */
export function affectedDragPreview(d: Pick<AffectedDrag,'start'|'original'|'handle'|'planWall'|'verticalRange'>,point:SurfacePoint):SurfacePolygon|null{
  if(![point.u,point.v].every(Number.isFinite))return null;
  if(!d.original){const range=d.planWall?d.verticalRange:undefined;if(d.planWall&&(!range||range[1]<=range[0]))return null;return rectangle(Math.min(d.start.u,point.u),range?range[0]:Math.min(d.start.v,point.v),Math.max(d.start.u,point.u),range?range[1]:Math.max(d.start.v,point.v));}
  const b=domainBounds(asDomain(d.original)),du=point.u-d.start.u,dv=d.planWall?0:point.v-d.start.v;
  if(d.handle==='body')return mapPolygon(d.original,p=>({u:p.u+du,v:p.v+dv}));
  let minU=b.minU,maxU=b.maxU,minV=b.minV,maxV=b.maxV;
  if(d.handle==='start'||d.handle===0||d.handle===3)minU+=du;else maxU+=du;
  if(!d.planWall&&typeof d.handle==='number'){if(d.handle<2)minV+=dv;else maxV+=dv;}
  if(maxU-minU<0.005||maxV-minV<0.005)return null;
  return mapPolygon(d.original,p=>({u:minU+(p.u-b.minU)*(maxU-minU)/(b.maxU-b.minU),v:d.planWall?p.v:minV+(p.v-b.minV)*(maxV-minV)/(b.maxV-b.minV)}));
}
function mapPolygon(p:SurfacePolygon,map:(p:SurfacePoint)=>SurfacePoint):SurfacePolygon{return{outer:p.outer.map(map),holes:p.holes.map(h=>h.map(map))};}
export function affectedCommand(tool:AffectedTool,footprint:SurfacePolygon):EditCommand|null{
  const b=domainBounds(asDomain(footprint));if(b.maxU-b.minU<0.005||b.maxV-b.minV<0.005)return null;
  return tool.areaID?{type:'reshapeAffectedArea',areaID:tool.areaID,surface:tool.surface,footprint}:{type:'recordAffectedArea',areaID:crypto.randomUUID(),kind:tool.kind,surface:tool.surface,footprint};
}
export function planSurfacePoint(document:SpatialDocument,ref:SurfaceRef,point:Point2,preferredU=0,lastPoint?:Point2):SurfacePoint|null{
  if(ref.kind!=='wall')return{u:point.x,v:point.z};
  const floor=document.floors.find(f=>f.id===ref.floorID),wall=floor?.walls.find(w=>w.id===ref.wallID);if(!floor||!wall)return null;
  const path=wallPath(floor,wall),along=projectToWall(path,point,preferredU),travel=lastPoint?distance(point,lastPoint)*2:Infinity;
  // A nearby remote limb of a bent wall may not capture a small finger adjustment.
  return{u:Math.max(Math.max(0,preferredU-travel),Math.min(Math.min(pathLength(path),preferredU+travel),along)),v:0};
}
export interface SurfaceRay { origin:Point3; direction:Point3 }
/** Frozen wall segment ownership; advance only to its contiguous neighbour. */
export function projectAffectedRay(document:SpatialDocument,ref:SurfaceRef,ray:SurfaceRay,preferredU=0):SurfacePoint|null{
  const floor=document.floors.find(f=>f.id===ref.floorID);if(!floor)return null;
  if(ref.kind!=='wall'){
    const room=floor.rooms.find(r=>r.id===ref.roomID);if(!room||ref.kind==='ceiling'&&(!room.ceiling||room.ceiling.id!==ref.ceilingID))return null;
    if(Math.abs(ray.direction.y)<1e-6)return null;const t=(floor.elevation+(ref.kind==='ceiling'?room.ceiling!.height:0)-ray.origin.y)/ray.direction.y;
    return t>0?{u:ray.origin.x+ray.direction.x*t,v:ray.origin.z+ray.direction.z*t}:null;
  }
  const wall=floor.walls.find(w=>w.id===ref.wallID);if(!wall)return null;const path=wallPath(floor,wall),starts=[0];for(let i=1;i<path.length;i++)starts.push(starts[i-1]+distance(path[i-1],path[i]));
  let index=starts.findIndex((v,i)=>i<starts.length-1&&preferredU>=v-1e-8&&preferredU<starts[i+1]-1e-8);if(index<0)index=path.length-2;
  const seen=new Set<number>();
  while(index>=0&&index<path.length-1&&!seen.has(index)){
    seen.add(index);const a=path[index],b=path[index+1],length=distance(a,b),tx=(b.x-a.x)/length,tz=(b.z-a.z)/length,den=-tz*ray.direction.x+tx*ray.direction.z;
    if(Math.abs(den)<1e-6)return null;const t=(-tz*(a.x-ray.origin.x)+tx*(a.z-ray.origin.z))/den;if(t<=0)return null;
    const x=ray.origin.x+ray.direction.x*t,z=ray.origin.z+ray.direction.z*t,u=starts[index]+(x-a.x)*tx+(z-a.z)*tz,v=ray.origin.y+ray.direction.y*t-floor.elevation-wall.baseY;
    if(u<starts[index]-1e-7&&index>0){index--;continue;}if(u>starts[index+1]+1e-7&&index<path.length-2){index++;continue;}
    return [u,v].every(Number.isFinite)?{u:Math.max(0,Math.min(starts.at(-1)!,u)),v}:null;
  }return null;
}
/** A cheap outline only. Committed clipping/topology is never rebuilt on pointermove. */
export function affectedOutline(document:SpatialDocument,ref:SurfaceRef,polygon:SurfacePolygon):Point3[]{
  let cuts:number[]=[];if(ref.kind==='wall'){const floor=document.floors.find(f=>f.id===ref.floorID)!,wall=floor.walls.find(w=>w.id===ref.wallID)!;const path=wallPath(floor,wall);let u=0;cuts=path.slice(1,-1).map((p,i)=>(u+=distance(path[i],p)));}
  const output:Point3[]=[];
  for(const ring of [polygon.outer,...polygon.holes])for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],times=[0,1,...cuts.filter(u=>u>Math.min(a.u,b.u)&&u<Math.max(a.u,b.u)).map(u=>(u-a.u)/(b.u-a.u))].sort((a,b)=>a-b);
    for(let j=1;j<times.length;j++){const at=(t:number)=>({u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t}),left=at(times[j-1]),right=at(times[j]),normal=surfaceNormal(document,ref,(left.u+right.u)/2),p=surfacePointToWorld(document,ref,left),q=surfacePointToWorld(document,ref,right);if(!normal||!p||!q)continue;for(const point of [p,q]){if(output.length>=20000)throw new Error('Affected outline exceeds the bounded preview capacity. Use exact numeric adjustment.');output.push({x:point.x+normal.x*.002,y:point.y+normal.y*.002,z:point.z+normal.z*.002});}}
  }return output;
}
/** One pending frame, explicit cancel, and exact terminal sampling. No storage. */
export class AffectedPreviewQueue<T>{
  private frame:number|null=null;private latest:T|null=null;
  constructor(private publish:(sample:T)=>void,private request:(callback:()=>void)=>number,private cancelFrame:(id:number)=>void){}
  move(sample:T):void{this.latest=sample;if(this.frame===null)this.frame=this.request(()=>{this.frame=null;const value=this.latest;this.latest=null;if(value!==null)this.publish(value);});}
  release(sample:T):void{this.cancel();this.publish(sample);}
  cancel():void{if(this.frame!==null)this.cancelFrame(this.frame);this.frame=null;this.latest=null;}
}
