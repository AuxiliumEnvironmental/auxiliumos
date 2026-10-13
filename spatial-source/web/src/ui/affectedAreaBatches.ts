import * as THREE from 'three';
import type { GraphicScene, SceneFace, SurfaceRef } from '../types';
import type { SceneBatch } from './sceneBatches';
import { AFFECTED_COLORS, AFFECTED_OPACITY, affectedKind } from '../affectedAreaPalette';
/** Bounded per-kind/per-host-role batches. Winding and FrontSide retain wall side. */
export function batchAffectedFaces(scene:GraphicScene,clipping:THREE.Plane):SceneBatch[]{
  const groups=new Map<string,{kind:'moisture'|'fire';surfaceKind:SurfaceRef['kind'];positions:number[];indices:number[];owners:string[];surfaces:SurfaceRef[];ranges:{start:number;count:number;id:string;ceilingID?:string}[]}>();
  for(const face of scene.faces){const kind=affectedKind(face.role);if(!kind)continue;if(!face.surface)throw new Error('An observation face needs its explicit surface.');
    const key=`${kind}:${face.surface.kind}`,g=groups.get(key)??{kind,surfaceKind:face.surface.kind,positions:[],indices:[],owners:[],surfaces:[],ranges:[]},start=g.positions.length/3;
    for(const p of face.vertices)g.positions.push(p.x,p.y,p.z);for(const triangle of face.triangles){g.indices.push(...triangle.map(i=>i+start));g.owners.push(face.objectID);g.surfaces.push(face.surface);}g.ranges.push({start,count:face.vertices.length,id:face.objectID,...(face.surface.kind==='ceiling'?{ceilingID:face.surface.ceilingID}:{})});groups.set(key,g);
  }
  return[...groups.values()].map(g=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(g.positions,3));geometry.setIndex(g.indices);const colors=new THREE.Float32BufferAttribute(new Float32Array(g.positions.length),3);geometry.setAttribute('color',colors);
    const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.FrontSide,transparent:true,opacity:AFFECTED_OPACITY,depthWrite:false,clippingPlanes:[clipping],polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=1;mesh.userData={role:`affected-${g.kind}`,surfaceKind:g.surfaceKind,triangleOwners:g.owners,triangleSurfaces:g.surfaces};
    const normal=new THREE.Color(AFFECTED_COLORS[g.kind].face),selected=new THREE.Color(AFFECTED_COLORS[g.kind].line);
    const updateColors=(selection:string|ReadonlySet<string>|undefined,_fills:boolean)=>{const ids=new Set(typeof selection==='string'?[selection]:selection);for(const r of g.ranges){const c=ids.has(r.id)?selected:normal;for(let i=r.start;i<r.start+r.count;i++)colors.setXYZ(i,c.r,c.g,c.b);}colors.needsUpdate=true;};
    const originalIndices=Array.from(geometry.getIndex()!.array);
    const setHiddenObjects=(ids:ReadonlySet<string>)=>{const index=geometry.getIndex()!;for(let t=0;t<g.owners.length;t++){const start=t*3,hidden=ids.has(g.owners[t]);for(let v=0;v<3;v++)index.setX(start+v,originalIndices[start+(hidden?0:v)]);}index.needsUpdate=true;};
    let previewing=false;
    const previewCeilingHeights=(heights:ReadonlyMap<string,number>|null)=>{
      if(g.surfaceKind!=='ceiling'||!heights&&!previewing)return;const positions=geometry.getAttribute('position') as THREE.BufferAttribute;
      for(const range of g.ranges){const height=range.ceilingID?heights?.get(range.ceilingID):undefined;for(let i=range.start;i<range.start+range.count;i++)positions.setY(i,height===undefined?g.positions[i*3+1]:height-.001);}
      positions.needsUpdate=true;geometry.computeBoundingSphere();previewing=!!heights;
    };
    const setObjectVisible=(id:string,visible:boolean)=>{const index=geometry.getIndex()!;for(let t=0;t<g.owners.length;t++)if(g.owners[t]===id)for(let v=0;v<3;v++)index.setX(t*3+v,originalIndices[t*3+(visible?v:0)]);index.needsUpdate=true;};
    const updateObjectVertices=(id:string,faces:SceneFace[])=>{const ranges=g.ranges.filter(r=>r.id===id),points=faces.flatMap(f=>f.vertices);if(ranges.reduce((n,r)=>n+r.count,0)!==points.length)throw new Error('Observation preview topology changed.');let cursor=0;const positions=geometry.getAttribute('position');for(const range of ranges)for(let i=range.start;i<range.start+range.count;i++){const p=points[cursor++];positions.setXYZ(i,p.x,p.y,p.z);}positions.needsUpdate=true;geometry.computeBoundingSphere();};
    updateColors(undefined,true);return{mesh,updateColors,setHiddenObjects,previewCeilingHeights,setObjectVisible,updateObjectVertices};
  });
}
