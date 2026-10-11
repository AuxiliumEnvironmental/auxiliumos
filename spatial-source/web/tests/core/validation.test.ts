import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireValidDocument, validateDocument } from '../../src/core';
import type { SpatialDocument } from '../../src/types';
import { fixture,provenance } from './fixtures';

test('canonical legacy geometry is accepted and admission owns its snapshot',()=>{const source=fixture(),copy=requireValidDocument(source);assert.deepEqual(validateDocument(source),[]);copy.floors[0].nodes[0].point.x=77;assert.equal(source.floors[0].nodes[0].point.x,0);});
for(const [name,value]of [['null',null],['array',[]],['wrong type',{floors:{}}],['primitive',2],['nonplain',new Date()]] as const)test(`strict structure rejects ${name}`,()=>assert.ok(validateDocument(value).length));
for(const [label,mutate]of [
  ['unknown field',(d:SpatialDocument)=>Object.assign(d,{publisher:'authority'})],
  ['NaN',(d:SpatialDocument)=>d.floors[0].nodes[0].point.x=NaN],
  ['infinite',(d:SpatialDocument)=>d.floors[0].walls[0].height=Infinity],
  ['fractional revision',(d:SpatialDocument)=>d.revision=1.5],
  ['unsafe revision',(d:SpatialDocument)=>d.revision=Number.MAX_SAFE_INTEGER+1],
  ['future parent',(d:SpatialDocument)=>d.parentRevision=1],
  ['duplicate floor',(d:SpatialDocument)=>d.floors.push(structuredClone(d.floors[0]))],
  ['duplicate node',(d:SpatialDocument)=>d.floors[0].nodes.push(structuredClone(d.floors[0].nodes[0]))],
  ['missing node',(d:SpatialDocument)=>d.floors[0].walls[0].nodeIDs[0]='missing'],
  ['wall loop',(d:SpatialDocument)=>d.floors[0].walls[0].nodeIDs.push('n0')],
  ['missing host',(d:SpatialDocument)=>d.floors[0].openings[0].wallID='missing'],
  ['opening outside host',(d:SpatialDocument)=>d.floors[0].openings[0].width=5],
  ['opening vertical overlap',(d:SpatialDocument)=>d.floors[0].openings.push({...structuredClone(d.floors[0].openings[0]),id:'overlap'})],
  ['broken room node graph',(d:SpatialDocument)=>{d.floors[0].nodes.push({id:'same-coordinates',point:{x:4,z:0}});d.floors[0].walls[6].nodeIDs[0]='same-coordinates';}],
  ['cross-kind rendering ID',(d:SpatialDocument)=>d.floors[0].openings[0].id=d.floors[0].walls[0].id],
  ['combined world height',(d:SpatialDocument)=>d.floors[0].elevation=10000],
  ['incompatible shared direction',(d:SpatialDocument)=>d.floors[0].rooms[1].boundary[3].reversed=false],
  ['three room wall',(d:SpatialDocument)=>d.floors[0].rooms.push({...structuredClone(d.floors[0].rooms[0]),id:'third'})],
  ['control characters',(d:SpatialDocument)=>d.title='Invisible\u0000title'],
  ['ID path traversal',(d:SpatialDocument)=>d.documentID='../not-a-safe-id'],
  ['unrecognized origin',(d:SpatialDocument)=>Object.assign(d.floors[0].walls[0].provenance,{origin:'surveyed'})],
  ['legacy areas field',(d:SpatialDocument)=>d.floors[0].areas=[]],
] as const)test(`invalid input: ${label}`,()=>{const d=fixture();mutate(d);assert.ok(validateDocument(d).length);assert.throws(()=>requireValidDocument(d));});
test('strict admission does not mutate optional null parent accepted by old schema',()=>{const d=fixture();Object.assign(d,{parentRevision:null});const clean=requireValidDocument(d);assert.equal(clean.parentRevision,undefined);assert.equal(d.parentRevision,null);});
test('bounded semantic areas require 1.1, preserve source IDs, and reject self crossing',()=>{const d=fixture();d.schemaVersion='1.1.0';d.floors[0].areas=[{id:'zone',label:'Drying zone',polygon:[{x:1,z:1},{x:3,z:1},{x:3,z:3},{x:1,z:3}],provenance:provenance()}];assert.deepEqual(validateDocument(d),[]);d.floors[0].areas[0].polygon=[{x:1,z:1},{x:3,z:3},{x:3,z:1},{x:1,z:3}];assert.ok(validateDocument(d).some(i=>i.code==='invalid_polygon'));});
test('UTF-16 does not undercount Unicode scalar text limits',()=>{const d=fixture();d.title='😀'.repeat(256);assert.deepEqual(validateDocument(d),[]);d.title+='😀';assert.ok(validateDocument(d).some(i=>i.code==='invalid_text'));});
test('unbounded arrays stop at admission instead of executing geometric work',()=>{const d=fixture();d.floors[0].walls[0].nodeIDs=Array(1001).fill('n0');assert.ok(validateDocument(d).some(i=>i.code==='capacity'));});
test('sparse arrays return structured rejection instead of throwing inside graph validation',()=>{const d=fixture();d.floors=new Array(1);assert.doesNotThrow(()=>validateDocument(d));assert.ok(validateDocument(d).some(i=>i.code==='type'));const nodes=fixture();delete nodes.floors[0].nodes[0];assert.ok(validateDocument(nodes).some(i=>i.code==='type'));});
test('standalone bowtie and adjacent backtracking wall paths are invalid even without rooms',()=>{for(const points of [[{x:0,z:0},{x:2,z:2},{x:0,z:2},{x:2,z:0}],[{x:0,z:0},{x:2,z:0},{x:1,z:0}]]){const d=fixture(),f=d.floors[0];f.rooms=[];f.openings=[];f.nodes=points.map((point,i)=>({id:`p${i}`,point}));f.walls=[{id:'bad',nodeIDs:f.nodes.map(n=>n.id),baseY:0,height:2.6,heightBasis:'synthetic',provenance:provenance()}];assert.ok(validateDocument(d).some(i=>i.code==='self_intersecting_wall'));}});
