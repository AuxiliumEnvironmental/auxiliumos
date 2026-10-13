import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCommands, buildScene, requireValidDocument, validateDocument, WalkNavigation} from '../../src/core';
import {establishCeilingSchema, legacyCeiling, prepareCeilingEdit, previewCeilingHeights} from '../../src/core/ceilings';
import {fixture} from './fixtures';
import type {CeilingHeightEdit, SpatialDocument} from '../../src/types';
const roomTarget=(roomID='room-a',floorID='floor-1')=>({floorID,roomID});
const edit=(d:SpatialDocument,value:number,mode:CeilingHeightEdit['mode']='absolute',targets=[roomTarget()])=>applyCommands(d,[{type:'setCeilingHeights',targets,mode,value}],d.revision);
function asymmetric(){const d=fixture();const f=d.floors[0];f.elevation=7.25;for(const wall of f.walls)wall.baseY=.2;establishCeilingSchema(d);f.rooms[1].ceiling!.height=2.7;return requireValidDocument(d);}

test('F03-A01 exact and delta use the same floor-relative heights and never shift neighboring intent',()=>{
  const d=asymmetric(),snapshot=structuredClone(d),f=d.floors[0],id=f.rooms[0].ceiling!.id;
  const preview=previewCeilingHeights(prepareCeilingEdit(d,[roomTarget()]),'delta',.6);
  const a=edit(d,.6,'delta').document,b=edit(d,f.rooms[0].ceiling!.height+.6).document;
  assert.deepEqual(a,b);assert.equal(a.floors[0].rooms[0].ceiling!.id,id);
  assert.equal(a.floors[0].rooms[0].ceiling!.height,preview.heights[0].height);
  assert.deepEqual(a.floors[0].rooms[1],f.rooms[1]);assert.deepEqual(a.floors[0].openings,f.openings);assert.deepEqual(a.floors[0].nodes,f.nodes);assert.equal(a.floors[0].elevation,7.25);
  const faces=buildScene(a,'floor-1').faces.filter(face=>face.role==='ceiling');assert.equal(faces.length,2);assert(faces.find(face=>face.objectID===id)!.vertices.every(p=>p.y===7.25+preview.heights[0].height));
  const lower=edit(a,2.8).document;assert.deepEqual(lower.floors[0].walls,a.floors[0].walls);assert.deepEqual(d,snapshot);
});
test('F03-A02 explicit multi-level set preserves differences and datums; invalid members roll back all',()=>{
  const d=asymmetric(),upper=structuredClone(d.floors[0]);upper.id='upper';upper.elevation=20;d.floors.push(upper);
  const targets=[roomTarget('room-a'),roomTarget('room-b','upper')];const before=structuredClone(d);const result=edit(d,.4,'delta',targets);
  assert.equal(result.document.revision,d.revision+1);assert(Math.abs(result.document.floors[0].rooms[0].ceiling!.height-before.floors[0].rooms[0].ceiling!.height-.4)<1e-12);
  assert(Math.abs(result.document.floors[1].rooms[1].ceiling!.height-before.floors[1].rooms[1].ceiling!.height-.4)<1e-12);
  assert.deepEqual(result.document.floors.map(f=>f.elevation),[7.25,20]);assert.deepEqual(result.document.floors[0].rooms[1],d.floors[0].rooms[1]);assert.deepEqual(result.document.floors[1].rooms[0],upper.rooms[0]);
  d.floors[1].rooms[1].ceiling=null;assert.throws(()=>edit(d,.1,'delta',targets),/absolute starting height.*Office/);assert.throws(()=>edit(d,3,'absolute',[...targets,roomTarget('missing')]),/Missing ceiling room/);assert.throws(()=>edit(d,3,'absolute',[roomTarget(),roomTarget()]),/duplicate/);
  const absolute=edit(d,3.6,'absolute',targets);assert.equal(absolute.document.floors[1].rooms[1].ceiling!.height,3.6);assert.equal(d.floors[1].rooms[1].ceiling,null);
});
test('F03-A03 migration preserves original capture, records inference, and never guesses invalid clearance',()=>{
  const d=fixture(),original=structuredClone(d);const migrated=edit(d,3.5).document;assert.equal(migrated.schemaVersion,'1.3.0');assert.equal(migrated.floors[0].rooms[1].ceiling!.heightBasis,'assumed');assert.equal(migrated.floors[0].rooms[1].ceiling!.provenance.origin,'inferred');assert(migrated.floors[0].rooms[1].ceiling!.provenance.sourceIDs.includes('w6'));assert.deepEqual(d,original);
  for(const base of [-3,-4]){const legacy=fixture();legacy.floors[0].openings=[];for(const wall of legacy.floors[0].walls){wall.baseY=base;wall.height=3;}assert.deepEqual(validateDocument(legacy),[]);assert.equal(legacyCeiling(legacy.floors[0],legacy.floors[0].rooms[0]),null);establishCeilingSchema(legacy);assert(legacy.floors[0].rooms.every(r=>r.ceiling===null));assert.deepEqual(validateDocument(legacy),[]);}
  const unequal=fixture();unequal.floors[0].walls[0].height+=.7;const corrected=edit(unequal,3.5,'absolute',[roomTarget('room-b')]).document;assert.equal(corrected.floors[0].rooms[0].ceiling,null);
  for(const wall of corrected.floors[0].walls)wall.height=4;assert.equal(corrected.floors[0].rooms[0].ceiling,null);
});
test('F03-A03 ceiling/opening and numeric bounds reject atomically with actionable IDs',()=>{
  const d=asymmetric(),before=structuredClone(d);assert.throws(()=>edit(d,1.9),/opening door-a/);for(const value of [NaN,Infinity,0,-1,101])assert.throws(()=>edit(d,value));assert.deepEqual(d,before);
  const tooLow=structuredClone(d);tooLow.floors[0].rooms[0].ceiling!.height=1;assert(validateDocument(tooLow).some(i=>i.code==='ceiling_opening_conflict'));
});
test('F03-A04 stable identities split, merge, serialize and reject incompatible merge unless resolved',()=>{
  const source=fixture();let d=edit(source,3,'absolute',[roomTarget(),roomTarget('room-b')]).document;const ids=d.floors[0].rooms.map(r=>r.ceiling!.id);
  const merged=applyCommands(d,[{type:'mergeRooms',floorID:'floor-1',firstRoomID:'room-a',secondRoomID:'room-b'}],d.revision);assert.equal(merged.document.floors[0].rooms[0].ceiling!.id,ids[0]);assert(merged.document.floors[0].rooms[0].ceiling!.provenance.sourceIDs.includes(ids[1]));
  const reopened=requireValidDocument(JSON.parse(JSON.stringify(merged.document)));assert.deepEqual(reopened,merged.document);
  const split=applyCommands(reopened,[{type:'addWall',floorID:'floor-1',wall:source.floors[0].walls.find(w=>w.id==='w6')!,newNodes:[]},{type:'splitRoom',floorID:'floor-1',roomID:'room-a',dividerWallID:'w6',newRoomID:'room-b',newLabel:'Office'}],reopened.revision);assert.equal(split.document.floors[0].rooms[0].ceiling!.id,ids[0]);assert.notEqual(split.document.floors[0].rooms[1].ceiling!.id,ids[0]);assert.equal(split.document.floors[0].rooms[1].ceiling!.height,3);
  d=edit(d,3.6).document;const merge={type:'mergeRooms' as const,floorID:'floor-1',firstRoomID:'room-a',secondRoomID:'room-b'};assert.throws(()=>applyCommands(d,[merge],d.revision),/different or unknown/);const explicit=applyCommands(d,[{...merge,ceilingHeight:3.7}],d.revision);assert.equal(explicit.document.floors[0].rooms[0].ceiling!.height,3.7);
  const nulled=structuredClone(d);nulled.floors[0].rooms.forEach(r=>r.ceiling=null);assert.equal(applyCommands(nulled,[merge],nulled.revision).document.floors[0].rooms[0].ceiling,null);
});
test('F03-A04 strict old and new admission rejects fields, missing state, duplicate ceiling IDs, and unknown versions intact',()=>{
  const old=fixture();old.floors[0].rooms[0].ceiling=null;assert(validateDocument(old).some(i=>i.code==='unknown_field'));
  const d=edit(fixture(),3).document;delete d.floors[0].rooms[0].ceiling;assert(validateDocument(d).some(i=>i.code==='required'));
  const valid=edit(fixture(),3).document;valid.floors[0].rooms[0].ceiling!.id=valid.floors[0].rooms[1].ceiling!.id;assert(validateDocument(valid).some(i=>i.code==='duplicate_id'));
  for(const schemaVersion of ['1.2.0','1.4.0','2.0.0'])assert(validateDocument({...fixture(),schemaVersion}).length>0);
});
test('F03-A06 area editing cannot downgrade ceiling geometry or scene, and new rooms have explicit null intent',()=>{
  let d=edit(fixture(),3).document;const floor=d.floors[0],saved=structuredClone(floor.rooms[1]);d=applyCommands(d,[{type:'setArea',floorID:floor.id,area:{id:'area',label:'Area',polygon:[{x:1,z:1},{x:2,z:1},{x:1,z:2}],provenance:{origin:'edited',sourceIDs:[],classificationConfidence:'unknown'}}}],d.revision).document;assert.equal(d.schemaVersion,'1.3.0');assert.equal(buildScene(d,floor.id).schemaVersion,'1.3.0');
  d=applyCommands(d,[{type:'deleteRoom',floorID:floor.id,roomID:saved.id}],d.revision).document;delete saved.ceiling;d=applyCommands(d,[{type:'addRoom',floorID:floor.id,room:saved}],d.revision).document;assert.equal(d.floors[0].rooms.find(r=>r.id===saved.id)!.ceiling,null);
});
test('F03-A05 walking uses established clearance and does not invent an unknown height',()=>{
  const d=fixture();d.floors[0].openings=[];const low=edit(d,1.2).document;assert.throws(()=>new WalkNavigation(low,'floor-1').start('room-a'),/head clearance/);assert.throws(()=>new WalkNavigation(low,'floor-1').place({x:2,z:2}));low.floors[0].rooms[0].ceiling=null;assert.equal(new WalkNavigation(low,'floor-1').start('room-a').roomID,'room-a');
});

