import type { Fixture, Point2, Point3, SceneEdge, SceneFace, SpatialDocument } from '../types';
import { fixturePreset } from './fixtureCatalog';
import { intersects, strictlyContains, roomBoundary } from './geometry';
import { surfacePointToWorld, wallRun } from './surfaces';
export interface FixtureFrame { origin:Point3; x:Point3; z:Point3 }
export function fixtureFrame(document:SpatialDocument,fixture:Fixture,floorID:string):FixtureFrame{
 const floor=document.floors.find(f=>f.id===floorID);if(!floor)throw new Error('Fixture floor is missing');const m=fixture.mount;
 if(m.kind==='floor')return{origin:{...m.position,y:floor.elevation+m.baseOffset},x:{x:Math.cos(m.yaw),y:0,z:-Math.sin(m.yaw)},z:{x:Math.sin(m.yaw),y:0,z:Math.cos(m.yaw)}};
 const run=wallRun(document,m.surface,m.u-fixture.dimensions.width/2,m.u+fixture.dimensions.width/2),origin=surfacePointToWorld(document,m.surface,{u:m.u,v:m.v});
 if(!run||!origin)throw new Error('Wall fixture must fit on one straight host run');const side=m.surface.side==='positive'?1:-1;
 return{origin,x:{x:run.tx,y:0,z:run.tz},z:{x:-run.tz*side,y:0,z:run.tx*side}};
}
export function fixtureWorldPoint(frame:FixtureFrame,x:number,y:number,z:number):Point3{return{x:frame.origin.x+frame.x.x*x+frame.z.x*z,y:frame.origin.y+y,z:frame.origin.z+frame.x.z*x+frame.z.z*z};}
export function fixtureFootprint(document:SpatialDocument,fixture:Fixture,floorID:string):Point2[]{
 const frame=fixtureFrame(document,fixture,floorID),{width:w,depth:d}=fixture.dimensions,offset=fixture.mount.kind==='wall'?d/2:0;
 return[[-w/2,-d/2+offset],[w/2,-d/2+offset],[w/2,d/2+offset],[-w/2,d/2+offset]].map(([x,z])=>{const p=fixtureWorldPoint(frame,x,0,z);return{x:p.x,z:p.z};});
}
export function validateFixture(document:SpatialDocument,fixture:Fixture,floorID:string):void{
 const preset=fixturePreset(fixture.catalog.id),m=fixture.mount,floor=document.floors.find(f=>f.id===floorID)!;
 if(preset.mount!==m.kind)throw new Error('This catalog item requires its explicit floor or wall mount');
 if(m.kind==='wall'){
  if(m.surface.floorID!==floorID)throw new Error('Fixture mount must belong to its enclosing floor');
  const w=floor.walls.find(w=>w.id===m.surface.wallID);if(!w||m.v<0||m.v+fixture.dimensions.height>w.height+1e-6)throw new Error('Mounted fixture height must fit its wall');
 }
 const frame=fixtureFrame(document,fixture,floorID),footprint=fixtureFootprint(document,fixture,floorID);
 for(const room of floor.rooms){if(!room.ceiling)continue;const ring=roomBoundary(floor,room),overlaps=footprint.some(p=>strictlyContains(p,ring))||ring.some(p=>strictlyContains(p,footprint))||footprint.some((a,i)=>ring.some((b,j)=>intersects(a,footprint[(i+1)%4],b,ring[(j+1)%ring.length])));
  if(overlaps&&frame.origin.y+fixture.dimensions.height>floor.elevation+room.ceiling.height+1e-6)throw new Error(`Fixture conflicts with the established ceiling in ${room.label}`);
 }
 const values=fixtureFootprint(document,fixture,floorID);if(values.some(p=>Math.abs(p.x)>10000||Math.abs(p.z)>10000)||Math.abs(frame.origin.y)>10000||Math.abs(frame.origin.y+fixture.dimensions.height)>10000)throw new Error('Fixture extent exceeds the model coordinate bounds');
}
/** Recognizable diagrammatic archetypes. Only semantic feature edges, no triangle wireframe. */
export function fixtureGeometry(document:SpatialDocument,fixture:Fixture,floorID:string):{faces:SceneFace[];edges:SceneEdge[]}{
 const preset=fixturePreset(fixture.catalog.id),{width:w,depth:d,height:h}=fixture.dimensions,frame=fixtureFrame(document,fixture,floorID),offset=fixture.mount.kind==='wall'?d/2:0;
 const faces:SceneFace[]=[],edges:SceneEdge[]=[];
 const point=(x:number,y:number,z:number)=>fixtureWorldPoint(frame,x,y,z+offset);
 const face=(vertices:Point3[])=>{const triangles:number[][]=[];for(let i=1;i<vertices.length-1;i++)triangles.push([0,i,i+1]);faces.push({objectID:fixture.id,role:'fixture',vertices,triangles});};
 const edge=(a:Point3,b:Point3)=>edges.push({objectID:fixture.id,role:'fixture',a,b});
 const box=(x:number,y:number,z:number,width:number,height:number,depth:number)=>{
  const p=[[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1],[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]].map(([a,b,c])=>point(x+a*width/2,y+b*height,z+c*depth/2));
  for(const ids of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])face(ids.map(i=>p[i]));
  for(const [a,b]of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])edge(p[a],p[b]);
 };
 const oval=(x:number,y:number,z:number,width:number,depth:number)=>{const ring=Array.from({length:24},(_,i)=>point(x+Math.cos(i*2*Math.PI/24)*width/2,y,z+Math.sin(i*2*Math.PI/24)*depth/2));for(let i=0;i<ring.length;i++)edge(ring[i],ring[(i+1)%ring.length]);};
 const panel=(x:number,y:number,z:number,width:number,height:number)=>{const p=[point(x-width/2,y,z),point(x+width/2,y,z),point(x+width/2,y+height,z),point(x-width/2,y+height,z)];for(let i=0;i<4;i++)edge(p[i],p[(i+1)%4]);};
 const sink=(base:boolean)=>{if(base)box(0,0,0,w,h*.93,d);else{box(0,0,0,w*.12,h*.82,d*.2);box(0,h*.82,0,w,h*.18,d);}box(0,h*.93,0,w,h*.07,d);const count=preset.bowls??1;for(let i=0;i<count;i++)oval((i-(count-1)/2)*w/count,h+.001,0,w/count*.7,d*.7);};
 switch(preset.archetype){
  case'toilet':box(0,0,-d*.08,w*.55,h*.45,d*.5);box(0,h*.45,-d*.05,w,h*.1,d*.7);oval(0,h*.56,-d*.05,w*.82,d*.5);box(0,0,d*.35,w*.85,h,d*.24);break;
  case'appliance':box(0,0,0,w,h,d);if(preset.id==='washer'||preset.id==='dryer'){panel(0,h*.2,-d/2-.001,w*.65,h*.6);panel(0,h*.86,-d/2-.001,w*.8,h*.07);}else if(preset.id==='range'){for(const x of [-.22,.22])for(const z of [-.22,.22])oval(x*w,h+.001,z*d,w*.3,d*.3);panel(0,h*.2,-d/2-.001,w*.8,h*.55);}else panel(0,h*.08,-d/2-.001,w*.8,h*.82);break;
  case'shower':box(0,0,0,w,h*.025,d);box(0,h*.025,d*.47,w,h*.975,d*.06);box(-w*.47,h*.025,0,w*.06,h*.975,d);oval(0,h*.026,0,w*.08,d*.08);break;
  case'tub':{const tubH=preset.id==='tub-shower'?h*.3:h;box(0,0,0,w,tubH,d);oval(0,tubH+.001,0,w*.8,d*.7);if(preset.id==='tub-shower'){box(0,tubH,d*.47,w,h-tubH,d*.06);panel(-w*.35,tubH,-d*.3,w*.05,h*.55);}break;}
  case'sink':sink(false);break;
  case'vanity':sink(true);break;
  case'furniture':if(preset.id==='built-in-shelves'){box(-w*.475,0,0,w*.05,h,d);box(w*.475,0,0,w*.05,h,d);for(const y of [0,.25,.5,.75,.97])box(0,h*y,0,w,h*.03,d);}else{box(0,0,0,w,h*.55,d);box(0,h*.55,d*.44,w,h*.45,d*.12);}break;
  case'fireplace':box(-w*.4,0,0,w*.2,h,d);box(w*.4,0,0,w*.2,h,d);box(0,h*.72,0,w,h*.28,d);box(0,0,0,w,h*.12,d);if(preset.id==='chimney')box(0,h*.85,0,w*.65,h*.15,d*.7);break;
  case'island':box(0,0,0,w*.94,h*.92,d*.94);box(0,h*.92,0,w,h*.08,d);panel(0,h*.12,-d*.47-.001,w*.78,h*.65);break;
  case'cabinet':box(0,0,0,w,h,d);panel(-w*.24,h*.08,-d/2-.001,w*.45,h*.84);panel(w*.24,h*.08,-d/2-.001,w*.45,h*.84);break;
 }
 return{faces,edges};
}
