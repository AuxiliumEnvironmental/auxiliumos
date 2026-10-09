import * as THREE from 'three';
import type { GraphicScene } from '../types';

type Range = { start: number; count: number; objectID: string };
export interface SceneBatch { mesh: THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>; updateColors: (selectedID: string|undefined, fills: boolean) => void }
/** Constant draw-call groups retain canonical per-triangle ownership for picking. */
export function batchSceneFaces(scene: GraphicScene, clipping: THREE.Plane): SceneBatch[] {
  const groups = new Map<string, { positions: number[]; indices: number[]; owners: string[]; ranges: Range[] }>();
  for(const face of scene.faces){const key=face.role==='floor'?'floor':'wall';const group=groups.get(key)??{positions:[],indices:[],owners:[],ranges:[]};const start=group.positions.length/3;for(const p of face.vertices)group.positions.push(p.x,p.y,p.z);for(const triangle of face.triangles){group.indices.push(start+triangle[0],start+triangle[1],start+triangle[2]);group.owners.push(face.objectID);}group.ranges.push({start,count:face.vertices.length,objectID:face.objectID});groups.set(key,group);}
  return [...groups].map(([role,group])=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(group.positions,3));geometry.setIndex(group.indices);const colors=new THREE.Float32BufferAttribute(new Float32Array(group.positions.length),3);geometry.setAttribute('color',colors);
    const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,clippingPlanes:[clipping]});const mesh=new THREE.Mesh(geometry,material);mesh.userData={role,triangleOwners:group.owners};
    let previousID:string|undefined,previousFills:boolean|undefined;
    const updateColors=(selectedID:string|undefined,fills:boolean)=>{const all=previousFills!==fills,base=new THREE.Color(!fills?'#fff':role==='floor'?'#e0ebf0':'#edf3f6'),selected=new THREE.Color('#a5cee4');for(const range of group.ranges){if(!all&&range.objectID!==previousID&&range.objectID!==selectedID)continue;const color=range.objectID===selectedID?selected:base;for(let i=range.start;i<range.start+range.count;i++)colors.setXYZ(i,color.r,color.g,color.b);}colors.needsUpdate=true;previousID=selectedID;previousFills=fills;};
    updateColors(undefined,true);return{mesh,updateColors};
  });
}
