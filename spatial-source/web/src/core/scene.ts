import type { Floor, GraphicScene, Opening, Point3, SceneFace, SpatialDocument } from '../types';
import { distance, EPSILON, FloorGeometryIndex, pathPoint, triangulate } from './geometry';
import { requireValidDocument } from './validation';

// Exact existing graphic-scene 1.0/1.1 transport limits. They are resource
// admission limits, not a smaller product operating envelope or a performance claim.
const MAX_FACES=200_000,MAX_EDGES=400_000,MAX_FACE_VERTICES=1000,MAX_FACE_TRIANGLES=1000;
function remainingWallSpans(holes:Opening[],height:number):[number,number][]{
  let cursor=0;const spans:[number,number][]=[];
  for(const h of [...holes].sort((a,b)=>a.bottom-b.bottom)){if(h.bottom>cursor+EPSILON)spans.push([cursor,h.bottom]);cursor=Math.max(cursor,h.bottom+h.height);}
  if(cursor<height-EPSILON)spans.push([cursor,height]);return spans;
}
/** Count exact output before allocating meshes; legal geometry can exceed scene limits. */
function preflightScene(floor:Floor,index:FloorGeometryIndex,groups:Map<string,Opening[]>):void{
  let faces=0,edges=0;
  const admit=()=>{if(faces>MAX_FACES)throw new Error(`Scene exceeds the ${MAX_FACES} face transport limit`);if(edges>MAX_EDGES)throw new Error(`Scene exceeds the ${MAX_EDGES} edge transport limit`);};
  const edge=(a:number,ay:number,b:number,by:number)=>{if(Math.abs(a-b)+Math.abs(ay-by)>EPSILON){edges++;admit();}};
  for(const wall of floor.walls){const path=index.path(wall);let breaks=[0];for(let i=1;i<path.length;i++)breaks.push(breaks.at(-1)!+distance(path[i-1],path[i]));const total=breaks.at(-1)!,openings=groups.get(wall.id)??[];
    breaks=[...new Set([...breaks,...openings.flatMap(o=>[o.offset,o.offset+o.width])])].sort((a,b)=>a-b);
    for(let i=1;i<breaks.length;i++){const lo=breaks[i-1],hi=breaks[i],mid=(lo+hi)/2;if(hi-lo<=EPSILON)continue;const holes=openings.filter(o=>mid>o.offset&&mid<o.offset+o.width);faces+=remainingWallSpans(holes,wall.height).length;admit();if(!holes.some(o=>o.bottom<=EPSILON))edge(lo,0,hi,0);if(!holes.some(o=>o.bottom+o.height>=wall.height-EPSILON))edge(lo,wall.height,hi,wall.height);}
    for(const end of [0,total])for(const [bottom,top]of remainingWallSpans(openings.filter(o=>end>=o.offset-EPSILON&&end<=o.offset+o.width+EPSILON),wall.height))edge(end,bottom,end,top);
    for(const o of openings){const lo=o.offset,hi=lo+o.width;edge(lo,o.bottom,lo,o.bottom+o.height);edge(hi,o.bottom,hi,o.bottom+o.height);const spans=[lo,...breaks.filter(b=>b>lo&&b<hi),hi];for(let i=1;i<spans.length;i++){edge(spans[i-1],o.bottom,spans[i],o.bottom);edge(spans[i-1],o.bottom+o.height,spans[i],o.bottom+o.height);}}
  }
  for(const room of floor.rooms){const ring=index.boundary(room);if(ring.length>MAX_FACE_VERTICES||ring.length-2>MAX_FACE_TRIANGLES)throw new Error('Room exceeds the scene face vertex/triangle transport limit');faces++;admit();}
  for(const area of floor.areas??[]){edges+=area.polygon.length;admit();}
}

