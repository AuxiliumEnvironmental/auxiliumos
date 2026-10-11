import type { EditCommand, EditReceipt, Floor, GeometryIDMapping, Room, SpatialDocument, WallReference } from '../types';
import { closedRoomBoundary, distance, EPSILON, isSimplePolygon, pathLength, pathPoint, roomBoundary, signedArea, wallPath } from './geometry';
import { requireValidDocument, validID } from './validation';

function requireID(id:string,ids:string[]):void{if(!validID(id)||ids.includes(id))throw new Error(`Invalid or duplicate identifier: ${id}`);}
function item<T extends {id:string}>(items:T[],id:string):T{const value=items.find(x=>x.id===id);if(!value)throw new Error(`Missing object ${id}`);return value;}
function remove<T extends {id:string}>(items:T[],id:string):void{const i=items.findIndex(x=>x.id===id);if(i<0)throw new Error(`Missing object ${id}`);items.splice(i,1);}
const map=(floorID:string,objectKind:string,sourceID:string,resultingIDs:string[]):GeometryIDMapping=>({floorID,objectKind,sourceID,resultingIDs,requiresOverlayReview:true});
function equal(a:unknown,b:unknown):boolean{
  if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&equal(left[key],right[key]));
}
function exists(document:SpatialDocument,floorID:string,kind:string,id:string):boolean{
  const floor=document.floors.find(f=>f.id===floorID);if(!floor)return false;
  switch(kind){case'floor':return floor.id===id;case'node':return floor.nodes.some(x=>x.id===id);case'wall':return floor.walls.some(x=>x.id===id);case'opening':return floor.openings.some(x=>x.id===id);case'room':return floor.rooms.some(x=>x.id===id);case'area':return floor.areas?.some(x=>x.id===id)??false;default:return false;}
}
/** Conservative durable-history lineage. It grants no permission to relink an overlay automatically. */
export function restorationMappings(source:SpatialDocument,next:SpatialDocument):GeometryIDMapping[]{
  const result:GeometryIDMapping[]=[];
  for(const f of source.floors){const n=next.floors.find(x=>x.id===f.id);if(!n){result.push(map(f.id,'floor',f.id,[]));continue;}
    const moved=f.elevation!==n.elevation;if(moved||f.label!==n.label)result.push(map(f.id,'floor',f.id,[f.id]));
    const nodes=new Set(f.nodes.filter(x=>!equal(n.nodes.find(y=>y.id===x.id),x)).map(x=>x.id));
    const walls=new Set(f.walls.filter(x=>moved||!equal(n.walls.find(y=>y.id===x.id),x)||x.nodeIDs.some(id=>nodes.has(id))).map(x=>x.id));
    for(const [kind,items,changed]of [
      ['node',f.nodes,(x:{id:string})=>nodes.has(x.id)],
      ['wall',f.walls,(x:{id:string})=>walls.has(x.id)],
      ['opening',f.openings,(x:typeof f.openings[number])=>!equal(n.openings.find(y=>y.id===x.id),x)||walls.has(x.wallID)],
      ['room',f.rooms,(x:Room)=>!equal(n.rooms.find(y=>y.id===x.id),x)||x.boundary.some(r=>walls.has(r.wallID))],
      ['area',f.areas??[],(x:NonNullable<Floor['areas']>[number])=>moved||!equal(n.areas?.find(y=>y.id===x.id),x)],
    ] as const){
      // Each predicate belongs to its parallel collection; expand below without an unsafe public cast.
      for(const x of items)if((changed as (v:typeof x)=>boolean)(x))result.push(map(f.id,kind,x.id,exists(next,f.id,kind,x.id)?[x.id]:[]));
    }
  }return result;
}
function compose(previous:GeometryIDMapping[],changes:GeometryIDMapping[],source:SpatialDocument):GeometryIDMapping[]{
  const same=(a:GeometryIDMapping,b:GeometryIDMapping)=>a.floorID===b.floorID&&a.objectKind===b.objectKind&&a.sourceID===b.sourceID;
  const result=previous.map(p=>({...p,resultingIDs:[...new Set(p.resultingIDs.flatMap(id=>changes.find(c=>c.floorID===p.floorID&&c.objectKind===p.objectKind&&c.sourceID===id)?.resultingIDs??[id]))]}));
  for(const c of changes)if(exists(source,c.floorID,c.objectKind,c.sourceID)&&!result.some(r=>same(r,c)))result.push(c);return result;
}
function markEdited(floor:Floor,nodeIDs:string[]):void{const ids=new Set(nodeIDs);for(const w of floor.walls)if(w.nodeIDs.some(id=>ids.has(id)))w.provenance.origin='edited';}