import {CeilingDrag, CeilingPreviewFrames, ceilingFenceMatches, type CeilingRay} from '../../src/ui/ceilingManipulation';
import {glbDrawing} from '../../src/data/glb';
import {jsonBytes, sha256, strictJSON} from '../../src/data/bytes';
import {surfaceLinearRGB} from '../../src/surfacePalette';
import {rectangleRoomCommands} from '../../src/ui/roomDrawing';
import {wallDrawingCommands} from '../../src/ui/wallDrawing';
const cameraBasis=[5,5,5,0,0,0,1];
const fenceFor=(d:SpatialDocument)=>({documentID:d.documentID,expectedRevision:d.revision,contextKey:'test-authority',generation:4});
const rayFor=(y:number):CeilingRay=>({origin:{x:5,y:5,z:5},direction:{x:-3,y:y-5,z:-3}});
function gesture(d=asymmetric()){const h=d.floors[0].elevation+d.floors[0].rooms[0].ceiling!.height,ray:CeilingRay={origin:{x:5,y:h+4,z:5},direction:{x:-3,y:-4,z:-3}},drag=new CeilingDrag(d,[roomTarget()],fenceFor(d),1,{x:2,y:h,z:2},ray,cameraBasis);return{d,h,drag,ray,at:(delta:number)=>({...ray,direction:{...ray.direction,y:ray.direction.y+delta}})};}

