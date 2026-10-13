import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, provenance } from './fixtures';
import { applyCommands } from '../../src/core/editor';
import { validateDocument } from '../../src/core/validation';
import { affectedPlanPrimitives, affectedSceneFaces, visibleAffectedAreas } from '../../src/core/affectedAreas';
import { asDomain, rectangle, intersectDomains, domainArea, domainGrid } from '../../src/core/affectedAreaGeometry';
import { resolveSurface, surfacePointToWorld } from '../../src/core/surfaces';
import type { SpatialDocument, SurfaceRef } from '../../src/types';
const floorID='floor-1';
const record=(doc:SpatialDocument,surface:SurfaceRef,kind:'moisture'|'fire'='moisture',id='obs')=>applyCommands(doc,[{type:'recordAffectedArea',areaID:id,kind,surface,footprint:rectangle(0.2,0.2,3.7,2.5)}],doc.revision).document;
for(const side of ['positive','negative'] as const)for(const kind of ['moisture','fire'] as const)test(`wall chart and independent ${kind} on ${side}`,()=>{
  const doc=record(fixture(),{floorID,kind:'wall',wallID:'w6',side},kind),area=doc.affectedAreas![0];
  assert.equal(doc.schemaVersion,'1.5.0');assert.equal(area.measurementStatus,'unverified');assert.equal(area.provenance.origin,'edited');assert.equal(area.sourceRevision,1);assert.equal(area.reviewState,'needsReview');
  assert.deepEqual(validateDocument(doc),[]);const piece=visibleAffectedAreas(doc,floorID)[0];assert.equal(piece.surface.kind,'wall');
  assert.ok(Math.abs(domainArea(piece.domain)-(3.5*2.3-0.9*1.85))<1e-7);
  const faces=affectedSceneFaces(doc,floorID);assert.ok(faces.length);for(const f of faces){const [a,b,c]=f.triangles[0].map(i=>f.vertices[i]);const nx=(b.y-a.y)*(c.z-a.z)-(b.z-a.z)*(c.y-a.y);assert.ok(side==='positive'?nx<0:nx>0);assert.equal(f.role,`affected-${kind}`);}
  const plan=affectedPlanPrimitives(doc,floorID);assert.ok(plan.lines.every(l=>l.wall));assert.ok(plan.lines.every(l=>side==='positive'?l.a.x<4:l.a.x>4));
});
test('concave domains, holes, intersections at edge crossings and dual-direction grids',()=>{
  const concave=asDomain({outer:[{u:0,v:0},{u:4,v:0},{u:4,v:1},{u:1,v:1},{u:1,v:4},{u:0,v:4}],holes:[]});
  const hole=asDomain({...rectangle(0,0,4,4),holes:[rectangle(.2,.2,.8,.8).outer]});
  const result=intersectDomains([concave,hole]);assert.ok(Math.abs(domainArea(result)-6.64)<1e-7);
  const grid=domainGrid(result);assert.ok(grid.some(l=>l.a.u===l.b.u));assert.ok(grid.some(l=>l.a.v===l.b.v));assert.ok(grid.every(l=>!(l.a.u>.2&&l.a.u<.8&&l.a.v>.2&&l.a.v<.8)));
  const diamond=asDomain({outer:[{u:2,v:-1},{u:5,v:2},{u:2,v:5},{u:-1,v:2}],holes:[]});assert.ok(Math.abs(domainArea(intersectDomains([asDomain(rectangle(0,0,4,4)),diamond]))-14)<1e-7);
});
test('bent wall faces follow segments and physical base/elevation, never bridge the bend',()=>{
  const doc=fixture(),f=doc.floors[0];f.rooms=[];f.openings=[];f.nodes=[{id:'a',point:{x:0,z:0}},{id:'b',point:{x:3,z:0}},{id:'c',point:{x:3,z:2}}];f.walls=[{id:'bend',nodeIDs:['a','b','c'],baseY:.4,height:3,heightBasis:'synthetic',provenance:provenance()}];f.elevation=7;
  const ref:SurfaceRef={floorID,kind:'wall',wallID:'bend',side:'positive'},saved=record(doc,ref);
  const faces=affectedSceneFaces(saved,floorID);assert.ok(faces.some(f=>f.vertices.every(v=>Math.abs(v.z-.001)<1e-7)));assert.ok(faces.some(f=>f.vertices.every(v=>Math.abs(v.x-2.999)<1e-7)));
  assert.deepEqual(surfacePointToWorld(saved,ref,{u:4,v:1}),{x:3,y:8.4,z:1});
  assert.ok(faces.every(f=>f.vertices.every(v=>Math.abs(v.z-.001)<1e-7)||f.vertices.every(v=>Math.abs(v.x-2.999)<1e-7)));
});
test('floor and established ceiling have distinct encodings; legacy display ceiling is not a host',()=>{
  const doc=fixture(),floor:SurfaceRef={floorID,kind:'floor',roomID:'room-a'},ceiling:SurfaceRef={floorID,kind:'ceiling',roomID:'room-a',ceilingID:'ceiling-a'};
  assert.equal(resolveSurface(doc,ceiling),null);assert.throws(()=>record(doc,ceiling),/established ceiling/);
  let saved=record(doc,floor);assert.ok(affectedPlanPrimitives(saved,floorID).polygons.length);
  // Explicit synthetic contract fixture, NOT evidence of F03 migration/editing.
  saved.floors[0].rooms[0].ceiling={id:'ceiling-a',height:2.6,heightBasis:'synthetic',provenance:provenance()};saved=record(saved,ceiling,'fire','ceiling-obs');
  const plan=affectedPlanPrimitives(saved,floorID),grid=plan.lines.filter(l=>l.surface.kind==='ceiling');assert.ok(grid.some(l=>l.a.x===l.b.x));assert.ok(grid.some(l=>l.a.z===l.b.z));assert.ok(plan.polygons.every(p=>p.kind==='moisture'));
  assert.equal(surfacePointToWorld(saved,ceiling,{u:1,v:1})?.y,2.6);
});
test('overlapping kinds remain independent and alternate, not blended into a new record',()=>{
  const ref:SurfaceRef={floorID,kind:'floor',roomID:'room-a'},one=record(fixture(),ref),two=record(one,ref,'fire','fire-obs');
  assert.equal(two.affectedAreas!.length,2);const raw=visibleAffectedAreas(two,floorID,false),marked=visibleAffectedAreas(two,floorID);
  assert.ok(Math.abs(raw.reduce((n,p)=>n+domainArea(p.domain),0)/2-marked.reduce((n,p)=>n+domainArea(p.domain),0))<1e-7);
  assert.ok(marked.every(p=>domainArea(p.domain)>0));assert.equal(domainArea(intersectDomains(marked.map(p=>p.domain))),0);
});
test('strict admission rejects unknown fields, versions, forged support and invalid transforms without mutation',()=>{
  const doc=record(fixture(),{floorID,kind:'floor',roomID:'room-a'}),bytes=JSON.stringify(doc);
  for(const alter of [(d:any)=>d.schemaVersion='1.99.0',(d:any)=>d.affectedAreas[0].reading=99,(d:any)=>d.affectedAreas[0].attachments[0].transform=[2,0,0,1,0,0],(d:any)=>d.affectedAreas[0].attachments[0].sourceDomain.polygons.push(rectangle(8,8,9,9)),(d:any)=>d.affectedAreas[0].measurementStatus='verified']){const invalid=structuredClone(doc);alter(invalid);assert.ok(validateDocument(invalid).length);}
  assert.equal(JSON.stringify(doc),bytes);assert.deepEqual(validateDocument(fixture()),[]);
});
