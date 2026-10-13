import * as THREE from 'three';
import type { GraphicScene } from '../types';
import { spatialFaceRole, spatialFaceLinearRGB, type SpatialFaceRole } from '../surfacePalette';

type Range = { start: number; count: number; objectID: string };
export interface SceneBatch { mesh: THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>; setHiddenObjects: (ids: ReadonlySet<string>) => void; previewCeilingHeights: (heights: ReadonlyMap<string,number>|null) => void; updateColors: (selection: string|ReadonlySet<string>|undefined, fills: boolean) => void }
/** Constant draw-call groups retain canonical per-triangle ownership for picking. */
export function batchSceneFaces(scene: GraphicScene, clipping: THREE.Plane): SceneBatch[] {
  const groups = new Map<SpatialFaceRole, { positions: number[]; indices: number[]; owners: string[]; ranges: Range[] }>();
  for(const face of scene.faces){const key=spatialFaceRole(face.role);const group=groups.get(key)??{positions:[],indices:[],owners:[],ranges:[]};const start=group.positions.length/3;for(const p of face.vertices)group.positions.push(p.x,p.y,p.z);for(const triangle of face.triangles){group.indices.push(start+triangle[0],start+triangle[1],start+triangle[2]);group.owners.push(face.objectID);}group.ranges.push({start,count:face.vertices.length,objectID:face.objectID});groups.set(key,group);}
  return [...groups].map(([role,group])=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(group.positions,3));geometry.setIndex(group.indices);const colors=new THREE.Float32BufferAttribute(new Float32Array(group.positions.length),3);geometry.setAttribute('color',colors);
    const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1,clippingPlanes:[clipping]});const mesh=new THREE.Mesh(geometry,material);mesh.userData={role,triangleOwners:group.owners};
    const baseColor = new THREE.Color(...spatialFaceLinearRGB(role)), selectedColor = new THREE.Color(...spatialFaceLinearRGB(role, true));
    // Fill-disabled mode retains the existing white bodies and blue selection affordance.
    const plainColor = new THREE.Color('#fff'), plainSelectedColor = new THREE.Color('#a5cee4');
    let previousIDs=new Set<string>(),previousFills:boolean|undefined;
    const updateColors=(selection:string|ReadonlySet<string>|undefined,fills:boolean)=>{const selectedIDs=new Set(typeof selection==='string'?[selection]:selection),all=previousFills!==fills,base=fills?baseColor:plainColor,selected=fills?selectedColor:plainSelectedColor;let changed=false;for(const range of group.ranges){if(!all&&previousIDs.has(range.objectID)===selectedIDs.has(range.objectID))continue;const color=selectedIDs.has(range.objectID)?selected:base;for(let i=range.start;i<range.start+range.count;i++)colors.setXYZ(i,color.r,color.g,color.b);changed=true;}if(changed)colors.needsUpdate=true;previousIDs=selectedIDs;previousFills=fills;};
    const originalIndices = Array.from(geometry.getIndex()!.array);
    const setHiddenObjects = (ids: ReadonlySet<string>) => {
      const index = geometry.getIndex()!;
      for (let triangle = 0; triangle < group.owners.length; triangle++) {
        const start = triangle * 3, hidden = ids.has(group.owners[triangle]);
        for (let vertex = 0; vertex < 3; vertex++) index.setX(start + vertex, originalIndices[start + (hidden ? 0 : vertex)]);
      }
      index.needsUpdate = true;
    };
    let previewing=false;
    const previewCeilingHeights=(heights:ReadonlyMap<string,number>|null)=>{
      if(role!=='ceiling'||!heights&&!previewing)return;const positions=geometry.getAttribute('position') as THREE.BufferAttribute;
      for(const range of group.ranges)for(let i=range.start;i<range.start+range.count;i++)positions.setY(i,heights?.get(range.objectID)??group.positions[i*3+1]);
      positions.needsUpdate=true;geometry.computeBoundingSphere();previewing=!!heights;
    };
    updateColors(undefined,true);return{mesh,updateColors,setHiddenObjects,previewCeilingHeights};
  });
}
