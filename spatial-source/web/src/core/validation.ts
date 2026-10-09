import type { SpatialDocument, ValidationIssue } from '../types';
import { EPSILON, FloorGeometryIndex, isSimplePath, isSimplePolygon, pathLength } from './geometry';

export class GeometryValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]){super(issues.map(i=>`${i.path}: ${i.message}`).join('; '));this.name='GeometryValidationError';}
}
export const validID=(value: unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,96}$/.test(value);
type Shape = {kind:'object';fields:Record<string,Shape>;optional?:string[]} | {kind:'array';item:Shape;min:number;max:number} | {kind:'number';min:number;max:number;positive?:boolean;integer?:boolean;nullable?:boolean} | {kind:'enum';values:unknown[]} | {kind:'id'} | {kind:'text'};
const id:Shape={kind:'id'},text:Shape={kind:'text'};
const number=(min:number,max:number,positive=false):Shape=>({kind:'number',min,max,positive});
const array=(item:Shape,min:number,max:number):Shape=>({kind:'array',item,min,max});
const object=(fields:Record<string,Shape>,optional:string[]=[]):Shape=>({kind:'object',fields,optional});
const choice=(...values:unknown[]):Shape=>({kind:'enum',values});
const point=object({x:number(-10000,10000),z:number(-10000,10000)});
const provenance=object({origin:choice('captured','edited','inferred','synthetic'),sourceIDs:array(id,0,1000),classificationConfidence:choice('low','medium','high','unknown')});
const node=object({id,point});
const wall=object({id,nodeIDs:array(id,2,1000),baseY:number(-100,100),height:number(0,100,true),heightBasis:choice('captured','assumed','edited','synthetic'),provenance});
const opening=object({id,wallID:id,kind:choice('door','window','passage'),offset:number(0,10000),width:number(0,10000,true),bottom:number(0,100),height:number(0,100,true),provenance});
const room=object({id,label:text,boundary:array(object({wallID:id,reversed:choice(true,false)}),3,1000)});
const area=object({id,label:text,polygon:array(point,3,1000),provenance});
const floor=object({id,label:text,elevation:number(-10000,10000),nodes:array(node,0,100000),walls:array(wall,0,50000),openings:array(opening,0,10000),rooms:array(room,0,10000),areas:array(area,0,1000)},['areas']);
const documentShape=object({schemaVersion:choice('1.0.0','1.1.0'),documentID:id,revision:{kind:'number',min:1,max:Number.MAX_SAFE_INTEGER,integer:true},parentRevision:{kind:'number',min:1,max:Number.MAX_SAFE_INTEGER,integer:true,nullable:true},title:text,coordinateSystem:choice('meters_y_up_right_handed'),measurementStatus:choice('unverified'),reviewState:choice('needsReview','reviewed'),floors:array(floor,1,100)},['parentRevision']);

