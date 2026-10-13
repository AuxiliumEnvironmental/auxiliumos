import type { Floor, Point2, Room, Wall, WallReference } from '../types';

// Numerical tolerance matches SpatialCore. It is not a measurement accuracy claim.
export const EPSILON = 1e-6;
export const finitePoint = (p: Point2): boolean => Number.isFinite(p.x) && Number.isFinite(p.z);
export const distance = (a: Point2, b: Point2): number => Math.hypot(b.x - a.x, b.z - a.z);
export const interpolate = (a: Point2, b: Point2, t: number): Point2 => ({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
export const cross = (a: Point2, b: Point2, c: Point2): number => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
export function signedArea(p: Point2[]): number {
  return p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.z-b.x*a.z;},0)/2;
}
export function onSegment(p: Point2,a: Point2,b: Point2): boolean {
  return Math.abs(cross(a,b,p))<=EPSILON && p.x>=Math.min(a.x,b.x)-EPSILON && p.x<=Math.max(a.x,b.x)+EPSILON && p.z>=Math.min(a.z,b.z)-EPSILON && p.z<=Math.max(a.z,b.z)+EPSILON;
}
export function intersects(a: Point2,b: Point2,c: Point2,d: Point2): boolean {
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return (((abC>EPSILON&&abD< -EPSILON)||(abC< -EPSILON&&abD>EPSILON))&&((cdA>EPSILON&&cdB< -EPSILON)||(cdA< -EPSILON&&cdB>EPSILON))) || onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d);
}
export function isSimplePath(p: Point2[]): boolean {
  if(p.length<2||!p.every(finitePoint))return false;
  for(let i=0;i<p.length-1;i++){
    if(distance(p[i],p[i+1])<=EPSILON)return false;
    if(i>0&&Math.abs(cross(p[i-1],p[i],p[i+1]))<=EPSILON&&((p[i-1].x-p[i].x)*(p[i+1].x-p[i].x)+(p[i-1].z-p[i].z)*(p[i+1].z-p[i].z))>EPSILON)return false;
    for(let j=i+2;j<p.length-1;j++)if(intersects(p[i],p[i+1],p[j],p[j+1]))return false;
  }return true;
}
export function isSimplePolygon(p: Point2[]): boolean {
  if(p.length<3||!p.every(finitePoint)||Math.abs(signedArea(p))<=EPSILON)return false;
  for(let i=0;i<p.length;i++){
    const next=(i+1)%p.length,prev=p[(i+p.length-1)%p.length];
    if(distance(p[i],p[next])<EPSILON)return false;
    if(Math.abs(cross(prev,p[i],p[next]))<=EPSILON&&((prev.x-p[i].x)*(p[next].x-p[i].x)+(prev.z-p[i].z)*(p[next].z-p[i].z))>EPSILON)return false;
    for(let j=i+1;j<p.length;j++){const jn=(j+1)%p.length;if(next===j||jn===i)continue;if(intersects(p[i],p[next],p[j],p[jn]))return false;}
  }return true;
}
/** Per-operation index. No cached geometry survives a document revision. */
export class FloorGeometryIndex {
  readonly nodes=new Map<string,Point2>();readonly walls=new Map<string,Wall>();
  constructor(floor: Floor){for(const n of floor.nodes)if(!this.nodes.has(n.id))this.nodes.set(n.id,n.point);for(const w of floor.walls)if(!this.walls.has(w.id))this.walls.set(w.id,w);}
  path(wall: Wall): Point2[]{return wall.nodeIDs.map(id=>{const p=this.nodes.get(id);if(!p)throw new Error(`Missing node ${id}`);return p;});}
  boundary(room: Room): Point2[]{
    const sequence:string[]=[];
    for(const ref of room.boundary){const wall=this.walls.get(ref.wallID);if(!wall)throw new Error(`Missing wall ${ref.wallID}`);const ids=ref.reversed?[...wall.nodeIDs].reverse():wall.nodeIDs;
      if(ids.length<2)throw new Error('Invalid wall path');
      if(sequence.length){if(sequence.at(-1)!==ids[0])throw new Error('Room boundary must connect using shared node identifiers');sequence.push(...ids.slice(1));}else sequence.push(...ids);
    }
    if(sequence.length<4||sequence[0]!==sequence.at(-1))throw new Error('Room boundary must close explicitly');
    sequence.pop();return sequence.map(id=>{const p=this.nodes.get(id);if(!p)throw new Error(`Missing node ${id}`);return p;});
  }
}
export const wallPath=(floor: Floor,wall: Wall):Point2[]=>new FloorGeometryIndex(floor).path(wall);
export const roomBoundary=(floor: Floor,room: Room):Point2[]=>new FloorGeometryIndex(floor).boundary(room);
export const pathLength=(p: Point2[]):number=>p.slice(1).reduce((sum,b,i)=>sum+distance(p[i],b),0);
export function pathPoint(path: Point2[],offset: number): Point2 {
  if(path.length<2||!Number.isFinite(offset))throw new Error('Invalid path');const total=pathLength(path);
  if(offset< -EPSILON||offset>total+EPSILON)throw new Error('Path offset is outside the wall');
  let remaining=Math.max(0,Math.min(total,offset));
  for(let i=1;i<path.length;i++){const n=distance(path[i-1],path[i]);if(n<=EPSILON)continue;if(remaining<=n+EPSILON)return interpolate(path[i-1],path[i],Math.max(0,Math.min(1,remaining/n)));remaining-=n;}
  return {...path.at(-1)!};
}
export function contains(point: Point2,polygon: Point2[]):boolean {
  let inside=false;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];if(onSegment(point,a,b))return true;if((a.z>point.z)!==(b.z>point.z)&&point.x<(b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;
}
export const strictlyContains=(point: Point2,polygon: Point2[]):boolean=>contains(point,polygon)&&!polygon.some((a,i)=>onSegment(point,a,polygon[(i+1)%polygon.length]));
/** Ear clipping preserves source indices, including concave rooms. No hull or inferred closure. */
export function triangulate(points: Point2[]):number[][] {
  if(points.length>1000||!isSimplePolygon(points))throw new Error('Cannot triangulate an invalid or excessive polygon');
  const ring=points.map((_,i)=>i);if(signedArea(points)<0)ring.reverse();const triangles:number[][]=[];
  let changed=true;while(changed&&ring.length>3){changed=false;for(let i=0;i<ring.length;i++){const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length];if(Math.abs(cross(points[a],points[b],points[c]))<=EPSILON){ring.splice(i,1);changed=true;break;}}}
  while(ring.length>3){let found=false;for(let i=0;i<ring.length;i++){const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length];if(cross(points[a],points[b],points[c])<=EPSILON)continue;
      if(ring.some(j=>j!==a&&j!==b&&j!==c&&cross(points[a],points[b],points[j])>= -EPSILON&&cross(points[b],points[c],points[j])>= -EPSILON&&cross(points[c],points[a],points[j])>= -EPSILON))continue;
      triangles.push([a,b,c]);ring.splice(i,1);found=true;break;
    }if(!found)throw new Error('Polygon triangulation failed');
  }triangles.push(ring);return triangles;
}
export function closedRoomBoundary(floor: Floor,wallIDs: string[]):WallReference[]{
  if(wallIDs.length<3||wallIDs.length>1000||new Set(wallIDs).size!==wallIDs.length)throw new Error('Select one closed ring of distinct walls');
  const index=new FloorGeometryIndex(floor),incidents=new Map<string,string[]>();
  for(const id of wallIDs){const w=index.walls.get(id);if(!w||w.nodeIDs.length<2)throw new Error('Missing boundary wall');for(const n of [w.nodeIDs[0],w.nodeIDs.at(-1)!])incidents.set(n,[...(incidents.get(n)??[]),id]);}
  if([...incidents.values()].some(ids=>ids.length!==2))throw new Error('Boundary has a gap or fork');
  const first=[...wallIDs].sort()[0],wall=index.walls.get(first)!;let end=wall.nodeIDs.at(-1)!;const used=new Set([first]);let boundary:WallReference[]=[{wallID:first,reversed:false}];
  while(used.size<wallIDs.length){const next=incidents.get(end)?.find(id=>!used.has(id));if(!next)throw new Error('Multiple disconnected room rings');const w=index.walls.get(next)!;const reversed=w.nodeIDs.at(-1)===end;boundary.push({wallID:next,reversed});used.add(next);end=reversed?w.nodeIDs[0]:w.nodeIDs.at(-1)!;}
  if(end!==wall.nodeIDs[0])throw new Error('Room boundary is open');const polygon=index.boundary({id:'boundary-check',label:'Boundary',boundary});if(!isSimplePolygon(polygon))throw new Error('Room boundary is not simple');
  if(signedArea(polygon)<0)boundary=boundary.reverse().map(r=>({wallID:r.wallID,reversed:!r.reversed}));return boundary;
}
