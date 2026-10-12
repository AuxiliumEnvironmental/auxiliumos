import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { EditCommand, Floor, Point2, Selection, SpatialDocument, SurfacePoint, SurfacePolygon, SurfaceRef } from '../types';
import { asDomain, domainBounds, rectangle } from '../core/affectedAreaGeometry';
import { resolveSurface, surfaceKey, surfacePointToWorld, surfaceNormal } from '../core/surfaces';
import { wallPath } from '../core/geometry';
import { AFFECTED_COLORS } from '../affectedAreaPalette';
import { affectedCommand, affectedCorners, affectedDragPreview, affectedFenceMatches, affectedOutline, AffectedPreviewQueue, currentAffectedFootprint, planSurfacePoint, type AffectedCommit, type AffectedDrag, type AffectedFence, type AffectedHandle, type AffectedTool } from './affectedAreaManipulation';

export function affectedSurfaceLabel(ref:SurfaceRef):string{return ref.kind==='wall'?`Wall ${ref.wallID}, ${ref.side} side`:ref.kind==='floor'?`Floor, ${ref.roomID}`:`Ceiling, ${ref.roomID}`;}
function surfaceOptions(floor:Floor):SurfaceRef[]{const result:SurfaceRef[]=[];for(const room of floor.rooms){result.push({floorID:floor.id,kind:'floor',roomID:room.id});if(room.ceiling)result.push({floorID:floor.id,kind:'ceiling',roomID:room.id,ceilingID:room.ceiling.id});}for(const wall of floor.walls)for(const side of ['positive','negative'] as const)result.push({floorID:floor.id,kind:'wall',wallID:wall.id,side});return result;}
export function selectionSurface(floor:Floor,selection:Selection|null):SurfaceRef|null{
  if(selection?.surface)return selection.surface;
  if(selection?.kind==='wall')return{floorID:floor.id,kind:'wall',wallID:selection.objectID,side:'positive'};
  if(selection?.kind==='room')return{floorID:floor.id,kind:'floor',roomID:selection.objectID};return null;
}
type ControlProps={document:SpatialDocument;floor:Floor;selection:Selection|null;tool:AffectedTool|null;setTool:(tool:AffectedTool|null)=>void;onSelect:(selection:Selection|null)=>void;onEdit:AffectedCommit;fence:AffectedFence;disabled:boolean;view:'plan'|'model'};
export function AffectedAreaControls({document,floor,selection,tool,setTool,onSelect,onEdit,fence,disabled,view}:ControlProps){
  const observation=selection?.kind==='affectedArea'?document.affectedAreas?.find(a=>a.id===selection.objectID):undefined;
  const current=observation?currentAffectedFootprint(observation):null;
  const initial=current?.surface??selectionSurface(floor,selection),options=useMemo(()=>surfaceOptions(floor),[floor]);
  const [chosen,setChosen]=useState(initial?surfaceKey(initial):''),[menu,setMenu]=useState(false),[kind,setKind]=useState<'moisture'|'fire'|null>(null),[values,setValues]=useState(['','','','']),[range,setRange]=useState(['','']),[error,setError]=useState('');
  const surface=options.find(r=>surfaceKey(r)===chosen)??initial;
  useEffect(()=>{setChosen(initial?surfaceKey(initial):'');setMenu(false);setKind(null);setError('');setRange(['','']);const b=current?domainBounds(asDomain(current.footprint)):null;setValues(b?[String(b.minU),String(b.minV),String(b.maxU-b.minU),String(b.maxV-b.minV)]:['','','','']);},[selection?.objectID,selection?.kind,selection?.surface?surfaceKey(selection.surface):'',document.revision]);
  async function send(command:EditCommand){setError('');try{if(await onEdit([command],fence)){setTool(null);setKind(null);}}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}}
  function chooseKind(value:'moisture'|'fire'){if(!surface)return;setKind(value);setTool({kind:value,surface,mode:'draw',token:crypto.randomUUID()});}
  function saveNumeric(){if(!surface)return;const numbers=values.map(v=>v.trim()===''?NaN:Number(v)),[u,v,width,height]=numbers;if(!numbers.every(Number.isFinite)||width<=0||height<=0){setError('Enter a finite start position and positive width and height in meters.');return;}const footprint=rectangle(u,v,u+width,v+height);
    void send(observation?{type:current&&surfaceKey(current.surface)===surfaceKey(surface)?'reshapeAffectedArea':'reattachAffectedArea',areaID:observation.id,surface,footprint}:{type:'recordAffectedArea',areaID:crypto.randomUUID(),kind:kind!,surface,footprint});
  }
  if(!initial&&!observation)return null;
  const numeric=!!observation||!!kind;
  const selectedRoom=surface&&surface.kind!=='wall'?floor.rooms.find(r=>r.id===surface.roomID):null;
  return <section className="spatial-affected-controls" aria-label="Affected area controls">
    {!observation&&!menu?<button disabled={disabled} onClick={()=>setMenu(true)}>Affected area</button>:<>
      <strong>{observation?`${observation.kind==='moisture'?'Moisture':'Fire damage'} observation`:'Affected area'}</strong>
      <p>Unverified sketch. Not an instrument reading, diagnosis, or scope authorization.</p>
      <label>Surface<select aria-label="Affected surface" disabled={disabled} value={surface?surfaceKey(surface):''} onChange={e=>{setChosen(e.target.value);setTool(null);setKind(null);}}><option value="">Choose an existing surface</option>{options.map(r=><option key={surfaceKey(r)} value={surfaceKey(r)}>{affectedSurfaceLabel(r)}</option>)}</select></label>
      {selectedRoom&&!selectedRoom.ceiling&&<p>No established ceiling is available for this room. A display-only ceiling cannot hold a record.</p>}
      {!observation&&<div className="spatial-affected-actions"><button disabled={disabled||!surface} onClick={()=>chooseKind('moisture')}>Record moisture</button><button disabled={disabled||!surface} onClick={()=>chooseKind('fire')}>Record fire damage</button></div>}
      {tool?.mode==='draw'&&<p role="status">{view==='plan'&&surface?.kind==='wall'&&!tool.verticalRange?'Confirm the vertical range below, then drag along the wall.':'Drag on the selected surface to record a region. Empty-space dragging still navigates.'}</p>}
      {tool?.mode==='draw'&&view==='plan'&&surface?.kind==='wall'&&<fieldset><legend>Explicit wall elevation range</legend><div className="spatial-affected-fields"><label>Bottom (m)<input aria-label="Affected bottom" type="number" step="any" value={range[0]} onChange={e=>setRange([e.target.value,range[1]])}/></label><label>Top (m)<input aria-label="Affected top" type="number" step="any" value={range[1]} onChange={e=>setRange([range[0],e.target.value])}/></label></div><button disabled={disabled} onClick={()=>{const [bottom,top]=range.map(v=>v.trim()===''?NaN:Number(v));if(!Number.isFinite(bottom)||!Number.isFinite(top)||bottom<0||top<=bottom){setError('Confirm an explicit bottom and top above the wall base.');return;}setError('');setTool({...tool,verticalRange:[bottom,top],token:crypto.randomUUID()});}}>Confirm vertical range</button><p>Height above the wall base, entered by you. No observed height is inferred from a plan line.</p></fieldset>}
      {observation&&<><p>Reference: {observation.id}. Review: {observation.reviewState}. Recorded at revision {observation.sourceRevision}.</p>{!current&&<p role="status">Retained observation has split or unresolved attachments. Original footprint and support remain saved. Choose a surface and explicitly reattach it with the rectangle controls.</p>}{current&&<div className="spatial-affected-actions"><button disabled={disabled} onClick={()=>setTool({kind:observation.kind,surface:current.surface,mode:'move',areaID:observation.id,token:crypto.randomUUID()})}>Move region</button><button disabled={disabled} onClick={()=>setTool({kind:observation.kind,surface:current.surface,mode:'resize',areaID:observation.id,token:crypto.randomUUID()})}>Resize region</button></div>}</>}
      {numeric&&surface&&<fieldset><legend>Exact rectangle in meters</legend><div className="spatial-affected-fields">{[surface.kind==='wall'?'Along wall':'X',surface.kind==='wall'?'Bottom above base':'Z','Width',surface.kind==='wall'?'Height':'Depth'].map((label,i)=><label key={i}>{label}<input aria-label={`Affected ${label}`} type="number" step="any" disabled={disabled} value={values[i]} onChange={e=>setValues(values.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div><p>Saving explicitly records this rectangle on current material. Existing revision history retains the previous shape.</p><button disabled={disabled||!observation&&!kind} onClick={saveNumeric}>{observation?(current&&surfaceKey(current.surface)===surfaceKey(surface)?'Save affected rectangle':'Reattach observation'):'Record rectangle'}</button></fieldset>}
      {tool&&<button onClick={()=>{setTool(null);setKind(null);}}>Cancel recording / adjustment</button>}
      {observation&&<div className="spatial-affected-actions"><button disabled={disabled||observation.reviewState==='unresolved'} onClick={()=>void send({type:'reviewAffectedArea',areaID:observation.id})}>Mark observation reviewed</button><button disabled={disabled} onClick={()=>{void send({type:'deleteAffectedArea',areaID:observation.id});onSelect(null);}}>Delete observation</button></div>}
      {error&&<p className="spatial-error-text" role="alert">{error}</p>}
    </>}
  </section>;
}

type PlanProps={document:SpatialDocument;floor:Floor;selection:Selection|null;tool:AffectedTool|null;onTool:(tool:AffectedTool|null)=>void;onSelect:(selection:Selection|null)=>void;onEdit:AffectedCommit;onError:(message:string)=>void;fence:AffectedFence;disabled:boolean;units:number};
/** F05-only SVG interaction. Existing plan navigation owns all unclaimed input. */
export function AffectedPlanInteraction({document:doc,floor,selection,tool,onTool,onEdit,onError,fence,disabled,units}:PlanProps){
  const g=useRef<SVGGElement>(null),drag=useRef<AffectedDrag|null>(null),dragTool=useRef<AffectedTool|null>(null),last=useRef<{chart:SurfacePoint;world:Point2}|null>(null),previewRef=useRef<SurfacePolygon|null>(null),[preview,setPreview]=useState<SurfacePolygon|null>(null);
  const live=useRef({fence,disabled,tool});live.current={fence,disabled,tool};
  const blocked=useRef(new Set<number>()),matrixAtStart=useRef<number[]|null>(null);
  const area=selection?.kind==='affectedArea'?doc.affectedAreas?.find(a=>a.id===selection.objectID):null,current=area?currentAffectedFootprint(area):null;
  const surface=tool?.surface??current?.surface;
  const publish=(point:SurfacePoint)=>{if(!drag.current)return;try{const p=affectedDragPreview(drag.current,point);previewRef.current=p;setPreview(p);}catch(cause){cancel();onError(cause instanceof Error?cause.message:String(cause));}};
  const queue=useRef<AffectedPreviewQueue<SurfacePoint>|null>(null);if(!queue.current)queue.current=new AffectedPreviewQueue(p=>publish(p),cb=>requestAnimationFrame(cb),id=>cancelAnimationFrame(id));
  const cancel=()=>{if(drag.current)blocked.current.add(drag.current.pointerID);queue.current?.cancel();matrixAtStart.current=null;drag.current=null;dragTool.current=null;last.current=null;previewRef.current=null;setPreview(null);};
  useEffect(()=>{cancel();},[fence.documentID,fence.revision,fence.contextKey,disabled,tool?.token,selection?.objectID,units]);
  useEffect(()=>{
    const element=g.current?.ownerSVGElement;
    const stop=()=>{cancel();blocked.current.clear();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};
    const second=(e:PointerEvent)=>{if(drag.current&&e.pointerId!==drag.current.pointerID){cancel();blocked.current.add(e.pointerId);}if(blocked.current.size){blocked.current.add(e.pointerId);e.preventDefault();e.stopImmediatePropagation();}};
    const finish=(e:PointerEvent)=>{if(blocked.current.delete(e.pointerId)){e.preventDefault();e.stopImmediatePropagation();}};
    window.addEventListener('blur',stop);window.document.addEventListener('visibilitychange',stop);window.addEventListener('keydown',key);element?.addEventListener('pointerdown',second,true);element?.addEventListener('pointerup',finish,true);element?.addEventListener('pointercancel',finish,true);
    return()=>{queue.current?.cancel();window.removeEventListener('blur',stop);window.document.removeEventListener('visibilitychange',stop);window.removeEventListener('keydown',key);element?.removeEventListener('pointerdown',second,true);element?.removeEventListener('pointerup',finish,true);element?.removeEventListener('pointercancel',finish,true);};
  },[]);
  function world(event:{clientX:number;clientY:number}):Point2|null{const svg=g.current?.ownerSVGElement,matrix=svg?.getScreenCTM();if(!svg||!matrix)return null;const values=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f];if(drag.current&&matrixAtStart.current?.some((v,i)=>Math.abs(v-values[i])>1e-8)){cancel();return null;}matrixAtStart.current=values;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const at=p.matrixTransform(matrix.inverse());return{x:at.x,z:at.y};}
  function point(event:{clientX:number;clientY:number},initial=false):SurfacePoint|null{if(!surface)return null;const p=world(event);if(!p)return null;const at=planSurfacePoint(doc,surface,p,last.current?.chart.u??0,initial?undefined:last.current?.world);if(at)last.current={chart:at,world:p};return at;}
  function begin(event:ReactPointerEvent,handle:AffectedHandle){if(disabled||event.button!==0||!surface||blocked.current.has(event.pointerId))return;if(tool?.mode==='draw'&&surface.kind==='wall'&&!tool.verticalRange){onError('Confirm the explicit vertical range in Details before drawing on a wall in plan.');return;}const at=point(event,true);if(!at)return;event.stopPropagation();event.preventDefault();
    const selectedTool=tool??(area&&current?{kind:area.kind,surface:current.surface,mode:'resize' as const,areaID:area.id,token:area.id}:null);if(!selectedTool)return;
    dragTool.current=selectedTool;drag.current={start:at,original:selectedTool.mode==='draw'?null:current?.footprint??null,handle,planWall:surface.kind==='wall',verticalRange:tool?.verticalRange,fence:{...fence},pointerID:event.pointerId};g.current?.setPointerCapture(event.pointerId);
  }
  function move(event:ReactPointerEvent){if(!drag.current||drag.current.pointerID!==event.pointerId)return;event.stopPropagation();const samples=event.nativeEvent.getCoalescedEvents?.()??[event.nativeEvent];for(const sample of samples.length?samples:[event.nativeEvent]){const at=point(sample);if(at)queue.current?.move(at);}}
  function end(event:ReactPointerEvent){const d=drag.current,t=dragTool.current;if(!d||!t||d.pointerID!==event.pointerId)return;event.stopPropagation();const at=point(event);if(at)queue.current?.release(at);const p=previewRef.current,valid=!live.current.disabled&&affectedFenceMatches(d.fence,live.current.fence);cancel();blocked.current.delete(event.pointerId);if(!valid||!p||!at)return;const command=affectedCommand(t,p);if(command&&JSON.stringify(p)!==JSON.stringify(d.original)){void onEdit([command],d.fence);onTool(null);}}
  const polygon=preview??current?.footprint,handles:{handle:AffectedHandle;anchor:Point2}[]=[];
  if(polygon&&surface){if(surface.kind==='wall'){const b=domainBounds(asDomain(polygon));for(const [i,handle] of (['start','end'] as const).entries()){const u=i?b.maxU:b.minU,at=surfacePointToWorld(doc,surface,{u,v:b.minV}),normal=surfaceNormal(doc,surface,u);if(at&&normal)handles.push({handle,anchor:{x:at.x+normal.x*.06,z:at.z+normal.z*.06}});}}else affectedCorners(polygon).forEach((p,i)=>handles.push({handle:i as 0|1|2|3,anchor:{x:p.u,z:p.v}}));}
  const center=handles.length?handles.reduce((p,h)=>({x:p.x+h.anchor.x/handles.length,z:p.z+h.anchor.z/handles.length}),{x:0,z:0}):{x:0,z:0};
  const displayHandles=handles.map((h,i)=>{let dx=h.anchor.x-center.x,dz=h.anchor.z-center.z;if(surface?.kind==='wall'){const length=Math.hypot(dx,dz);if(length<units*25){const other=handles[1-i]?.anchor;dx=other?h.anchor.x-other.x:i?1:-1;dz=other?h.anchor.z-other.z:0;const l=Math.hypot(dx,dz)||1;dx=dx/l*units*25;dz=dz/l*units*25;}return{...h,position:{x:center.x+dx,z:center.z+dz}};}return{...h,position:{x:center.x+(Math.sign(dx)||1)*Math.max(Math.abs(dx),units*25),z:center.z+(Math.sign(dz)||1)*Math.max(Math.abs(dz),units*25)}};});
  const targets:SurfacePolygon[]=tool?.mode==='draw'&&surface&&surface.kind!=='wall'?(resolveSurface(doc,surface)?.domain.polygons??[]):[];
  const outlinePath=(p:SurfacePolygon):string=>{if(!surface)return '';try{const points=affectedOutline(doc,surface,p);return points.flatMap((v,i)=>i%2?[]:[`M ${v.x},${v.z} L ${points[i+1].x},${points[i+1].z}`]).join(' ');}catch{return '';}};
  const path=(points:Point2[])=>points.map(p=>`${p.x},${p.z}`).join(' '),color=AFFECTED_COLORS[tool?.kind??area?.kind??'moisture'].line;
  return <g ref={g} data-affected-interaction="true" onPointerMove={move} onPointerUp={end} onPointerCancel={()=>cancel()} onLostPointerCapture={()=>{if(drag.current)cancel();}}>
    {!disabled&&tool?.mode==='draw'&&surface?.kind==='wall'&&tool.verticalRange&&<polyline data-affected-draw="wall" points={path(wallPath(floor,floor.walls.find(w=>w.id===(surface as Extract<SurfaceRef,{kind:'wall'}>).wallID)!))} stroke="transparent" strokeWidth={units*44} fill="none" onPointerDown={e=>begin(e,'body')}/>}
    {!disabled&&targets.map((target,i)=><path key={i} data-affected-draw={surface?.kind} d={[target.outer,...target.holes].map(r=>`M ${r.map(p=>`${p.u},${p.v}`).join(' L ')} Z`).join(' ')} fill="transparent" fillRule="evenodd" onPointerDown={e=>begin(e,'body')}/>)}
    {!disabled&&current&&tool?.mode!=='draw'&&surface?.kind!=='wall'&&<polygon data-affected-move="true" points={path(current.footprint.outer.map(p=>({x:p.u,z:p.v})))} fill="transparent" onPointerDown={e=>begin(e,'body')}/>}
    {!disabled&&current&&tool?.mode!=='draw'&&surface?.kind==='wall'&&<path data-affected-move="true" d={outlinePath(current.footprint)} fill="none" stroke="transparent" strokeWidth={units*22} onPointerDown={e=>begin(e,'body')}/>}
    {preview&&surface&&<path data-affected-preview="true" d={outlinePath(preview)} fill="none" stroke={color} strokeWidth={units*2} pointerEvents="none"/>}
    {!disabled&&tool?.mode!=='draw'&&displayHandles.map((h,i)=><g key={i}><line x1={h.anchor.x} y1={h.anchor.z} x2={h.position.x} y2={h.position.z} stroke={color} strokeWidth={units} pointerEvents="none"/><circle data-affected-handle={String(h.handle)} cx={h.position.x} cy={h.position.z} r={units*22} fill="transparent" onPointerDown={e=>begin(e,h.handle)}/><circle cx={h.anchor.x} cy={h.anchor.z} r={units*3} fill={color} pointerEvents="none"/><circle cx={h.position.x} cy={h.position.z} r={units*6} fill="white" stroke={color} strokeWidth={units*2} pointerEvents="none"/></g>)}
  </g>;
}