/** Admission is both the strict transport structure and graph semantics. Unknown fields fail closed. */
export function validateDocument(value:unknown):ValidationIssue[]{
  const issues:ValidationIssue[]=[];
  const add=(code:string,path:string,message:string)=>{if(issues.length<200)issues.push({code,path,message});};
  const visit=(value:unknown,shape:Shape,path:string):void=>{
    if(issues.length>=200)return;
    switch(shape.kind){
      case 'id':if(!validID(value))add('invalid_id',path,'Use 1 to 96 ASCII letters, digits, hyphens, or underscores');break;
      // With Unicode matching, a valid surrogate pair is one code point outside
      // this range; only malformed, unpaired UTF-16 code units match it.
      case 'text':if(typeof value!=='string'||[...value].length<1||[...value].length>256||/[\u0000-\u0009\u000b-\u001f\uD800-\uDFFF]/u.test(value))add('invalid_text',path,'Use 1 to 256 valid Unicode characters');break;
      case 'enum':if(!shape.values.includes(value))add('value',path,'Unsupported value');break;
      case 'number':if(value===null&&shape.nullable)break;if(typeof value!=='number'||!Number.isFinite(value)||value<shape.min||value>shape.max||(shape.positive&&value===0)||(shape.integer&&!Number.isSafeInteger(value)))add('number',path,'Invalid finite number or numeric bound');break;
      case 'array':if(!Array.isArray(value)){add('type',path,'Expected an array');break;}if(value.length<shape.min||value.length>shape.max){add('capacity',path,`Expected ${shape.min} to ${shape.max} items`);break;}for(let i=0;i<value.length;i++){if(!Object.hasOwn(value,i))add('type',`${path}[${i}]`,'Sparse arrays are not JSON arrays');else visit(value[i],shape.item,`${path}[${i}]`);}break;
      case 'object':{
        if(value===null||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)){add('type',path,'Expected a plain JSON object');break;}
        const record=value as Record<string,unknown>;
        for(const key of Object.keys(record))if(!Object.hasOwn(shape.fields,key))add('unknown_field',`${path}.${key}`,'Unknown field requires an explicit schema migration');
        for(const [key,child]of Object.entries(shape.fields)){if(Object.hasOwn(record,key))visit(record[key],child,path?`${path}.${key}`:key);else if(!shape.optional?.includes(key))add('required',path?`${path}.${key}`:key,'Required field is missing');}
        break;
      }
    }
  };
  visit(value,documentShape,'');if(issues.length)return issues;
  const doc=value as SpatialDocument;
  if(doc.parentRevision!=null&&doc.parentRevision>=doc.revision)add('revision','parentRevision','Parent must precede the current revision');
  const unique=(values:string[],path:string)=>{if(new Set(values).size!==values.length)add('duplicate_id',path,'Identifiers must be unique in this collection');};
  unique(doc.floors.map(f=>f.id),'floors');
  for(const [fi,f]of doc.floors.entries()){
    const root=`floors[${fi}]`;for(const [name,items]of [['nodes',f.nodes],['walls',f.walls],['openings',f.openings],['rooms',f.rooms],['areas',f.areas??[]]] as const)unique(items.map(item=>item.id),`${root}.${name}`);
    if(doc.schemaVersion==='1.0.0'&&f.areas!==undefined)add('schema_version',`${root}.areas`,'The areas field requires explicit schema version 1.1.0');
    unique([...f.walls,...f.openings,...f.rooms,...(f.areas??[])].map(x=>x.id),`${root}.renderObjects`);
    let areaWork=0;for(const a of f.areas??[]){areaWork+=a.polygon.length*a.polygon.length;if(areaWork>2_000_000){add('capacity',`${root}.areas`,'Semantic polygon work exceeds the bounded envelope');break;}if(!isSimplePolygon(a.polygon))add('invalid_polygon',`${root}.areas.${a.id}`,'Semantic area must be a simple nonzero polygon');}
    const index=new FloorGeometryIndex(f),lengths=new Map<string,number>();
    for(const w of f.walls){const p=`${root}.walls.${w.id}`;if(w.nodeIDs.some(id=>!index.nodes.has(id))){add('missing_node',p,'Wall references a missing node');continue;}
      const points=index.path(w);if(new Set(w.nodeIDs).size!==w.nodeIDs.length)add('wall_loop',p,'A wall path cannot repeat a node');
      if(!isSimplePath(points))add('self_intersecting_wall',p,'Wall cannot cross, touch, degenerate, or double back on itself');
      lengths.set(w.id,pathLength(points));if(Math.abs(f.elevation+w.baseY)>10000||Math.abs(f.elevation+w.baseY+w.height)>10000)add('world_height_bounds',p,'Combined floor and wall elevation exceeds scene bounds');
    }
    const groups=new Map<string,typeof f.openings>();
    for(const o of f.openings){const p=`${root}.openings.${o.id}`,w=index.walls.get(o.wallID),length=lengths.get(o.wallID);if(!w||length===undefined){add('missing_wall',p,'Opening must have a valid existing host wall');continue;}
      if(o.offset+o.width>length+EPSILON||o.bottom+o.height>w.height+EPSILON)add('opening_bounds',p,'Opening must fit inside its host wall');groups.set(o.wallID,[...(groups.get(o.wallID)??[]),o]);
    }
    for(const group of groups.values()){const sorted=[...group].sort((a,b)=>a.offset-b.offset);for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){const a=sorted[i],b=sorted[j];if(b.offset>=a.offset+a.width-EPSILON)break;if(Math.min(a.bottom+a.height,b.bottom+b.height)-Math.max(a.bottom,b.bottom)>EPSILON)add('opening_overlap',`${root}.openings`,`${a.id} overlaps ${b.id}`);}}
    const refs=new Map<string,boolean[]>();
    for(const room of f.rooms){const p=`${root}.rooms.${room.id}`;if(new Set(room.boundary.map(r=>r.wallID)).size!==room.boundary.length){add('duplicate_boundary',p,'Room repeats a wall');continue;}
      for(const r of room.boundary)refs.set(r.wallID,[...(refs.get(r.wallID)??[]),r.reversed]);
      try{const points=index.boundary(room);if(points.length>1000||!isSimplePolygon(points))add('invalid_polygon',p,'Room boundary must be a bounded simple nonzero polygon');}catch{add('open_boundary',p,'Boundary must connect using shared node identifiers and close explicitly');}
    }
    for(const [id,uses]of refs){if(uses.length>2)add('nonmanifold',`${root}.walls.${id}`,'More than two rooms use one wall');if(uses.length===2&&uses[0]===uses[1])add('shared_wall_direction',`${root}.walls.${id}`,'Adjacent rooms must traverse a shared wall oppositely');}
  }return issues;
}
export function requireValidDocument(value:unknown):SpatialDocument{
  const issues=validateDocument(value);if(issues.length)throw new GeometryValidationError(issues);
  // Own the snapshot at trust boundaries. Optional null matches Apple's nil decoding.
  const document=structuredClone(value) as SpatialDocument;if(document.parentRevision===null)delete document.parentRevision;return document;
}
