import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emptyFloor, provenance } from './fixtures';
import { applyCommands } from '../../src/core/editor';
import { remapAffectedAreas, visibleAffectedAreas } from '../../src/core/affectedAreas';
import { surfaceRemapReceipt } from '../../src/core/surfaces';
import { establishCeilingSchema } from '../../src/core/ceilings';
import { domainArea, rectangle } from '../../src/core/affectedAreaGeometry';
import { validateDocument } from '../../src/core/validation';
import type { SpatialDocument, SurfaceRef, EditCommand } from '../../src/types';
const floorID='floor-1';
function saved(wallID='w4'){const d=fixture();return applyCommands(d,[{type:'recordAffectedArea',areaID:'obs',kind:'moisture',surface:{floorID,kind:'wall',wallID,side:'positive'},footprint:rectangle(.1,.1,3.9,2.5)}],1).document;}
const coverage=(d:SpatialDocument)=>visibleAffectedAreas(d,floorID,false).reduce((n,p)=>n+domainArea(p.domain),0);
const edit=(d:SpatialDocument,c:EditCommand[])=>applyCommands(d,c,d.revision);
test('moving/removing an opening cannot manufacture observed material',()=>{
  const d=saved(),support=structuredClone(d.affectedAreas![0].recordedSupport),initial=coverage(d);
  const moved=edit(d,[{type:'moveOpening',floorID,openingID:'window-a',offset:2}]).document;assert.ok(coverage(moved)<initial);
  const removed=edit(moved,[{type:'deleteOpening',floorID,openingID:'window-a'}]).document;assert.ok(Math.abs(coverage(removed)-initial)<1e-7);assert.deepEqual(removed.affectedAreas![0].recordedSupport,support);assert.equal(removed.affectedAreas![0].reviewState,'needsReview');
});
test('height change clips display without stretching or deleting authored support',()=>{
  const d=saved('w0'),original=structuredClone(d.affectedAreas![0]),lower=structuredClone(d);lower.floors[0].walls[0].height=1;
  // Synthetic height adapter seam; F03 command integration is checked separately.
  lower.affectedAreas=remapAffectedAreas(d.affectedAreas!,surfaceRemapReceipt(d,lower));assert.ok(coverage(lower)<coverage(d));assert.deepEqual(lower.affectedAreas![0].footprint,original.footprint);assert.deepEqual(lower.affectedAreas![0].recordedSupport,original.recordedSupport);
  const raised=structuredClone(lower);raised.floors[0].walls[0].height=4;raised.affectedAreas=remapAffectedAreas(lower.affectedAreas!,surfaceRemapReceipt(lower,raised));assert.ok(Math.abs(coverage(raised)-coverage(d))<1e-7);
});
test('split and joined charts retain exact physical pieces and coherent command receipt',()=>{
  const d=saved('w0'),split=edit(d,[{type:'splitWall',floorID,wallID:'w0',offset:1.6,newWallID:'split',newNodeID:'split-node'}]);assert.equal(split.document.affectedAreas![0].attachments.length,2);assert.ok(Math.abs(coverage(split.document)-coverage(d))<1e-7);assert.ok(split.receipt.surfaceRemaps?.mappings.length);
  const joined=edit(split.document,[{type:'joinWalls',floorID,firstWallID:'w0',secondWallID:'split'}]).document;assert.ok(Math.abs(coverage(joined)-coverage(d))<1e-7);assert.equal(joined.affectedAreas![0].attachments.length,1);assert.deepEqual(joined.affectedAreas![0].footprint,d.affectedAreas![0].footprint);assert.deepEqual(validateDocument(joined),[]);
});
test('physical wall reversal swaps side and arclength',()=>{
  const d=saved('w0'),next=structuredClone(d);next.floors[0].walls[0].nodeIDs.reverse();for(const r of next.floors[0].rooms)for(const b of r.boundary)if(b.wallID==='w0')b.reversed=!b.reversed;
  next.affectedAreas=remapAffectedAreas(d.affectedAreas!,surfaceRemapReceipt(d,next));const a=next.affectedAreas![0].attachments[0];assert.equal((a.surface as Extract<SurfaceRef,{kind:'wall'}>).side,'negative');assert.deepEqual(a.transform,[-1,0,0,1,4,0]);assert.ok(Math.abs(coverage(next)-coverage(d))<1e-7);
});
test('group translation is evaluated once, not at each intermediate moved node',()=>{
  const d=saved('w0'),next=edit(d,d.floors[0].nodes.map(n=>({type:'moveNode',floorID,nodeID:n.id,point:{x:n.point.x+2,z:n.point.z+3}}))).document;
  assert.equal(next.affectedAreas![0].attachments[0].outcome,'exact');assert.ok(Math.abs(coverage(next)-coverage(d))<1e-7);assert.deepEqual(next.affectedAreas![0].attachments[0].transform,[1,0,0,1,0,0]);
});
test('deleting the entire host floor retains unresolved observations and original snapshots',()=>{
  let d=saved();d=edit(d,[{type:'addFloor',floor:emptyFloor('other')}]).document;const original=JSON.stringify(d.affectedAreas![0]),next=edit(d,[{type:'deleteFloor',floorID}]).document;
  assert.equal(next.affectedAreas!.length,1);assert.equal(next.affectedAreas![0].reviewState,'unresolved');assert.equal(next.affectedAreas![0].attachments[0].surface,null);assert.deepEqual(next.affectedAreas![0].footprint,d.affectedAreas![0].footprint);assert.equal(JSON.stringify(d.affectedAreas![0]),original);assert.deepEqual(validateDocument(next),[]);
});
test('floor boundary loss is retained unresolved rather than attached to the nearest room',()=>{
  const d=fixture(),recorded=edit(d,[{type:'recordAffectedArea',areaID:'floor-obs',kind:'fire',surface:{floorID,kind:'floor',roomID:'room-a'},footprint:rectangle(.2,.2,2,2)}]).document;
  const next=edit(recorded,[{type:'deleteRoom',floorID,roomID:'room-a'}]).document;assert.equal(next.affectedAreas![0].reviewState,'unresolved');assert.equal(next.affectedAreas![0].attachments[0].surface,null);
});
test('nonrigid host deformation retains the original observation for explicit review',()=>{
  const d=saved('w0'),next=structuredClone(d);next.floors[0].nodes.find(n=>n.id===next.floors[0].walls[0].nodeIDs[1])!.point.z+=.4;
  next.affectedAreas=remapAffectedAreas(d.affectedAreas!,surfaceRemapReceipt(d,next));assert.equal(next.affectedAreas[0].reviewState,'unresolved');assert.deepEqual(next.affectedAreas[0].footprint,d.affectedAreas![0].footprint);assert.deepEqual(next.affectedAreas[0].recordedSupport,d.affectedAreas![0].recordedSupport);
});
test('a split/join command batch does not expose intermediate-only source hosts',()=>{
  const d=saved('w0'),next=edit(d,[{type:'splitWall',floorID,wallID:'w0',offset:1.6,newWallID:'transient-wall',newNodeID:'transient-node'},{type:'joinWalls',floorID,firstWallID:'w0',secondWallID:'transient-wall'}]);
  assert.ok(next.receipt.surfaceRemaps?.mappings.every(m=>{const ref=m.from;return ref.kind!=='wall'||d.floors[0].walls.some(w=>w.id===ref.wallID);}));assert.ok(Math.abs(coverage(next.document)-coverage(d))<1e-7);
});
test('replacing a ceiling identity retains its observation unresolved instead of guessing a new host',()=>{
  const source=fixture();establishCeilingSchema(source);source.schemaVersion='1.5.0';source.floors[0].rooms[0].ceiling={id:'original-ceiling',height:2.6,heightBasis:'synthetic',provenance:provenance()};
  // Contract-level resolver probe only; F03 commands are an integration dependency.
  const recorded=edit(source,[{type:'recordAffectedArea',areaID:'ceiling-obs',kind:'fire',surface:{floorID,kind:'ceiling',roomID:'room-a',ceilingID:'original-ceiling'},footprint:rectangle(.2,.2,2,2)}]).document;
  const changed=structuredClone(recorded);changed.floors[0].rooms[0].ceiling!.id='replacement-ceiling';
  changed.affectedAreas=remapAffectedAreas(recorded.affectedAreas!,surfaceRemapReceipt(recorded,changed));
  assert.equal(changed.affectedAreas[0].reviewState,'unresolved');assert.equal(changed.affectedAreas[0].attachments[0].surface,null);
  assert.deepEqual(changed.affectedAreas[0].recordedSupport,recorded.affectedAreas![0].recordedSupport);assert.equal(coverage(changed),0);assert.deepEqual(validateDocument(changed),[]);
});
