import type { CutoutProfile, SurfaceDomain, SurfacePoint, SurfacePolygon } from '../types';
import { intersects, strictlyContains } from './geometry';
export const CIRCLE_SEGMENTS=48;
export const chartPoint=(p:SurfacePoint)=>({x:p.u,z:p.v});
/** Shared deterministic inscribed 48-gon: maximum radial error r*(1-cos(pi/48)). */
export function profileRing(profile:CutoutProfile):SurfacePoint[]{
 const {u,v}=profile.center;
 if(profile.shape==='circle')return Array.from({length:CIRCLE_SEGMENTS},(_,i)=>({u:u+profile.diameter/2*Math.cos(i*2*Math.PI/CIRCLE_SEGMENTS),v:v+profile.diameter/2*Math.sin(i*2*Math.PI/CIRCLE_SEGMENTS)}));
 const c=Math.cos(profile.rotation),s=Math.sin(profile.rotation);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({u:u+c*x*profile.width/2-s*y*profile.height/2,v:v+s*x*profile.width/2+c*y*profile.height/2}));
}
export function ringsTouch(a:SurfacePoint[],b:SurfacePoint[]):boolean{
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(intersects(chartPoint(a[i]),chartPoint(a[(i+1)%a.length]),chartPoint(b[j]),chartPoint(b[(j+1)%b.length])))return true;
 return strictlyContains(chartPoint(a[0]),b.map(chartPoint))||strictlyContains(chartPoint(b[0]),a.map(chartPoint));
}
export function ringInside(ring:SurfacePoint[],polygon:SurfacePolygon):boolean{
 if(!ring.every(p=>strictlyContains(chartPoint(p),polygon.outer.map(chartPoint))))return false;
 for(let i=0;i<ring.length;i++)for(let j=0;j<polygon.outer.length;j++)if(intersects(chartPoint(ring[i]),chartPoint(ring[(i+1)%ring.length]),chartPoint(polygon.outer[j]),chartPoint(polygon.outer[(j+1)%polygon.outer.length])))return false;
 return !polygon.holes.some(h=>ringsTouch(ring,h));
}
/** Vertical chart decomposition handles concavity, boundary openings and true holes.
 * Each emitted trapezoid stays inside one slab, avoiding diagonal hole filling. */
export function materialPolygons(domain:SurfaceDomain,breaks:number[]=[]):SurfacePoint[][]{
 const rings=domain.polygons.flatMap(p=>[p.outer,...p.holes]),edgeCount=rings.reduce((s,r)=>s+r.length,0);
 const xs=[...new Set([...breaks,...rings.flatMap(r=>r.map(p=>p.u))])].sort((a,b)=>a-b);
 if(edgeCount>16000||xs.length*edgeCount>2_000_000)throw new Error('Surface subtraction exceeds the bounded geometry work limit');
 const result:SurfacePoint[][]=[];
 for(const polygon of domain.polygons)for(let k=1;k<xs.length;k++){
  const lo=xs[k-1],hi=xs[k],mid=(lo+hi)/2;if(hi-lo<1e-9)continue;
  const hits:{v:number;at:(u:number)=>number}[]=[];
  for(const ring of [polygon.outer,...polygon.holes])for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];if(mid<=Math.min(a.u,b.u)||mid>=Math.max(a.u,b.u))continue;
   const at=(u:number)=>a.v+(b.v-a.v)*(u-a.u)/(b.u-a.u);hits.push({v:at(mid),at});
  }
  hits.sort((a,b)=>a.v-b.v);
  if(hits.length%2)throw new Error('Invalid surface subtraction parity');
  for(let i=0;i<hits.length;i+=2){const a=hits[i],b=hits[i+1];if(b.v-a.v<1e-9)continue;
   const vertices=[{u:lo,v:a.at(lo)},{u:hi,v:a.at(hi)},{u:hi,v:b.at(hi)},{u:lo,v:b.at(lo)}].filter((p,i,all)=>Math.hypot(p.u-all[(i+3)%4].u,p.v-all[(i+3)%4].v)>1e-9);
   if(vertices.length>=3)result.push(vertices);
   if(result.length>20000)throw new Error('Surface subtraction exceeds the mesh capacity limit');
  }
 }
 return result;
}

export function distanceToRing(point:SurfacePoint,ring:SurfacePoint[]):number{let minimum=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],du=b.u-a.u,dv=b.v-a.v,t=Math.max(0,Math.min(1,((point.u-a.u)*du+(point.v-a.v)*dv)/(du*du+dv*dv)));minimum=Math.min(minimum,Math.hypot(point.u-a.u-t*du,point.v-a.v-t*dv));}return minimum;}
export function profileInside(profile:CutoutProfile,polygon:SurfacePolygon):boolean{if(profile.shape!=='circle')return ringInside(profileRing(profile),polygon);const radius=profile.diameter/2,center=profile.center;return strictlyContains(chartPoint(center),polygon.outer.map(chartPoint))&&distanceToRing(center,polygon.outer)>radius+1e-6&&polygon.holes.every(h=>!strictlyContains(chartPoint(center),h.map(chartPoint))&&distanceToRing(center,h)>radius+1e-6);}
export function profilesTouch(a:CutoutProfile,b:CutoutProfile):boolean{if(a.shape==='circle'&&b.shape==='circle')return Math.hypot(a.center.u-b.center.u,a.center.v-b.center.v)<=(a.diameter+b.diameter)/2+1e-6;if(a.shape==='circle'||b.shape==='circle'){const circle=a.shape==='circle'?a:b;if(circle.shape!=='circle')return false;const ring=profileRing(a.shape==='circle'?b:a);return strictlyContains(chartPoint(circle.center),ring.map(chartPoint))||distanceToRing(circle.center,ring)<=circle.diameter/2+1e-6;}return ringsTouch(profileRing(a),profileRing(b));}