/** Exact semantic meshes. Door and window apertures are actual missing triangles. */
export function buildScene(document:SpatialDocument,floorID:string):GraphicScene{
  const doc=requireValidDocument(document),floor=doc.floors.find(f=>f.id===floorID);if(!floor)throw new Error(`Missing floor ${floorID}`);
  const index=new FloorGeometryIndex(floor),scene:GraphicScene={schemaVersion:'1.0.0',documentID:doc.documentID,revision:doc.revision,floorID,faces:[],edges:[]};
  const groups=new Map<string,Opening[]>();for(const o of floor.openings)groups.set(o.wallID,[...(groups.get(o.wallID)??[]),o]);
  preflightScene(floor,index,groups);
  for(const wall of floor.walls){const path=index.path(wall);let breaks=[0];for(let i=1;i<path.length;i++)breaks.push(breaks.at(-1)!+distance(path[i-1],path[i]));const total=breaks.at(-1)!,openings=groups.get(wall.id)??[],base=floor.elevation+wall.baseY;
    breaks=[...new Set([...breaks,...openings.flatMap(o=>[o.offset,o.offset+o.width])])].sort((a,b)=>a-b);
    const point=(s:number,y:number):Point3=>{const p=pathPoint(path,s);return{x:p.x,y:base+y,z:p.z};};
    const edge=(a:number,ay:number,b:number,by:number,objectID:string,role:string)=>{if(Math.abs(a-b)+Math.abs(ay-by)>EPSILON)scene.edges.push({objectID,role,a:point(a,ay),b:point(b,by)});};
    const remaining=(holes:Opening[]):[number,number][]=>remainingWallSpans(holes,wall.height);
    for(let i=1;i<breaks.length;i++){const lo=breaks[i-1],hi=breaks[i],mid=(lo+hi)/2;if(hi-lo<=EPSILON)continue;const holes=openings.filter(o=>mid>o.offset&&mid<o.offset+o.width);
      for(const [bottom,top]of remaining(holes))scene.faces.push({objectID:wall.id,role:'wall',vertices:[point(lo,bottom),point(hi,bottom),point(hi,top),point(lo,top)],triangles:[[0,1,2],[0,2,3]]});
      if(!holes.some(o=>o.bottom<=EPSILON))edge(lo,0,hi,0,wall.id,'wall');if(!holes.some(o=>o.bottom+o.height>=wall.height-EPSILON))edge(lo,wall.height,hi,wall.height,wall.id,'wall');
    }
    for(const end of [0,total])for(const [bottom,top]of remaining(openings.filter(o=>end>=o.offset-EPSILON&&end<=o.offset+o.width+EPSILON)))edge(end,bottom,end,top,wall.id,'wall');
    for(const o of openings){const lo=o.offset,hi=lo+o.width;edge(lo,o.bottom,lo,o.bottom+o.height,o.id,o.kind);edge(hi,o.bottom,hi,o.bottom+o.height,o.id,o.kind);const spans=[lo,...breaks.filter(b=>b>lo&&b<hi),hi];for(let i=1;i<spans.length;i++){edge(spans[i-1],o.bottom,spans[i],o.bottom,o.id,o.kind);edge(spans[i-1],o.bottom+o.height,spans[i],o.bottom+o.height,o.id,o.kind);}}
  }
  for(const room of floor.rooms){const ring=index.boundary(room);scene.faces.push({objectID:room.id,role:'floor',vertices:ring.map(p=>({x:p.x,y:floor.elevation,z:p.z})),triangles:triangulate(ring).map(t=>[...t].reverse())});}
  if(floor.areas?.length){scene.schemaVersion='1.1.0';for(const area of floor.areas)for(let i=0;i<area.polygon.length;i++){const a=area.polygon[i],b=area.polygon[(i+1)%area.polygon.length];scene.edges.push({objectID:area.id,role:'area',a:{...a,y:floor.elevation},b:{...b,y:floor.elevation}});}}
  // Defense against a future emitter change diverging from the exact preflight.
  if(scene.faces.length>MAX_FACES||scene.edges.length>MAX_EDGES||scene.faces.some(f=>f.vertices.length>MAX_FACE_VERTICES||f.triangles.length>MAX_FACE_TRIANGLES))throw new Error('Generated scene exceeds the transport capacity limits');
  return scene;
}
const subtract=(a:Point3,b:Point3):Point3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const cross=(a:Point3,b:Point3):Point3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const dot=(a:Point3,b:Point3):number=>a.x*b.x+a.y*b.y+a.z*b.z;
const finite=(p:Point3):boolean=>[p.x,p.y,p.z].every(Number.isFinite);
export function segmentTriangleHit(origin:Point3,target:Point3,a:Point3,b:Point3,c:Point3):number|undefined{
  const direction=subtract(target,origin),e1=subtract(b,a),e2=subtract(c,a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<=1e-10)return;
  const inverse=1/det,s=subtract(origin,a),u=dot(s,h)*inverse;if(u< -1e-9||u>1+1e-9)return;const q=cross(s,e1),v=dot(direction,q)*inverse;if(v< -1e-9||u+v>1+1e-9)return;const t=dot(e2,q)*inverse;return t>0&&t<=1?t:undefined;
}
export interface CutawayResult {hiddenWallIDs:Set<string>;hiddenCeilingRoomIDs:Set<string>;explanation:string}
/** Presentation-only cutaway intersects real triangles, so voids do not occlude. */
export function evaluateCutaway(scene:GraphicScene,camera:Point3,focus:Point3,probeRadius=0.45,ceilings:SceneFace[]=[]):CutawayResult{
  const hiddenWallIDs=new Set<string>(),hiddenCeilingRoomIDs=new Set<string>();
  if(!finite(camera)||!finite(focus)||!Number.isFinite(probeRadius)||probeRadius<0||probeRadius>5||scene.faces.length+ceilings.length>100000)return{hiddenWallIDs,hiddenCeilingRoomIDs,explanation:'Cutaway unavailable for this viewpoint.'};
  const probes=[focus,{...focus,x:focus.x+probeRadius},{...focus,x:focus.x-probeRadius},{...focus,z:focus.z+probeRadius},{...focus,z:focus.z-probeRadius}];
  for(const face of [...scene.faces,...ceilings]){if((face.role!=='wall'&&face.role!=='ceiling')||face.vertices.length>1000||face.triangles.length>2000||!face.vertices.every(finite))continue;
    const occludes=face.triangles.some(t=>t.length===3&&t.every(i=>Number.isSafeInteger(i)&&i>=0&&i<face.vertices.length)&&probes.some(probe=>{const hit=segmentTriangleHit(camera,probe,face.vertices[t[0]],face.vertices[t[1]],face.vertices[t[2]]);return hit!==undefined&&hit>0.000001&&hit<0.999999;}));
    if(occludes)(face.role==='wall'?hiddenWallIDs:hiddenCeilingRoomIDs).add(face.objectID);
  }
  return{hiddenWallIDs,hiddenCeilingRoomIDs,explanation:hiddenWallIDs.size||hiddenCeilingRoomIDs.size?`Cutaway hides ${hiddenWallIDs.size} near walls and ${hiddenCeilingRoomIDs.size} display ceilings. Wall and opening outlines remain.`:'Cutaway: no surfaces obstruct this viewpoint.'};
}
export function displayCeilings(document:SpatialDocument,floorID:string):SceneFace[]{
  const doc=requireValidDocument(document),floor=doc.floors.find(f=>f.id===floorID);if(!floor)throw new Error(`Missing floor ${floorID}`);const index=new FloorGeometryIndex(floor),faces:SceneFace[]=[];
  for(const room of floor.rooms){const tops=room.boundary.map(r=>{const w=index.walls.get(r.wallID)!;return floor.elevation+w.baseY+w.height;});if(!tops.every(y=>Math.abs(y-tops[0])<=EPSILON))continue;const ring=index.boundary(room);faces.push({objectID:room.id,role:'ceiling',vertices:ring.map(p=>({...p,y:tops[0]})),triangles:triangulate(ring)});}return faces;
}
export interface SceneRayHit{objectID:string;role:string;distance:number;point:Point3}
export function nearestSceneHit(scene:GraphicScene,origin:Point3,direction:Point3,maximumDistance=2000,hiddenWalls=new Set<string>()):SceneRayHit|undefined{
  if(!finite(origin)||!finite(direction)||!Number.isFinite(maximumDistance)||maximumDistance<=0||maximumDistance>30000||scene.faces.length>100000)return;const length=Math.hypot(direction.x,direction.y,direction.z);if(length<=1e-12)return;const end={x:origin.x+direction.x/length*maximumDistance,y:origin.y+direction.y/length*maximumDistance,z:origin.z+direction.z/length*maximumDistance};let best:SceneRayHit|undefined;
  for(const face of scene.faces){if(face.role==='wall'&&hiddenWalls.has(face.objectID)||face.vertices.length>1000||face.triangles.length>2000||!face.vertices.every(finite))continue;for(const t of face.triangles){if(t.length!==3||!t.every(i=>Number.isSafeInteger(i)&&i>=0&&i<face.vertices.length))continue;const hit=segmentTriangleHit(origin,end,face.vertices[t[0]],face.vertices[t[1]],face.vertices[t[2]]);if(hit!==undefined&&(!best||hit*maximumDistance<best.distance))best={objectID:face.objectID,role:face.role,distance:hit*maximumDistance,point:{x:origin.x+(end.x-origin.x)*hit,y:origin.y+(end.y-origin.y)*hit,z:origin.z+(end.z-origin.z)*hit}};}}
  return best;
}