test('F03-A01 vertical projection preserves grip offset and exact numeric/terminal command agreement',()=>{
  const {d,drag,at}=gesture();const snapshot=structuredClone(d);const preview=drag.sample(at(.75),cameraBasis);assert(preview.valid);assert(Math.abs(preview.delta-.75)<1e-12);const command=drag.finish(at(.8),cameraBasis,fenceFor(d))!;assert(command);assert(Math.abs(command.value-.8)<1e-12);const result=applyCommands(d,[command],d.revision);assert(Math.abs(result.document.floors[0].rooms[0].ceiling!.height-d.floors[0].rooms[0].ceiling!.height-.8)<1e-12);assert.deepEqual(d,snapshot);assert.equal(drag.finish(at(1),cameraBasis,fenceFor(d)),null);
});
test('F03-A05 singular rays hold the last valid preview without committing the singular terminal sample',()=>{
  const {d,drag,at}=gesture();const valid=drag.sample(at(.2),cameraBasis);const singular={origin:{x:5,y:10,z:5},direction:{x:0,y:1,z:0}};const held=drag.sample(singular,cameraBasis);assert.equal(held.valid,false);assert.deepEqual(held.preview,valid.preview);assert.equal(drag.finish(singular,cameraBasis,fenceFor(d)),null);
  const above=asymmetric();assert.throws(()=>new CeilingDrag(above,[roomTarget()],fenceFor(above),1,{x:2,y:10,z:2},{origin:{x:2,y:15,z:2},direction:{x:0,y:-1,z:0}},cameraBasis),/overhead/);
});
test('F03-A05 cancellation, stale revision, camera change, generation and principal replacement cannot save',()=>{
  for(const change of ['cancel','revision','generation','principal','camera']){const {d,drag,at}=gesture();drag.sample(at(.3),cameraBasis);const fence=fenceFor(d),basis=[...cameraBasis];if(change==='cancel')drag.cancel();if(change==='revision')fence.expectedRevision++;if(change==='generation')fence.generation++;if(change==='principal')fence.contextKey='another-account';if(change==='camera')basis[0]+=.1;assert.equal(drag.finish(at(.6),basis,fence),null,change);}
  assert(!ceilingFenceMatches(fenceFor(asymmetric()),{...fenceFor(asymmetric()),generation:5}));
});
test('F03-A05 out-of-bounds final sample and unchanged release create no height command',()=>{
  const first=gesture();assert.equal(first.drag.finish(first.at(0),cameraBasis,fenceFor(first.d)),null);const invalid=gesture();invalid.drag.sample(invalid.at(.5),cameraBasis);assert.equal(invalid.drag.finish(invalid.at(-8),cameraBasis,fenceFor(invalid.d)),null);
});
test('F03-A06 a burst coalesces to one preview and exact terminal release clears pending work',()=>{
  let requested=0,canceled=0,callback:FrameRequestCallback|undefined;const published:number[]=[];const frames=new CeilingPreviewFrames<number>(n=>published.push(n),fn=>{requested++;callback=fn;return requested;},()=>{canceled++;callback=undefined;});for(let i=0;i<120;i++)frames.push(i);assert.equal(requested,1);assert.deepEqual(published,[]);callback!(0);assert.deepEqual(published,[119]);frames.push(200);frames.flush(201);assert.deepEqual(published,[119,201]);assert.equal(canceled,1);frames.push(300);frames.clear();assert.equal(callback,undefined);assert.deepEqual(published,[119,201]);
});
test('F03-A04 frozen GLB retains canonical ceiling identities, coordinates, neutral material, and source hash',async()=>{
  const d=asymmetric(),bytes=jsonBytes(d),hash=await sha256(bytes),before=structuredClone(d),output=glbDrawing({document:d,bytes,hash,createdAt:'2026-10-11T00:00:00.000Z'},'floor-1'),view=new DataView(output.buffer,output.byteOffset,output.byteLength),jsonLength=view.getUint32(12,true),gltf=strictJSON(output.subarray(20,20+jsonLength)) as any;
  assert.equal(gltf.asset.extras.sourceSHA256,hash);assert.equal(gltf.asset.extras.geometrySchemaVersion,'1.3.0');const ceilings=gltf.meshes.filter((m:any)=>m.extras.role==='ceiling');assert.equal(ceilings.length,2);assert.deepEqual(ceilings.map((m:any)=>m.extras.objectID).sort(),d.floors[0].rooms.map(r=>r.ceiling!.id).sort());
  for(const mesh of ceilings){const primitive=mesh.primitives[0],material=gltf.materials[primitive.material],accessor=gltf.accessors[primitive.attributes.POSITION],buffer=gltf.bufferViews[accessor.bufferView],room=d.floors[0].rooms.find(r=>r.ceiling!.id===mesh.extras.objectID)!;assert.deepEqual(material.pbrMetallicRoughness.baseColorFactor,[...surfaceLinearRGB('ceiling'),1]);assert.equal(material.alphaMode,'OPAQUE');for(let i=0;i<accessor.count;i++)assert.equal(view.getFloat32(28+jsonLength+buffer.byteOffset+(i*3+1)*4,true),Math.fround(d.floors[0].elevation+room.ceiling!.height));}
  assert.deepEqual(d,before);assert.deepEqual(requireValidDocument(strictJSON(bytes)),d);
});
test('F03-A06 connected room and single-wall drawing preflight admits 1.3 without guessing a new ceiling',()=>{
  const d=fixture();establishCeilingSchema(d);const floor=d.floors[0];const room=rectangleRoomCommands(floor,{x:-2,z:0},{x:0,z:4},d.schemaVersion);const created=applyCommands(d,room.commands,d.revision).document;assert.equal(created.floors[0].rooms.find(r=>r.id===room.roomID)!.ceiling,null);assert.deepEqual(created.floors[0].rooms[0].ceiling,d.floors[0].rooms[0].ceiling);
  const wall=wallDrawingCommands(floor,[{nodeID:'free-a',x:-3,z:0},{nodeID:'free-b',x:-3,z:2}],d.schemaVersion);assert.equal(applyCommands(d,wall.commands,d.revision).document.schemaVersion,'1.3.0');
});
