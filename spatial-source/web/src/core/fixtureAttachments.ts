import type { Cutout, EditCommand, Fixture, Floor, SpatialDocument, SurfaceRef } from '../types';
import { distance, pathLength, wallPath } from './geometry';
import { profileRing } from './cutoutGeometry';
/** Exact arclength remaps for split/join, without a nearest-wall guess. */
export function remapAttachmentsForCommand(before:Floor,after:Floor,command:EditCommand,resolvedFixtureIDs:ReadonlySet<string>=new Set(),resolvedCutoutIDs:ReadonlySet<string>=new Set()):void{
 const remap=(ref:SurfaceRef,lo:number,hi:number):{ref:SurfaceRef;sign:number;shift:number}|null=>{
  if(ref.kind!=='wall')return null;
  if(command.type==='splitWall'&&ref.wallID===command.wallID){if(lo<command.offset-1e-6&&hi>command.offset+1e-6)throw new Error('Move or delete the attached fixture/cutout before splitting through it');return{ref:hi<=command.offset+1e-6?ref:{...ref,wallID:command.newWallID},sign:1,shift:hi<=command.offset+1e-6?0:-command.offset};}
  if(command.type==='joinWalls'&&(ref.wallID===command.firstWallID||ref.wallID===command.secondWallID)){
   const old=before.walls.find(w=>w.id===ref.wallID)!,joined=after.walls.find(w=>w.id===command.firstWallID)!,oldPath=wallPath(before,old),path=wallPath(after,joined);
   const start=path.findIndex(p=>distance(p,oldPath[0])<1e-6),end=path.findIndex(p=>distance(p,oldPath.at(-1)!)<1e-6);if(start<0||end<0)throw new Error('Attached host join is ambiguous');
   const sign=end>start?1:-1,shift=pathLength(path.slice(0,start+1));return{ref:{...ref,wallID:joined.id,side:sign===1?ref.side:ref.side==='positive'?'negative':'positive'},sign,shift};
  }
  return null;
 };
 for(const fixture of after.fixtures??[]){if(resolvedFixtureIDs.has(JSON.stringify([before.id,fixture.id]))||fixture.mount.kind!=='wall')continue;const m=fixture.mount,r=remap(m.surface,m.u-fixture.dimensions.width/2,m.u+fixture.dimensions.width/2);if(r&&r.ref.kind==='wall'){m.surface=r.ref;m.u=r.sign*m.u+r.shift;}}
 for(const cutout of after.cutouts??[]){if(resolvedCutoutIDs.has(JSON.stringify([before.id,cutout.id])))continue;const ring=profileRing(cutout.profile),r=remap(cutout.surface,Math.min(...ring.map(p=>p.u)),Math.max(...ring.map(p=>p.u)));if(r){cutout.surface=r.ref;cutout.profile.center.u=r.sign*cutout.profile.center.u+r.shift;if(r.sign<0&&cutout.profile.shape==='rectangle')cutout.profile.rotation=Math.PI-cutout.profile.rotation;}}
}
function rigidTransform(p:import('../types').Point2[],q:import('../types').Point2[]):{c:number;s:number;dx:number;dz:number;angle:number}|null{
 if(p.length!==q.length||p.length<2)return null;const angle=Math.atan2(q[1].z-q[0].z,q[1].x-q[0].x)-Math.atan2(p[1].z-p[0].z,p[1].x-p[0].x),c=Math.cos(angle),s=Math.sin(angle),dx=q[0].x-c*p[0].x+s*p[0].z,dz=q[0].z-s*p[0].x-c*p[0].z;
 return p.every((point,i)=>distance({x:c*point.x-s*point.z+dx,z:s*point.x+c*point.z+dz},q[i])<1e-6)?{c,s,dx,dz,angle}:null;
}
/** Judge the completed transaction, so batched corner translation is not mistaken for bending. */
export function assertAttachmentHostChanges(before:SpatialDocument,after:SpatialDocument,commands:EditCommand[]):void{
 for(const floor of before.floors){const next=after.floors.find(f=>f.id===floor.id);if(!next)continue;
  const explicitFixture=new Set(commands.filter((c):c is Extract<EditCommand,{type:'setFixture'|'deleteFixture'}>=>c.type==='setFixture'||c.type==='deleteFixture').filter(c=>c.floorID===floor.id).map(c=>c.type==='setFixture'?c.fixture.id:c.fixtureID));
  const explicitCutout=new Set(commands.filter((c):c is Extract<EditCommand,{type:'setCutout'|'deleteCutout'}>=>c.type==='setCutout'||c.type==='deleteCutout').filter(c=>c.floorID===floor.id).map(c=>c.type==='setCutout'?c.cutout.id:c.cutoutID));
  // Topology remaps cannot exempt an earlier/later shape change in the same batch.
  // Keep this first implementation conservative until the master composes lineage receipts.
  const topologyIDs=new Set(commands.flatMap(c=>c.type==='splitWall'&&c.floorID===floor.id?[c.wallID,c.newWallID]:c.type==='joinWalls'&&c.floorID===floor.id?[c.firstWallID,c.secondWallID]:[]));
  const movedNodes=new Set(commands.flatMap(c=>c.type==='moveNode'&&c.floorID===floor.id?[c.nodeID]:c.type==='moveWall'&&c.floorID===floor.id?floor.walls.find(w=>w.id===c.wallID)?.nodeIDs??[]:[]));
  const mixed=(wallID:string)=>topologyIDs.has(wallID)&&floor.walls.find(w=>w.id===wallID)?.nodeIDs.some(id=>movedNodes.has(id));
  if((floor.fixtures??[]).some(f=>!explicitFixture.has(f.id)&&f.mount.kind==='wall'&&mixed(f.mount.surface.wallID))||(floor.cutouts??[]).some(c=>!explicitCutout.has(c.id)&&c.surface.kind==='wall'&&mixed(c.surface.wallID)))throw new Error('Separate attached-host motion from split/join, or explicitly rehost/delete the fixture or cutout in the same correction');
  const walls=new Set([...floor.walls.map(w=>w.id),...next.walls.map(w=>w.id)]);
  for(const id of walls){const a=floor.walls.find(w=>w.id===id),b=next.walls.find(w=>w.id===id);if(!a||!b)continue;
   if(commands.some(c=>(c.type==='splitWall'&&c.wallID===id||c.type==='joinWalls'&&(c.firstWallID===id||c.secondWallID===id))&&c.floorID===floor.id))continue;
   const p=wallPath(floor,a),q=wallPath(next,b),translation=rigidTransform(p,q);
   const attached=[...(next.fixtures??[]).filter(f=>!explicitFixture.has(f.id)&&f.mount.kind==='wall'&&f.mount.surface.wallID===id),...(next.cutouts??[]).filter(c=>!explicitCutout.has(c.id)&&c.surface.kind==='wall'&&c.surface.wallID===id)];
   if(!translation&&attached.length)throw new Error('Nonrigid host change: explicitly move or delete attached fixtures/cutouts in the same correction');
  }
  for(const cutout of next.cutouts??[]){if(explicitCutout.has(cutout.id)||cutout.surface.kind==='wall')continue;const ref=cutout.surface,oldRoom=floor.rooms.find(r=>r.id===ref.roomID),newRoom=next.rooms.find(r=>r.id===ref.roomID);if(!oldRoom||!newRoom)continue;
   const p=roomPath(floor,oldRoom),q=roomPath(next,newRoom);if(p.length!==q.length)throw new Error('Explicitly rehost or delete the cutout before changing its room topology');
   const transform=rigidTransform(p,q);if(!transform)throw new Error('Explicitly rehost or delete the cutout before changing its room shape');
   const {u,v}=cutout.profile.center;cutout.profile.center={u:transform.c*u-transform.s*v+transform.dx,v:transform.s*u+transform.c*v+transform.dz};if(cutout.profile.shape==='rectangle')cutout.profile.rotation+=transform.angle;
  }
 }
}
import { roomBoundary as roomPath } from './geometry';