function splitWall(floor:Floor,id:string,offset:number,newWallID:string,newNodeID?:string):void{
  const original=item(floor.walls,id),points=wallPath(floor,original),length=pathLength(points);requireID(newWallID,floor.walls.map(w=>w.id));
  if(!Number.isFinite(offset)||offset<=EPSILON||offset>=length-EPSILON)throw new Error('Split must lie inside the wall path');
  if(floor.openings.some(o=>o.wallID===id&&o.offset<offset-EPSILON&&o.offset+o.width>offset+EPSILON))throw new Error('Move the wall split outside the opening first');
  const ids=[...original.nodeIDs];let cursor=0,cut=0;
  for(let i=1;i<points.length;i++){const end=cursor+distance(points[i-1],points[i]);if(Math.abs(offset-end)<=EPSILON){cut=i;break;}if(offset<end){if(!newNodeID)throw new Error('Provide an identifier for the new corner');requireID(newNodeID,floor.nodes.map(n=>n.id));floor.nodes.push({id:newNodeID,point:pathPoint(points,offset)});ids.splice(i,0,newNodeID);cut=i;break;}cursor=end;}
  if(cut<=0||cut>=ids.length-1)throw new Error('Cannot locate an interior split');
  const left=structuredClone(original),right=structuredClone(original);left.nodeIDs=ids.slice(0,cut+1);right.nodeIDs=ids.slice(cut);right.id=newWallID;left.provenance.origin=right.provenance.origin='edited';floor.walls.splice(floor.walls.indexOf(original),1,left,right);
  for(const o of floor.openings)if(o.wallID===id&&o.offset>=offset-EPSILON){o.wallID=newWallID;o.offset-=offset;if(Math.abs(o.offset)<=EPSILON)o.offset=0;}
  for(const room of floor.rooms)room.boundary=room.boundary.flatMap(r=>r.wallID!==id?[r]:r.reversed?[{wallID:newWallID,reversed:true},{wallID:id,reversed:true}]:[{wallID:id,reversed:false},{wallID:newWallID,reversed:false}]);
}
function joinWalls(floor:Floor,firstID:string,secondID:string):void{
  if(firstID===secondID)throw new Error('Choose two different walls');const a=item(floor.walls,firstID),b=item(floor.walls,secondID);
  if(Math.abs(a.baseY-b.baseY)>EPSILON||Math.abs(a.height-b.height)>EPSILON)throw new Error('Joined walls must have the same base and height');
  if(a.nodeIDs.filter(id=>b.nodeIDs.includes(id)).length!==1)throw new Error('Joined walls must share exactly one endpoint');
  const al=pathLength(wallPath(floor,a)),bl=pathLength(wallPath(floor,b));let reversed:boolean,first:boolean;
  if(a.nodeIDs.at(-1)===b.nodeIDs[0]){reversed=false;first=false;}else if(a.nodeIDs.at(-1)===b.nodeIDs.at(-1)){reversed=true;first=false;}else if(a.nodeIDs[0]===b.nodeIDs.at(-1)){reversed=false;first=true;}else if(a.nodeIDs[0]===b.nodeIDs[0]){reversed=true;first=true;}else throw new Error('Shared node must be an endpoint on both walls');
  const bIDs=reversed?[...b.nodeIDs].reverse():b.nodeIDs,joined=structuredClone(a);joined.nodeIDs=first?[...bIDs,...a.nodeIDs.slice(1)]:[...a.nodeIDs,...bIDs.slice(1)];joined.provenance.origin='edited';if(a.heightBasis!==b.heightBasis)joined.heightBasis='assumed';
  const confidence=['unknown','low','medium','high'] as const;joined.provenance.classificationConfidence=confidence[Math.min(confidence.indexOf(a.provenance.classificationConfidence),confidence.indexOf(b.provenance.classificationConfidence))];joined.provenance.sourceIDs=[...new Set([...a.provenance.sourceIDs,...b.provenance.sourceIDs])].sort();
  const forward:WallReference[]=first?[{wallID:secondID,reversed},{wallID:firstID,reversed:false}]:[{wallID:firstID,reversed:false},{wallID:secondID,reversed}];const reverse=[...forward].reverse().map(r=>({wallID:r.wallID,reversed:!r.reversed}));
  for(const room of floor.rooms){const boundary=room.boundary,uses=boundary.filter(r=>r.wallID===firstID||r.wallID===secondID);if(!uses.length)continue;if(uses.length!==2)throw new Error('Joining would change a room boundary; edit its boundary explicitly first');let replacement:WallReference[]|undefined;
    for(let i=0;i<boundary.length;i++){const pair=[boundary[i],boundary[(i+1)%boundary.length]];if(equal(pair,forward)||equal(pair,reverse)){const rotated=[...boundary.slice(i),...boundary.slice(0,i)];replacement=[{wallID:firstID,reversed:equal(pair,reverse)},...rotated.slice(2)];break;}}
    if(!replacement)throw new Error('Walls must be consecutive in each affected room');room.boundary=replacement;
  }
  for(const o of floor.openings){if(o.wallID===firstID){if(first)o.offset+=bl;}else if(o.wallID===secondID){if(reversed)o.offset=bl-o.offset-o.width;if(!first)o.offset+=al;o.wallID=firstID;}}
  floor.walls[floor.walls.indexOf(a)]=joined;remove(floor.walls,secondID);
}
function splitRoom(floor:Floor,roomID:string,dividerID:string,newID:string,label:string):void{
  const original=item(floor.rooms,roomID),divider=item(floor.walls,dividerID);requireID(newID,floor.rooms.map(r=>r.id));
  if(new Set(floor.walls.map(w=>w.id)).size!==floor.walls.length)throw new Error('Wall identifiers are duplicated');
  if(floor.rooms.some(r=>r.boundary.some(w=>w.wallID===dividerID)))throw new Error('Divider already belongs to a room boundary');
  const starts=original.boundary.map(r=>{const w=item(floor.walls,r.wallID);return r.reversed?w.nodeIDs.at(-1)!:w.nodeIDs[0];});const a=starts.indexOf(divider.nodeIDs[0]),b=starts.indexOf(divider.nodeIDs.at(-1)!);if(a<0||b<0||a===b)throw new Error('Divider endpoints must be explicit boundary corners; split host walls first');
  const arc=(from:number,to:number):WallReference[]=>{const refs:WallReference[]=[];for(let i=from;i!==to;i=(i+1)%original.boundary.length)refs.push(original.boundary[i]);return refs;};
  const left={...original,boundary:[...arc(a,b),{wallID:dividerID,reversed:true}]},right:Room={id:newID,label,boundary:[...arc(b,a),{wallID:dividerID,reversed:false}]};
  const before=roomBoundary(floor,original),lp=roomBoundary(floor,left),rp=roomBoundary(floor,right);if(left.boundary.length<3||right.boundary.length<3||!isSimplePolygon(lp)||!isSimplePolygon(rp))throw new Error('Divider must produce two simple closed rooms');
  const area=signedArea(before),la=signedArea(lp),ra=signedArea(rp);if(area*la<=0||area*ra<=0||Math.abs(Math.abs(la)+Math.abs(ra)-Math.abs(area))>Math.max(EPSILON,Math.abs(area)*1e-9))throw new Error('Divider must remain inside the original room without overlaps');
  floor.rooms[floor.rooms.indexOf(original)]=left;floor.rooms.push(right);
}
function mergeRooms(floor:Floor,firstID:string,secondID:string):{walls:string[];openings:string[]}{
  if(firstID===secondID)throw new Error('Choose two distinct rooms');const first=item(floor.rooms,firstID),second=item(floor.rooms,secondID),common=new Set(first.boundary.filter(r=>second.boundary.some(s=>s.wallID===r.wallID)).map(r=>r.wallID));
  if(!common.size)throw new Error('Rooms must have an explicitly shared partition');
  if(floor.rooms.some(r=>r.id!==firstID&&r.id!==secondID&&r.boundary.some(w=>common.has(w.wallID))))throw new Error('Shared partition belongs to another room');
  const outer=[...first.boundary,...second.boundary].filter(r=>!common.has(r.wallID));if(new Set(outer.map(r=>r.wallID)).size!==outer.length)throw new Error('Outside boundary is ambiguous');
  const boundary=closedRoomBoundary(floor,outer.map(r=>r.wallID)),merged={...first,boundary};const expected=Math.abs(signedArea(roomBoundary(floor,first)))+Math.abs(signedArea(roomBoundary(floor,second))),polygon=roomBoundary(floor,merged);
  if(!isSimplePolygon(polygon)||Math.abs(Math.abs(signedArea(polygon))-expected)>Math.max(EPSILON,expected*1e-9))throw new Error('Merge would overlap rooms, create a hole, or change the outside boundary');
  const openings=floor.openings.filter(o=>common.has(o.wallID)).map(o=>o.id);floor.rooms=floor.rooms.filter(r=>r.id!==firstID&&r.id!==secondID);floor.rooms.push(merged);floor.walls=floor.walls.filter(w=>!common.has(w.id));floor.openings=floor.openings.filter(o=>!common.has(o.wallID));return {walls:[...common].sort(),openings};
}
function mutate(document:SpatialDocument,command:EditCommand):GeometryIDMapping[]{
  const mappings:GeometryIDMapping[]=[];if(command.type==='addFloor'){requireID(command.floor.id,document.floors.map(f=>f.id));document.floors.push(structuredClone(command.floor));return mappings;}
  const f=item(document.floors,command.floorID),m=(kind:string,id:string,to:string[])=>mappings.push(map(f.id,kind,id,to));
  if(command.type==='deleteFloor'){remove(document.floors,f.id);m('floor',f.id,[]);return mappings;}
  switch(command.type){
    case'moveNode':item(f.nodes,command.nodeID).point=structuredClone(command.point);markEdited(f,[command.nodeID]);m('node',command.nodeID,[command.nodeID]);break;
    case'moveWall':{const w=item(f.walls,command.wallID);for(const id of new Set(w.nodeIDs)){const n=item(f.nodes,id);n.point.x+=command.translation.x;n.point.z+=command.translation.z;}markEdited(f,w.nodeIDs);m('wall',w.id,[w.id]);break;}
    case'addWall':{const w=structuredClone(command.wall);requireID(w.id,f.walls.map(x=>x.id));for(const n of command.newNodes){requireID(n.id,f.nodes.map(x=>x.id));f.nodes.push(structuredClone(n));}w.provenance.origin='edited';f.walls.push(w);break;}
    case'deleteWall':remove(f.walls,command.wallID);m('wall',command.wallID,[]);break;
    case'splitWall':splitWall(f,command.wallID,command.offset,command.newWallID,command.newNodeID);m('wall',command.wallID,[command.wallID,command.newWallID]);break;
    case'joinWalls':joinWalls(f,command.firstWallID,command.secondWallID);m('wall',command.firstWallID,[command.firstWallID]);m('wall',command.secondWallID,[command.firstWallID]);break;
    case'mergeNodes':{const source=item(f.nodes,command.sourceNodeID),target=item(f.nodes,command.targetNodeID);if(source.id===target.id)throw new Error('Choose two different nodes');for(const w of f.walls)if(w.nodeIDs.includes(source.id)){w.nodeIDs=w.nodeIDs.map(id=>id===source.id?target.id:id);w.provenance.origin='edited';}remove(f.nodes,source.id);m('node',source.id,[target.id]);break;}
    case'disconnectNode':{const w=item(f.walls,command.wallID),n=item(f.nodes,command.nodeID);if(!w.nodeIDs.includes(n.id))throw new Error('Node does not belong to the selected wall');requireID(command.newNodeID,f.nodes.map(n=>n.id));f.nodes.push({id:command.newNodeID,point:structuredClone(n.point)});w.nodeIDs=w.nodeIDs.map(id=>id===n.id?command.newNodeID:id);w.provenance.origin='edited';m('node',n.id,[n.id,command.newNodeID]);break;}
    case'addOpening':{const o=structuredClone(command.opening);requireID(o.id,f.openings.map(x=>x.id));o.provenance.origin='edited';f.openings.push(o);break;}
    case'moveOpening':{const o=item(f.openings,command.openingID);o.offset=command.offset;o.provenance.origin='edited';m('opening',o.id,[o.id]);break;}
    case'updateOpening':{const previous=item(f.openings,command.opening.id),o=structuredClone(command.opening);o.provenance.sourceIDs=[...new Set([...o.provenance.sourceIDs,...previous.provenance.sourceIDs])].sort();o.provenance.origin='edited';f.openings[f.openings.indexOf(previous)]=o;m('opening',o.id,[o.id]);break;}
    case'deleteOpening':remove(f.openings,command.openingID);m('opening',command.openingID,[]);break;
    case'renameRoom':item(f.rooms,command.roomID).label=command.label;break;
    case'addRoom':requireID(command.room.id,f.rooms.map(r=>r.id));f.rooms.push(structuredClone(command.room));break;
    case'setRoomBoundary':item(f.rooms,command.roomID).boundary=structuredClone(command.boundary);m('room',command.roomID,[command.roomID]);break;
    case'deleteRoom':remove(f.rooms,command.roomID);m('room',command.roomID,[]);break;
    case'splitRoom':splitRoom(f,command.roomID,command.dividerWallID,command.newRoomID,command.newLabel);m('room',command.roomID,[command.roomID,command.newRoomID]);break;
    case'mergeRooms':{const removed=mergeRooms(f,command.firstRoomID,command.secondRoomID);m('room',command.secondRoomID,[command.firstRoomID]);m('room',command.firstRoomID,[command.firstRoomID]);for(const id of removed.walls)m('wall',id,[]);for(const id of removed.openings)m('opening',id,[]);break;}
    case'setArea':{const a=structuredClone(command.area);f.areas??=[];const previous=f.areas.find(x=>x.id===a.id);if(previous){a.provenance.sourceIDs=[...new Set([...a.provenance.sourceIDs,...previous.provenance.sourceIDs])].sort();f.areas[f.areas.indexOf(previous)]=a;m('area',a.id,[a.id]);}else f.areas.push(a);a.provenance.origin='edited';document.schemaVersion='1.1.0';break;}
    case'deleteArea':remove(f.areas??[],command.areaID);m('area',command.areaID,[]);break;
    case'updateFloor':f.label=command.label;f.elevation=command.elevation;break;
    default:throw new Error('Unknown edit command');
  }return mappings;
}
/** One coherent transaction. Failure cannot mutate the supplied snapshot or receipt. */
export function applyCommands(document:SpatialDocument,commands:EditCommand[],expectedRevision:number):{document:SpatialDocument;receipt:EditReceipt}{
  const next=requireValidDocument(document);
  if(document.revision!==expectedRevision)throw new Error(`Stale revision: expected ${expectedRevision}, current ${document.revision}`);
  if(!Array.isArray(commands)||commands.length<1||commands.length>1000)throw new Error('Use 1 to 1000 commands per edit');
  if(document.revision>=Number.MAX_SAFE_INTEGER)throw new Error('Revision limit reached');let mappings:GeometryIDMapping[]=[];
  for(const c of commands)mappings=compose(mappings,mutate(next,c),document);
  next.revision=document.revision+1;next.parentRevision=document.revision;next.reviewState='needsReview';
  const validated=requireValidDocument(next);mappings=mappings.map(m=>({...m,resultingIDs:m.resultingIDs.filter(id=>exists(validated,m.floorID,m.objectKind,id))}));
  for(const mapping of restorationMappings(document,validated))if(!mappings.some(m=>m.floorID===mapping.floorID&&m.objectKind===mapping.objectKind&&m.sourceID===mapping.sourceID))mappings.push(mapping);
  return {document:validated,receipt:{sourceRevision:document.revision,resultingRevision:validated.revision,mappings}};
}
