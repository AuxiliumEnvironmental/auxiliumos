import type { Opening, Point2, SpatialDocument, WalkMove, WalkPortal, WalkPosition, WalkRestriction, WalkSettings, WalkStop } from '../types';
import { distance, EPSILON, finitePoint, FloorGeometryIndex, interpolate, onSegment, pathPoint, signedArea, strictlyContains, triangulate } from './geometry';
import { requireValidDocument } from './validation';

interface Region{id:string;polygon:Point2[];minX:number;maxX:number;minZ:number;maxZ:number}
interface Barrier{id:string;a:Point2;b:Point2}
const regionContains=(r:Region,p:Point2):boolean=>p.x>r.minX&&p.x<r.maxX&&p.z>r.minZ&&p.z<r.maxZ&&strictlyContains(p,r.polygon);
const defaults:WalkSettings={radius:0.18,eyeHeight:1.6,headClearance:0.15,maximumMove:32};
/** Display navigation is revision-bound. It makes no physical clearance or egress assertion. */
export class WalkNavigation {
  readonly documentID:string;readonly revision:number;readonly floorID:string;readonly elevation:number;
  readonly settings:WalkSettings;readonly portals:WalkPortal[];readonly restrictions:WalkRestriction[];readonly roomIDs:string[];
  private readonly regions:Region[];private readonly barriers:Barrier[];
  constructor(document:SpatialDocument,floorID:string,settings:Partial<WalkSettings>={}){
    this.settings=Object.freeze({...defaults,...settings});const s=this.settings;
    if(![s.radius,s.eyeHeight,s.headClearance,s.maximumMove].every(Number.isFinite)||s.radius<0.05||s.radius>0.5||s.eyeHeight<0.5||s.eyeHeight>2.5||s.headClearance<0||s.headClearance>0.5||s.maximumMove<0.1||s.maximumMove>100)throw new Error('Invalid display navigation settings');
    const doc=requireValidDocument(document),floor=doc.floors.find(f=>f.id===floorID);if(!floor)throw new Error(`Missing floor ${floorID}`);
    if(floor.rooms.length>1000||floor.walls.length>10000||floor.walls.reduce((n,w)=>n+w.nodeIDs.length-1,0)>20000||floor.rooms.reduce((n,r)=>n+r.boundary.length,0)>20000)throw new Error('Layout exceeds the bounded navigation work limit');
    this.documentID=doc.documentID;this.revision=doc.revision;this.floorID=floorID;this.elevation=floor.elevation;
    const index=new FloorGeometryIndex(floor);this.regions=floor.rooms.map(room=>{const p=index.boundary(room);return{id:room.id,polygon:p,minX:Math.min(...p.map(p=>p.x)),maxX:Math.max(...p.map(p=>p.x)),minZ:Math.min(...p.map(p=>p.z)),maxZ:Math.max(...p.map(p=>p.z))};});
    this.roomIDs=this.regions.map(r=>r.id);const byID=new Map(this.regions.map(r=>[r.id,r]));const refs=new Map<string,string[]>();for(const r of floor.rooms)for(const w of r.boundary)refs.set(w.wallID,[...(refs.get(w.wallID)??[]),r.id]);
    const groups=new Map<string,Opening[]>();for(const o of floor.openings)groups.set(o.wallID,[...(groups.get(o.wallID)??[]),o]);
    const portals:WalkPortal[]=[],restrictions:WalkRestriction[]=[],barriers:Barrier[]=[];
    for(const wall of floor.walls){const path=index.path(wall),offsets=[0];for(let i=1;i<path.length;i++)offsets.push(offsets.at(-1)!+distance(path[i-1],path[i]));const accepted:{opening:Opening;segment:number}[]=[];
      for(const o of groups.get(wall.id)??[]){let reason:string|undefined;const adjacent=refs.get(wall.id)??[];const segment=path.slice(1).findIndex((_,i)=>o.offset>=offsets[i]-EPSILON&&o.offset+o.width<=offsets[i+1]+EPSILON);
        if(o.kind==='window')reason='Windows are not walk portals.';
        else if(adjacent.length!==2)reason='The opening does not connect two explicitly modeled rooms.';
        else if(o.provenance.origin==='inferred')reason='Inferred openings require explicit correction before navigation.';
        else if(Math.abs(wall.baseY+o.bottom)>EPSILON||wall.baseY+o.bottom+o.height<s.eyeHeight+s.headClearance)reason='The display body does not fit a floor-level opening.';
        else if(o.width<=s.radius*2+EPSILON)reason='The opening is too narrow for the display collision radius.';
        else if(segment<0)reason='An opening across a wall bend needs explicit review.';
        if(!reason){const first=byID.get(adjacent[0])!,second=byID.get(adjacent[1])!,a=pathPoint(path,o.offset),b=pathPoint(path,o.offset+o.width),length=distance(a,b),normal={x:-(b.z-a.z)/length,z:(b.x-a.x)/length},inward=s.radius+0.001;let side:boolean|undefined;
          const compatible=[s.radius/length,0.5,1-s.radius/length].every(t=>{const mid=interpolate(a,b,t),left={x:mid.x+normal.x*inward,z:mid.z+normal.z*inward},right={x:mid.x-normal.x*inward,z:mid.z-normal.z*inward};const fl=regionContains(first,left)&&regionContains(second,right),fr=regionContains(first,right)&&regionContains(second,left);if(fl===fr||this.regions.filter(r=>regionContains(r,left)).length!==1||this.regions.filter(r=>regionContains(r,right)).length!==1)return false;if(side!==undefined)return side===fl;side=fl;return true;});
          if(compatible){accepted.push({opening:o,segment});portals.push({openingID:o.id,wallID:wall.id,roomIDs:[...adjacent].sort(),a,b});}else reason='The rooms do not have unambiguous opposite interiors at this opening.';
        }if(reason)restrictions.push({openingID:o.id,reason});
      }
      for(let i=0;i<path.length-1;i++){let cursor=offsets[i];for(const {opening:o}of accepted.filter(a=>a.segment===i).sort((a,b)=>a.opening.offset-b.opening.offset)){if(o.offset>cursor+EPSILON)barriers.push({id:wall.id,a:pathPoint(path,cursor),b:pathPoint(path,o.offset)});cursor=Math.max(cursor,o.offset+o.width);}if(cursor<offsets[i+1]-EPSILON)barriers.push({id:wall.id,a:pathPoint(path,cursor),b:path[i+1]});}
    }
    const byIdentifier=(a:{openingID:string},b:{openingID:string}):number=>a.openingID<b.openingID?-1:a.openingID>b.openingID?1:0;
    this.portals=portals.sort(byIdentifier);this.restrictions=restrictions.sort(byIdentifier);this.barriers=barriers;
    // A UI must not be able to turn a blocked gap into a portal by mutating the
    // published navigation summary. Rebuild from a new validated revision.
    for(const p of this.portals){Object.freeze(p.a);Object.freeze(p.b);Object.freeze(p.roomIDs);Object.freeze(p);}for(const r of this.restrictions)Object.freeze(r);Object.freeze(this.portals);Object.freeze(this.restrictions);Object.freeze(this.roomIDs);
  }
  start(roomID:string):WalkPosition{
    const region=this.regions.find(r=>r.id===roomID);if(!region)throw new Error(`No modeled room ${roomID}`);const p=region.polygon,triangles=triangulate(p),area=signedArea(p);let cx=0,cz=0;
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],cross=a.x*b.z-b.x*a.z;cx+=(a.x+b.x)*cross;cz+=(a.z+b.z)*cross;}
    const candidates:Point2[]=[{x:cx/(6*area),z:cz/(6*area)}];for(const t of triangles){const[a,b,c]=t.map(i=>p[i]),la=distance(b,c),lb=distance(a,c),lc=distance(a,b),sum=la+lb+lc;candidates.push({x:(la*a.x+lb*b.x+lc*c.x)/sum,z:(la*a.z+lb*b.z+lc*c.z)/sum},{x:(a.x+b.x+c.x)/3,z:(a.z+b.z+c.z)/3});}
    let best:Point2|undefined,clearance=-Infinity;for(const candidate of candidates){if(this.uniqueRoom(candidate)!==roomID)continue;const d=this.clearance(candidate);if(d>=this.settings.radius+1e-6&&d>clearance){best=candidate;clearance=d;}}
    if(!best)throw new Error(`No safe modeled starting position was found in room ${roomID}`);return this.position(best,roomID);
  }
  place(point:Point2):WalkPosition{const room=this.uniqueRoom(point);if(!finitePoint(point)||!room||this.clearance(point)<this.settings.radius+1e-6)throw new Error('Choose a clear position inside one modeled room');return this.position({...point},room);}
  move(start:WalkPosition,target:Point2):WalkMove{
    if(start.documentID!==this.documentID||start.revision!==this.revision||start.floorID!==this.floorID||start.eyeY!==this.elevation+this.settings.eyeHeight)throw new Error('The floor or geometry revision changed. Choose a new starting room.');
    if(!finitePoint(start.point)||this.room(start.point,start.roomID)!==start.roomID||this.clearance(start.point)<this.settings.radius-1e-7)throw new Error('Unsafe navigation starting position');
    const unchanged=(stop:WalkStop):WalkMove=>({position:structuredClone(start),requested:{...target},reachedTarget:false,stop,crossedPortalIDs:[]});
    if(!finitePoint(target))return unchanged('invalidTarget');const length=distance(start.point,target);if(length>this.settings.maximumMove)return unchanged('requestTooLong');if(length<=EPSILON)return{position:structuredClone(start),requested:{...target},reachedTarget:true,crossedPortalIDs:[]};
    let limit=1,stop:WalkStop|undefined,blockingObjectID:string|undefined;
    for(const barrier of this.barriers){const t=capsuleEntry(start.point,target,barrier.a,barrier.b,this.settings.radius);if(t!==undefined&&t<limit){limit=t;stop='wall';blockingObjectID=barrier.id;}}
    let events=[0,1];for(const region of this.regions)for(let i=0;i<region.polygon.length;i++)events.push(...intersectionTimes(start.point,target,region.polygon[i],region.polygon[(i+1)%region.polygon.length]));events=[...new Set(events)].sort((a,b)=>a-b);
    for(let i=1;i<events.length;i++){if(events[i]-events[i-1]<=1e-12)continue;const t=events[i-1];if(t>=limit)break;const mid=interpolate(start.point,target,(t+events[i])/2),inside=this.regions.filter(r=>regionContains(r,mid));if(inside.length!==1){const alongPortal=!inside.length&&this.portals.some(p=>onSegment(mid,p.a,p.b));if(!alongPortal){limit=t;stop=inside.length>1?'ambiguousRooms':'unknownBoundary';blockingObjectID=undefined;break;}}}
    const reachedTarget=stop===undefined,safeT=reachedTarget?1:Math.max(0,limit-0.00001/length),end=interpolate(start.point,target,safeT),room=this.room(end,start.roomID);if(!room)return unchanged('unknownBoundary');
    const crossedPortalIDs=this.portals.filter(p=>intersectionTimes(start.point,end,p.a,p.b).some(t=>t>=0&&t<=1)).map(p=>p.openingID);
    return{position:this.position(end,room),requested:{...target},reachedTarget,stop,blockingObjectID,crossedPortalIDs};
  }
  private position(point:Point2,roomID:string):WalkPosition{return{documentID:this.documentID,revision:this.revision,floorID:this.floorID,roomID,point:{...point},eyeY:this.elevation+this.settings.eyeHeight};}
  private uniqueRoom(point:Point2):string|undefined{const matches=this.regions.filter(r=>regionContains(r,point));return matches.length===1?matches[0].id:undefined;}
  private room(point:Point2,preferred:string):string|undefined{return this.uniqueRoom(point)??(this.portals.some(p=>p.roomIDs.includes(preferred)&&onSegment(point,p.a,p.b))?preferred:undefined);}
  private clearance(point:Point2):number{let minimum=Infinity;for(const b of this.barriers)minimum=Math.min(minimum,segmentDistance(point,b.a,b.b));return minimum;}
}
function segmentDistance(p:Point2,a:Point2,b:Point2):number{const dx=b.x-a.x,dz=b.z-a.z,square=dx*dx+dz*dz;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/square));return distance(p,interpolate(a,b,t));}
function capsuleEntry(from:Point2,to:Point2,a:Point2,b:Point2,radius:number):number|undefined{
  const vx=to.x-from.x,vz=to.z-from.z;if(Math.max(from.x,to.x)<Math.min(a.x,b.x)-radius||Math.min(from.x,to.x)>Math.max(a.x,b.x)+radius||Math.max(from.z,to.z)<Math.min(a.z,b.z)-radius||Math.min(from.z,to.z)>Math.max(a.z,b.z)+radius)return;
  const length=distance(a,b),ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,nx=-uz,nz=ux,initial=(from.x-a.x)*nx+(from.z-a.z)*nz,speed=vx*nx+vz*nz,times:number[]=[];
  if(Math.abs(speed)>1e-12)for(const sign of [-1,1])if(speed*sign<0){const t=(sign*radius-initial)/speed;if(t>= -1e-12&&t<=1){const p=interpolate(from,to,Math.max(0,t)),u=(p.x-a.x)*ux+(p.z-a.z)*uz;if(u>=0&&u<=length)times.push(Math.max(0,t));}}
  const speed2=vx*vx+vz*vz;for(const endpoint of [a,b]){const px=from.x-endpoint.x,pz=from.z-endpoint.z,q=px*vx+pz*vz,c=px*px+pz*pz-radius*radius,discriminant=q*q-speed2*c;if(discriminant>1e-14){const t=(-q-Math.sqrt(discriminant))/speed2;if(t>= -1e-12&&t<=1)times.push(Math.max(0,t));}}
  return times.length?Math.min(...times):undefined;
}
function intersectionTimes(a:Point2,b:Point2,c:Point2,d:Point2):number[]{
  const rx=b.x-a.x,rz=b.z-a.z,sx=d.x-c.x,sz=d.z-c.z,denominator=rx*sz-rz*sx,qx=c.x-a.x,qz=c.z-a.z;
  if(Math.abs(denominator)>1e-12){const t=(qx*sz-qz*sx)/denominator,u=(qx*rz-qz*rx)/denominator;return t>=0&&t<=1&&u>=0&&u<=1?[t]:[];}
  if(Math.abs(qx*rz-qz*rx)>1e-12)return[];const square=rx*rx+rz*rz;if(square<=0)return[];return[((c.x-a.x)*rx+(c.z-a.z)*rz)/square,((d.x-a.x)*rx+(d.z-a.z)*rz)/square].filter(t=>t>=0&&t<=1);
}
