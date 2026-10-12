import * as THREE from 'three';
import { batchAffectedFaces } from './affectedAreaBatches';
import { affectedKind } from '../affectedAreaPalette';
import type { GraphicScene } from '../types';
import { structuralSurfaceRole, surfaceLinearRGB, type StructuralSurfaceRole } from '../surfacePalette';

type Range = { start: number; count: number; objectID: string };
export interface SceneBatch { mesh: THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>; updateColors: (selection: string|ReadonlySet<string>|undefined, fills: boolean) => void }
/** Constant draw-call groups retain canonical per-triangle ownership for picking. */
export function batchSceneFaces(scene: GraphicScene, clipping: THREE.Plane): SceneBatch[] {
  const groups = new Map<StructuralSurfaceRole, { positions: number[]; indices: number[]; owners: string[]; ranges: Range[] }>();
  for(const face of scene.faces){if(affectedKind(face.role))continue;const key=structuralSurfaceRole(face.role);const group=groups.get(key)??{positions:[],indices:[],owners:[],ranges:[]};const start=group.positions.length/3;for(const p of face.vertices)group.positions.push(p.x,p.y,p.z);for(const triangle of face.triangles){group.indices.push(start+triangle[0],start+triangle[1],start+triangle[2]);group.owners.push(face.objectID);}group.ranges.push({start,count:face.vertices.length,objectID:face.objectID});groups.set(key,group);}
  const structural=[...groups].map(([role,group])=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(group.positions,3));geometry.setIndex(group.indices);const colors=new THREE.Float32BufferAttribute(new Float32Array(group.positions.length),3);geometry.setAttribute('color',colors);
    const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,clippingPlanes:[clipping]});const mesh=new THREE.Mesh(geometry,material);mesh.userData={role,triangleOwners:group.owners};
    const baseColor = new THREE.Color(...surfaceLinearRGB(role)), selectedColor = new THREE.Color(...surfaceLinearRGB(role, true));
    // Fill-disabled mode retains the existing white bodies and blue selection affordance.
    const plainColor = new THREE.Color('#fff'), plainSelectedColor = new THREE.Color('#a5cee4');
    let previousIDs=new Set<string>(),previousFills:boolean|undefined;
    const updateColors=(selection:string|ReadonlySet<string>|undefined,fills:boolean)=>{const selectedIDs=new Set(typeof selection==='string'?[selection]:selection),all=previousFills!==fills,base=fills?baseColor:plainColor,selected=fills?selectedColor:plainSelectedColor;let changed=false;for(const range of group.ranges){if(!all&&previousIDs.has(range.objectID)===selectedIDs.has(range.objectID))continue;const color=selectedIDs.has(range.objectID)?selected:base;for(let i=range.start;i<range.start+range.count;i++)colors.setXYZ(i,color.r,color.g,color.b);changed=true;}if(changed)colors.needsUpdate=true;previousIDs=selectedIDs;previousFills=fills;};
    updateColors(undefined,true);return{mesh,updateColors};
  });
  return [...structural,...batchAffectedFaces(scene,clipping)];
}
