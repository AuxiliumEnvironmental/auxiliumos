import { openingPlanLines } from '../core/openings';
import { materialPolygons, profileRing } from '../core/cutoutGeometry';
import { fixtureGeometry } from '../core/fixtures';
import { surfacePointToWorld } from '../core/surfaces';
import { memo, useMemo, useRef } from 'react';
import { affectedPlanGeometry } from './affectedPlanGeometry';
import { FloorGeometryIndex } from '../core/geometry';
import type { Floor, Point2, Selection, SpatialDocument } from '../types';
import { openingPath } from './geometry';
import type { OpeningPreview } from './openingManipulation';

type Props = { document:SpatialDocument; canSelectAffected:boolean; onSelect:(selection:Selection)=>void; floor: Floor; selection: Selection | null; groupSelection: Selection[]; units: number; fills: boolean; openingPreview: OpeningPreview | null };
const path = (points: Point2[]) => points.map(point => `${point.x},${point.z}`).join(' ');

/** Saved geometry stays out of cursor-only React updates. One index serves all
 * paths, instead of rebuilding node maps for each wall, room and opening. */
export const PlanGeometry = memo(function PlanGeometry({ document,canSelectAffected,onSelect,floor, selection, groupSelection, units, fills, openingPreview }: Props) {
  const affected=useMemo(()=>affectedPlanGeometry(document,floor),[document,floor]);
  const selectRef=useRef(onSelect);selectRef.current=onSelect;
  // Observation coverage does not change with the selected room or view. Keep
  // its large SVG layers stable while delegating clicks to the latest fence.
  const affectedFills=useMemo(()=><>
    {affected.polygons.map((p,i)=><polygon key={`affected-fill-${i}`} data-affected-area={p.areaID} points={path(p.points)} fill={p.color} pointerEvents={canSelectAffected?'visiblePainted':'none'} onPointerDown={e=>{if(canSelectAffected){e.stopPropagation();selectRef.current({floorID:floor.id,kind:'affectedArea',objectID:p.areaID});}}}/>)}
    {affected.lines.filter(l=>!l.wall).map((l,i)=><line key={`affected-grid-${i}`} data-affected-area={l.areaID} x1={l.a.x} y1={l.a.z} x2={l.b.x} y2={l.b.z} stroke={l.color} strokeWidth={units} pointerEvents={canSelectAffected?'visiblePainted':'none'} onPointerDown={e=>{if(canSelectAffected){e.stopPropagation();selectRef.current({floorID:floor.id,kind:'affectedArea',objectID:l.areaID,surface:l.surface});}}}/>)}
  </>,[affected,canSelectAffected,floor.id,units]);
  const affectedWalls=useMemo(()=>affected.lines.filter(l=>l.wall).map((l,i)=><g key={`affected-wall-${i}`}><line x1={l.a.x} y1={l.a.z} x2={l.b.x} y2={l.b.z} stroke={l.color} strokeWidth={units*4} pointerEvents="none"/><line data-affected-area={l.areaID} x1={l.a.x} y1={l.a.z} x2={l.b.x} y2={l.b.z} stroke="transparent" strokeWidth={units*14} pointerEvents={canSelectAffected?'stroke':'none'} onPointerDown={e=>{if(canSelectAffected){e.stopPropagation();selectRef.current({floorID:floor.id,kind:'affectedArea',objectID:l.areaID,surface:l.surface});}}}/></g>),[affected,canSelectAffected,floor.id,units]);
  const index = useMemo(() => new FloorGeometryIndex(floor), [floor]);
  const walls = useMemo(() => new Map(floor.walls.map(wall => [wall.id, wall])), [floor]);
  const group = useMemo(() => new Set(groupSelection.filter(item => item.floorID === floor.id).map(item => `${item.kind}:${item.objectID}`)), [groupSelection, floor.id]);
  const inGroup = (kind: Selection['kind'], id: string) => group.has(`${kind}:${id}`);
  const selected = (kind: Selection['kind'], id: string) => inGroup(kind, id) || selection?.kind === kind && selection.objectID === id;
  const variant=(kind:Selection['kind'],id:string)=>inGroup(kind,id)?2:selection?.kind===kind&&selection.objectID===id?1:0;
  // Selection changes only a few attributes. Prebuild their three exact visual
  // states once per geometry/scale snapshot instead of rebuilding every path.
  const saved=useMemo(()=>{
    const rooms=floor.rooms.flatMap(room=>{let boundary:Point2[];try{boundary=index.boundary(room);}catch{return[];}
      const rings=materialPolygons({polygons:[{outer:boundary.map(p=>({u:p.x,v:p.z})),holes:(floor.cutouts??[]).filter(c=>c.surface.kind==='floor'&&c.surface.roomID===room.id).map(c=>profileRing(c.profile))}]}).map(ring=>path(ring.map(p=>({x:p.u,z:p.v}))));
      const center=boundary.reduce((p,n)=>({x:p.x+n.x/boundary.length,z:p.z+n.z/boundary.length}),{x:0,z:0});
      return[{id:room.id,variants:[0,1,2].map(state=><g key={room.id}>{rings.map((points,i)=><polygon key={i} data-group-selected={state===2?room.id:undefined} points={points} fill={state?'#cde4f5':fills?'#edf4f7':'#fff'} stroke="none"/>)}</g>),label:<text key={`label-${room.id}`} x={center.x} y={center.z} textAnchor="middle" dominantBaseline="middle" fontSize={units*14} fill="#485765" pointerEvents="none">{room.label}</text>}];
    });
    const wallElements=floor.walls.map(wall=>{const points=path(index.path(wall));return{id:wall.id,variants:[0,1,2].map(state=><polyline key={wall.id} data-group-selected={state===2?wall.id:undefined} points={points} fill="none" stroke={state?'#177aac':wall.provenance.origin==='inferred'?'#b46b25':'#283b4a'} strokeWidth={units*(state?5:3)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={wall.provenance.origin==='inferred'?`${units*7} ${units*5}`:undefined}/>)};});
    const openings=floor.openings.map(opening=>{const wall=walls.get(opening.wallID)!,wallPoints=index.path(wall),points=path(openingPath(wallPoints,opening.offset,opening.width)),lines=openingPlanLines(floor,opening,wallPoints),invalid=openingPreview?.opening.id===opening.id&&!!openingPreview.error;
      return{id:opening.id,variants:[0,1,2].map(state=><g key={opening.id} data-group-selected={state===2?opening.id:undefined} data-opening-object={opening.id} data-opening-preview={openingPreview?.opening.id===opening.id?invalid?'invalid':'valid':undefined}><polyline points={points} fill="none" stroke="#f8fafb" strokeWidth={units*7}/><polyline points={points} fill="none" stroke={invalid?'#a25738':state?'#126b9c':opening.kind==='window'?'#70a8c6':'#7095a6'} strokeWidth={units*(state?4:2)} strokeDasharray={opening.kind==='window'?undefined:`${units*3} ${units*3}`}/>{lines.map((line,i)=><line key={i} x1={line.a.x} y1={line.a.z} x2={line.b.x} y2={line.b.z} stroke={invalid?'#a25738':state?'#126b9c':'#7095a6'} strokeWidth={units*1.5}/>)}</g>)};
    });
    const nodes=floor.nodes.map(node=>({id:node.id,variants:[0,1,2].map(state=><circle key={node.id} data-group-selected={state===2?node.id:undefined} cx={node.point.x} cy={node.point.z} r={units*(state?7:3)} fill={state?'#177aac':'#fff'} stroke={state?'#fff':'#304759'} strokeWidth={units*1.5}/>)}));
    return{rooms,walls:wallElements,openings,nodes};
  },[floor,index,walls,units,fills,openingPreview]);
  return <g data-plan-geometry="true">
      {saved.rooms.map(item=>item.variants[variant('room',item.id)])}
      {affectedFills}
      {(floor.areas ?? []).map(area => <polygon key={area.id} data-group-selected={inGroup('area', area.id) ? area.id : undefined} points={path(area.polygon)} fill={selected('area', area.id) ? '#8dbbf566' : '#b7d4ed35'} stroke="#789cb7" strokeWidth={units * 1.5} strokeDasharray={`${units * 5} ${units * 4}`} />)}
      {saved.walls.map(item=>item.variants[variant('wall',item.id)])}
      {saved.openings.map(item=>item.variants[variant('opening',item.id)])}
      {(floor.fixtures??[]).map(fixture=>{let geometry;try{geometry=fixtureGeometry({...document,floors:document.floors.map(f=>f.id===floor.id?floor:f)},fixture,floor.id);}catch{return null;}return <g key={fixture.id} data-fixture-object={fixture.id}>{geometry.faces.map((face,i)=><polygon key={i} points={path(face.vertices)} fill={selected('fixture',fixture.id)?'#cde9ff':'#ffffff'} stroke="none"/>)}{geometry.edges.map((e,i)=><line key={i} x1={e.a.x} y1={e.a.z} x2={e.b.x} y2={e.b.z} stroke="#167bab" strokeWidth={units*(selected('fixture',fixture.id)?2:1.2)}/>)}</g>;})}
      {(floor.cutouts??[]).map(cutout=>{const points=profileRing(cutout.profile).map(p=>surfacePointToWorld(document,cutout.surface,p)).filter(p=>p!==null);return <g key={cutout.id} data-cutout-object={cutout.id}><polyline points={path([...points,points[0]])} fill="none" stroke="#167bab" strokeWidth={units*(selected('cutout',cutout.id)?4:2)} strokeDasharray={cutout.surface.kind==='ceiling'?`${units*5} ${units*4}`:undefined}/></g>;})}
      {saved.nodes.map(item=>item.variants[variant('node',item.id)])}
      {affectedWalls}
      {saved.rooms.map(item=>item.label)}
  </g>;
});
