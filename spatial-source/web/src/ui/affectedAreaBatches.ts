import * as THREE from 'three';
import type { GraphicScene, SurfaceRef } from '../types';
import type { SceneBatch } from './sceneBatches';
import { AFFECTED_COLORS, AFFECTED_OPACITY, affectedKind } from '../affectedAreaPalette';
/** Bounded per-kind/per-host-role batches. Winding and FrontSide retain wall side. */
export function batchAffectedFaces(scene:GraphicScene,clipping:THREE.Plane):SceneBatch[]{
  const groups=new Map<string,{kind:'moisture'|'fire';surfaceKind:SurfaceRef['kind'];positions:number[];indices:number[];owners:string[];surfaces:SurfaceRef[];ranges:{start:number;count:number;id:string}[]}>();
  for(const face of scene.faces){const kind=affectedKind(face.role);if(!kind)continue;if(!face.surface)throw new Error('An observation face needs its explicit surface.');
    const key=`${kind}:${face.surface.kind}`,g=groups.get(key)??{kind,surfaceKind:face.surface.kind,positions:[],indices:[],owners:[],surfaces:[],ranges:[]},start=g.positions.length/3;
    for(const p of face.vertices)g.positions.push(p.x,p.y,p.z);for(const triangle of face.triangles){g.indices.push(...triangle.map(i=>i+start));g.owners.push(face.objectID);g.surfaces.push(face.surface);}g.ranges.push({start,count:face.vertices.length,id:face.objectID});groups.set(key,g);
  }
  return[...groups.values()].map(g=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(g.positions,3));geometry.setIndex(g.indices);const colors=new THREE.Float32BufferAttribute(new Float32Array(g.positions.length),3);geometry.setAttribute('color',colors);
    const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.FrontSide,transparent:true,opacity:AFFECTED_OPACITY,depthWrite:false,clippingPlanes:[clipping],polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=1;mesh.userData={role:`affected-${g.kind}`,surfaceKind:g.surfaceKind,triangleOwners:g.owners,triangleSurfaces:g.surfaces};
    const normal=new THREE.Color(AFFECTED_COLORS[g.kind].face),selected=new THREE.Color(AFFECTED_COLORS[g.kind].line);
    const updateColors=(selection:string|ReadonlySet<string>|undefined,_fills:boolean)=>{const ids=new Set(typeof selection==='string'?[selection]:selection);for(const r of g.ranges){const c=ids.has(r.id)?selected:normal;for(let i=r.start;i<r.start+r.count;i++)colors.setXYZ(i,c.r,c.g,c.b);}colors.needsUpdate=true;};
    updateColors(undefined,true);return{mesh,updateColors};
  });
}
