import { wallRunBounds } from '../core/surfaces';
import type { Fixture, Point3, SpatialDocument } from '../types';
import { fixtureFrame, fixtureWorldPoint, type FixtureFrame } from '../core/fixtures';
export type FixtureDragMode='move'|'corner0'|'corner1'|'corner2'|'corner3'|'height';
export interface FixtureDrag { original:Fixture; floorID:string; revision:number; frame:FixtureFrame; grab:Point3; mode:FixtureDragMode;run?:ReturnType<typeof wallRunBounds> }
export function beginFixtureDrag(document:SpatialDocument,floorID:string,fixture:Fixture,mode:FixtureDragMode,grab:Point3):FixtureDrag{return{original:structuredClone(fixture),floorID,revision:document.revision,frame:fixtureFrame(document,fixture,floorID),grab:{...grab},mode,run:fixture.mount.kind==='wall'?wallRunBounds(document,fixture.mount.surface,fixture.mount.u):undefined};}
export function fixtureDragPreview(drag:FixtureDrag,point:Point3):Fixture{
 const result=structuredClone(drag.original),delta={x:point.x-drag.grab.x,y:point.y-drag.grab.y,z:point.z-drag.grab.z},dx=delta.x*drag.frame.x.x+delta.z*drag.frame.x.z,dz=delta.x*drag.frame.z.x+delta.z*drag.frame.z.z,m=result.mount;
 if(drag.mode==='move'){if(m.kind==='floor'){m.position.x+=delta.x;m.position.z+=delta.z;}else{m.u+=dx;m.v+=delta.y;if(drag.run&&(m.u-result.dimensions.width/2<drag.run.lo-1e-6||m.u+result.dimensions.width/2>drag.run.hi+1e-6))throw new Error('Rigid fixture drag must stay on its original straight wall run');}return result;}
 if(drag.mode==='height'){result.dimensions.height+=delta.y;if(result.dimensions.height<.01)throw new Error('Fixture height cannot invert or become zero');return result;}
 const i=Number(drag.mode.slice(-1)),sx=[-1,1,1,-1][i],sz=[-1,-1,1,1][i];
 result.dimensions.width+=sx*dx;result.dimensions.depth+=sz*dz;
 if(result.dimensions.width<.01||result.dimensions.depth<.01)throw new Error('Fixture dimensions cannot invert or become zero');
 if(m.kind==='floor'){m.position.x+=(drag.frame.x.x*dx+drag.frame.z.x*dz)/2;m.position.z+=(drag.frame.x.z*dx+drag.frame.z.z*dz)/2;}
 else{m.u+=dx/2;if(drag.run&&(m.u-result.dimensions.width/2<drag.run.lo-1e-6||m.u+result.dimensions.width/2>drag.run.hi+1e-6))throw new Error('Rigid fixture resize must stay on its original straight wall run');if(sz<0&&Math.abs(dz)>1e-6)throw new Error('Use an outward corner to change wall fixture depth');}
 return result;
}
export function fixtureHandlePoints(document:SpatialDocument,floorID:string,fixture:Fixture):{mode:FixtureDragMode;point:Point3}[]{
 const frame=fixtureFrame(document,fixture,floorID),{width:w,depth:d,height:h}=fixture.dimensions,wall=fixture.mount.kind==='wall';
 const points=[[-w/2,wall?0:-d/2],[w/2,wall?0:-d/2],[w/2,wall?d:d/2],[-w/2,wall?d:d/2]];
 return points.map(([x,z],i)=>({mode:('corner'+i) as FixtureDragMode,point:fixtureWorldPoint(frame,x,0,z)})).filter((_,i)=>!wall||i>=2).concat({mode:'height',point:fixtureWorldPoint(frame,0,h,wall?d/2:0)});
}
