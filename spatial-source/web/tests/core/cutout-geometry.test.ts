import test from 'node:test';
import assert from 'node:assert/strict';
import { materialPolygons, CIRCLE_SEGMENTS, profileRing } from '../../src/core/cutoutGeometry';
import type { SurfaceDomain } from '../../src/types';
const area=(ring:{u:number;v:number}[])=>Math.abs(ring.reduce((s,p,i)=>s+p.u*ring[(i+1)%ring.length].v-ring[(i+1)%ring.length].u*p.v,0)/2);
test('concave horizontal host and boundary-touching aperture preserve exact domain area with deterministic circular subtraction',()=>{
 const outer=[{u:0,v:0},{u:5,v:0},{u:5,v:2},{u:3,v:2},{u:3,v:5},{u:0,v:5}],circle=profileRing({shape:'circle',center:{u:1.5,v:3},diameter:1}),opening=[{u:1,v:0},{u:2,v:0},{u:2,v:1},{u:1,v:1}],domain:SurfaceDomain={polygons:[{outer,holes:[opening,circle]}]};
 const polygons=materialPolygons(domain);assert.deepEqual(materialPolygons(domain),polygons);assert.ok(Math.abs(polygons.reduce((s,p)=>s+area(p),0)-(area(outer)-area(opening)-area(circle)))<1e-9);assert.ok(Math.abs(area(circle)-CIRCLE_SEGMENTS*.25*Math.sin(2*Math.PI/CIRCLE_SEGMENTS)/2)<1e-9);
 assert.throws(()=>materialPolygons({polygons:[{outer:Array.from({length:16001},(_,i)=>({u:i,v:i%2})),holes:[]}]}),/bounded/);
});
