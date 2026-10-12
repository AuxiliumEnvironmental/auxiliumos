import type { Cutout, SurfacePoint } from '../types';
export function moveCutout(cutout:Cutout,start:SurfacePoint,end:SurfacePoint):Cutout{const value=structuredClone(cutout);value.profile.center.u+=end.u-start.u;value.profile.center.v+=end.v-start.v;return value;}
export function resizeCutout(cutout:Cutout,du:number,dv:number):Cutout{const value=structuredClone(cutout);if(value.profile.shape==='circle')value.profile.diameter+=du*2;else{const c=Math.cos(value.profile.rotation),s=Math.sin(value.profile.rotation);value.profile.width+=(c*du+s*dv)*2;value.profile.height+=(-s*du+c*dv)*2;}return value;}
import type { Point3, SpatialDocument, SurfaceRef } from '../types';
import { wallPath } from '../core/geometry';
/** Initial explicit host projection only; it never chooses another host. */
export function worldToSurfaceChart(document:SpatialDocument,ref:SurfaceRef,point:Point3):SurfacePoint{
 if(ref.kind!=='wall')return{u:point.x,v:point.z};const f=document.floors.find(f=>f.id===ref.floorID)!,w=f.walls.find(w=>w.id===ref.wallID);if(!w)throw new Error('Selected host wall is unavailable');const path=wallPath(f,w);let best=Infinity,u=0,cursor=0;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(length*length))),d=Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz);if(d<best){best=d;u=cursor+t*length;}cursor+=length;}
 return{u,v:point.y-f.elevation-w.baseY};
}

import { wallRunBounds } from '../core/surfaces';
export function cutoutDragChart(document:SpatialDocument,cutout:Cutout,start:Point3,end:Point3):{start:SurfacePoint;end:SurfacePoint}{
 if(cutout.surface.kind!=='wall')return{start:{u:start.x,v:start.z},end:{u:end.x,v:end.z}};
 const run=wallRunBounds(document,cutout.surface,cutout.profile.center.u);if(!run)throw new Error('Cutout host run is unavailable');const du=(end.x-start.x)*run.tx+(end.z-start.z)*run.tz,dv=end.y-start.y;
 return{start:{u:0,v:0},end:{u:du,v:dv}};
}
export function assertCutoutDragRun(document:SpatialDocument,original:Cutout,candidate:Cutout):void{
 if(original.surface.kind!=='wall')return;const run=wallRunBounds(document,original.surface,original.profile.center.u),ring=profileRing(candidate.profile);if(!run||ring.some(p=>p.u<run.lo+1e-6||p.u>run.hi-1e-6))throw new Error('Rigid cutout drag must stay on its original straight wall run');
}
import { profileRing } from '../core/cutoutGeometry';
