import { useEffect, useRef, useState } from 'react';
import { roomBoundary, wallPath } from '../core';
import type { EditCommand, Floor, Point2, Selection } from '../types';
import { distanceToPath, editedProvenance, objectLabel, openingPath, pointInPolygon, uid } from './geometry';

export type PlanViewState = { x: number; z: number; width: number; height: number };
export type CanvasTool = 'select' | 'pan' | 'wall' | 'area';
type Props = { rememberedView?: PlanViewState; rememberView?: (view: PlanViewState) => void; floor: Floor; selection: Selection | null; onSelect: (selection: Selection | null) => void; onEdit: (commands: EditCommand[]) => void; disabled: boolean; tool: CanvasTool; onTool: (tool: CanvasTool) => void; onError: (message: string) => void };
export function FloorplanCanvas({ rememberedView, rememberView, floor, selection, onSelect, onEdit, disabled, tool, onTool, onError }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const choiceDialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState(rememberedView ?? { x: -1.5, z: -1.5, width: 11, height: 7 });
  const viewRef=useRef(view);viewRef.current=view;
  const rememberRef=useRef(rememberView);rememberRef.current=rememberView;
  const layoutReady=useRef(false), framed=useRef(false);
  useEffect(()=>()=>rememberRef.current?.({...viewRef.current}),[]);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [points, setPoints] = useState<Array<Point2 & { nodeID?: string }>>([]);
  const [choosingDrawCorner, setChoosingDrawCorner] = useState(false);
  const [preview, setPreview] = useState<{ kind: 'node' | 'wall'; id: string; delta: Point2 } | null>(null);
  const [choices, setChoices] = useState<Selection[]>([]);
  const [fills, setFills] = useState(true);
  const gesture = useRef<{ start: Point2; clientX: number; clientY: number; view: typeof view; drag?: Selection; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; center: Point2; view: typeof view } | null>(null);
  const floorID = useRef(floor.id);
  const units = view.width / size.width;
  const fit = () => {
    const all = [...floor.nodes.map(n => n.point), ...(floor.areas ?? []).flatMap(a => a.polygon)];
    if (!all.length) { setView({ x: -1.5, z: -1.5, width: 11, height: 11 * size.height / size.width }); return; }
    const minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x)), minZ = Math.min(...all.map(p => p.z)), maxZ = Math.max(...all.map(p => p.z));
    const aspect = size.width / size.height, width = Math.max(maxX - minX + 3, (maxZ - minZ + 3) * aspect, 4);
    setView({ x: (minX + maxX - width) / 2, z: (minZ + maxZ - width / aspect) / 2, width, height: width / aspect });
  };
  useEffect(() => { const el = svg.current; if (!el) return; const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (width > 0 && height > 0) {layoutReady.current=true;setSize({ width, height });} }); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => { if(!layoutReady.current)return;if(!framed.current&&!rememberedView){framed.current=true;fit();return;}framed.current=true;setView(previous=>{const height=previous.width*size.height/size.width;return{...previous,z:previous.z+(previous.height-height)/2,height};}); }, [size.width, size.height]);
  useEffect(() => { if (floorID.current !== floor.id) { floorID.current = floor.id; setPoints([]); setPreview(null); setChoices([]); } }, [floor.id]);
  useEffect(() => { setPoints([]); setChoices([]); setChoosingDrawCorner(false); }, [tool]);
  useEffect(() => { if(!choices.length)return;const active=window.document.activeElement as HTMLElement|null;choiceDialog.current?.showModal();return()=>active?.focus(); },[!!choices.length]);
  const world = (x: number, y: number): Point2 => { const rect = svg.current!.getBoundingClientRect(); return { x: view.x + (x - rect.left) / rect.width * view.width, z: view.z + (y - rect.top) / rect.height * view.height }; };
  const displayedFloor: Floor = preview ? { ...floor, nodes: floor.nodes.map(n => (preview.kind === 'node' ? n.id === preview.id : floor.walls.find(w => w.id === preview.id)?.nodeIDs.includes(n.id)) ? { ...n, point: { x: n.point.x + preview.delta.x, z: n.point.z + preview.delta.z } } : n) } : floor;
  function candidates(p: Point2): Selection[] {
    const select = (kind: Selection['kind'], id: string): Selection => ({ floorID: floor.id, kind, objectID: id });
    const nearNodes = floor.nodes.filter(n => Math.hypot(n.point.x - p.x, n.point.z - p.z) <= units * 22);
    if (nearNodes.length) return nearNodes.map(n => select('node', n.id));
    const nearOpenings = floor.openings.filter(o => { const wall = floor.walls.find(w => w.id === o.wallID)!; const path = wallPath(floor, wall); return distanceToPath(p, openingPath(path, o.offset, o.width)) <= units * 22; });
    if (nearOpenings.length) return nearOpenings.map(o => select('opening', o.id));
    const nearWalls = floor.walls.filter(w => distanceToPath(p, wallPath(floor, w)) <= units * 22);
    if (nearWalls.length) return nearWalls.map(w => select('wall', w.id));
    return [...(floor.areas ?? []).filter(a => pointInPolygon(p, a.polygon)).map(a => select('area', a.id)), ...floor.rooms.filter(r => { try { return pointInPolygon(p, roomBoundary(floor, r)); } catch { return false; } }).map(r => select('room', r.id))];
  }
  function choose(hits: Selection[]) { setChoosingDrawCorner(false); if (hits.length === 1) { onSelect(hits[0]); setChoices([]); } else if (hits.length > 1) setChoices(hits); else { onSelect(null); setChoices([]); } }
  function draw(p: Point2) {
    const candidates = floor.nodes.filter(n => Math.hypot(p.x - n.point.x, p.z - n.point.z) < units * 16);
    if (candidates.length > 1) {
      setChoosingDrawCorner(true);setChoices(candidates.map(n=>({floorID:floor.id,kind:'node',objectID:n.id})));return;
    }
    const snap = candidates[0]; appendDrawPoint(snap ? { ...snap.point, nodeID: snap.id } : p);
  }
  function appendDrawPoint(next: Point2 & { nodeID?: string }) {
    if (tool === 'wall' && points.length === 1) {
      if (Math.hypot(next.x - points[0].x, next.z - points[0].z) < units * 10) { onError('Choose a different end point for the wall.'); return; }
      const newNodes: Floor['nodes'] = [];
      const ids = [points[0], next].map(point => {
        if (point.nodeID && floor.nodes.some(node=>node.id===point.nodeID)) return point.nodeID;
        const node = { id: uid(), point: { x: point.x, z: point.z } }; newNodes.push(node); return node.id;
      });
      onEdit([{ type: 'addWall', floorID: floor.id, newNodes, wall: { id: uid(), nodeIDs: ids, baseY: 0, height: 2.6, heightBasis: 'assumed', provenance: editedProvenance() } }]);
      setPoints([]);
    } else setPoints(previous => [...previous, next]);
  }
  function finishArea() { if (points.length < 3) return; onEdit([{ type: 'setArea', floorID: floor.id, area: { id: uid(), label: 'New area', polygon: points.map(p=>({x:p.x,z:p.z})), provenance: editedProvenance() } }]); setPoints([]); onTool('select'); }
  const path = (ps: Point2[]) => ps.map(p => `${p.x},${p.z}`).join(' ');
  const selected = (kind: Selection['kind'], id: string) => selection?.kind === kind && selection.objectID === id;
  const zoom = (factor: number) => setView(v => { const width = Math.min(40000, Math.max(0.25, v.width * factor)), height = width * size.height / size.width; return { x: v.x + (v.width - width) / 2, z: v.z + (v.height - height) / 2, width, height }; });
  return <div className="spatial-plan">
    <svg ref={svg} viewBox={`${view.x} ${view.z} ${view.width} ${view.height}`} preserveAspectRatio="none" role="img" aria-label="Editable floor plan. Choose an object from the Objects panel for keyboard editing." tabIndex={0}
      onKeyDown={event => { if (event.key === 'Escape') { setPoints([]); setChoices([]); onTool('select'); } if (event.key === '+' || event.key === '=') zoom(0.8); if (event.key === '-') zoom(1.25); }}
      onWheel={event => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.12 : 0.88); }}
      onPointerDown={event => { if (disabled || event.button !== 0) return; pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});event.currentTarget.setPointerCapture(event.pointerId);if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),center:world((a.x+b.x)/2,(a.y+b.y)/2),view};gesture.current=null;setPreview(null);return;} const p = world(event.clientX, event.clientY); const hits = tool === 'select' ? candidates(p) : []; const current = hits.find(h => h.kind === selection?.kind && h.objectID === selection?.objectID); gesture.current = { start: p, clientX: event.clientX, clientY: event.clientY, view, moved: false, drag: current && (current.kind === 'wall' || current.kind === 'node') ? current : undefined }; }}
      onPointerMove={event => {if(pointers.current.has(event.pointerId))pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinch.current&&pointers.current.size===2){const[a,b]=[...pointers.current.values()],start=pinch.current,distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance<1)return;const width=Math.min(40000,Math.max(.25,start.view.width*start.distance/distance)),height=width*size.height/size.width,rect=svg.current!.getBoundingClientRect();setView({x:start.center.x-((a.x+b.x)/2-rect.left)/rect.width*width,z:start.center.z-((a.y+b.y)/2-rect.top)/rect.height*height,width,height});return;} const g = gesture.current; if (!g || disabled) return; if (Math.hypot(event.clientX - g.clientX, event.clientY - g.clientY) < 5 && !g.moved) return; g.moved = true; const dx = (event.clientX - g.clientX) * g.view.width / size.width, dz = (event.clientY - g.clientY) * g.view.height / size.height; if (g.drag) setPreview({ kind: g.drag.kind as 'node' | 'wall', id: g.drag.objectID, delta: { x: dx, z: dz } }); else if (tool === 'select' || tool === 'pan') setView({ ...g.view, x: g.view.x - dx, z: g.view.z - dz }); }}
      onPointerUp={event => {pointers.current.delete(event.pointerId);if(pinch.current){pinch.current=null;gesture.current=null;return;} const g = gesture.current; gesture.current = null; if (!g || disabled) return; if (preview && g.moved) { if (preview.kind === 'node') { const node = floor.nodes.find(n => n.id === preview.id)!; onEdit([{ type: 'moveNode', floorID: floor.id, nodeID: node.id, point: { x: node.point.x + preview.delta.x, z: node.point.z + preview.delta.z } }]); } else onEdit([{ type: 'moveWall', floorID: floor.id, wallID: preview.id, translation: preview.delta }]); setPreview(null); } else if (!g.moved) { const p = world(event.clientX, event.clientY); if (tool === 'wall' || tool === 'area') draw(p); else if (tool === 'select') choose(candidates(p)); } }}
      onPointerCancel={event => {pointers.current.delete(event.pointerId);pinch.current=null; gesture.current = null; setPreview(null); }}>
      {displayedFloor.rooms.map(room => { let boundary: Point2[]; try { boundary = roomBoundary(displayedFloor, room); } catch { return null; } const center = boundary.reduce((p, n) => ({ x: p.x + n.x / boundary.length, z: p.z + n.z / boundary.length }), { x: 0, z: 0 }); return <g key={room.id}><polygon points={path(boundary)} fill={selected('room', room.id) ? '#cde4f5' : fills ? '#edf4f7' : '#fff'} stroke="none" /><text x={center.x} y={center.z} textAnchor="middle" dominantBaseline="middle" fontSize={units * 14} fill="#485765">{room.label}</text></g>; })}
      {(displayedFloor.areas ?? []).map(area => <polygon key={area.id} points={path(area.polygon)} fill={selected('area', area.id) ? '#8dbbf566' : '#b7d4ed35'} stroke="#789cb7" strokeWidth={units * 1.5} strokeDasharray={`${units * 5} ${units * 4}`} />)}
      {displayedFloor.walls.map(wall => <polyline key={wall.id} points={path(wallPath(displayedFloor, wall))} fill="none" stroke={selected('wall', wall.id) ? '#177aac' : wall.provenance.origin === 'inferred' ? '#b46b25' : '#283b4a'} strokeWidth={units * (selected('wall', wall.id) ? 5 : 3)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={wall.provenance.origin === 'inferred' ? `${units * 7} ${units * 5}` : undefined} />)}
      {displayedFloor.openings.map(opening => { const wall = displayedFloor.walls.find(w => w.id === opening.wallID)!; const wallPoints = wallPath(displayedFloor, wall); const cutout = openingPath(wallPoints, opening.offset, opening.width), a = cutout[0], b = cutout[cutout.length-1]; const active = selected('opening', opening.id); return <g key={opening.id}><polyline points={path(cutout)} fill="none" stroke="#f8fafb" strokeWidth={units * 7} /><polyline points={path(cutout)} fill="none" stroke={active ? '#126b9c' : opening.kind === 'window' ? '#70a8c6' : '#7095a6'} strokeWidth={units * (active ? 4 : 2)} strokeDasharray={opening.kind === 'window' ? undefined : `${units * 3} ${units * 3}`} />{opening.kind === 'door' && cutout.length === 2 && <path d={`M ${a.x} ${a.z} Q ${a.x + (b.z-a.z)} ${a.z - (b.x-a.x)} ${b.x} ${b.z}`} fill="none" stroke="#7095a6" strokeWidth={units * 1} />}</g>; })}
      {displayedFloor.nodes.map(node => <circle key={node.id} cx={node.point.x} cy={node.point.z} r={units * (selected('node', node.id) ? 7 : 3)} fill={selected('node', node.id) ? '#177aac' : '#fff'} stroke={selected('node', node.id) ? '#fff' : '#304759'} strokeWidth={units * 1.5} />)}
      {points.length > 0 && <g><polyline points={path(points)} fill={tool === 'area' ? '#7bb4dc33' : 'none'} stroke="#167bab" strokeWidth={units * 2} strokeDasharray={`${units * 5} ${units * 4}`} />{points.map((p, i) => <circle key={i} cx={p.x} cy={p.z} r={units * 5} fill="#177aac" />)}</g>}
    </svg>
    <div className="spatial-canvas-note">{tool === 'wall' ? points.length ? 'Choose the end corner. Existing corners snap together.' : 'Choose the start corner of a wall.' : tool === 'area' ? 'Choose at least three points for a labeled area.' : preview ? 'Release to save this correction' : 'Select an object, then drag to correct. Drag empty space to pan.'}</div>
    <div className="spatial-view-controls"><button aria-label="Light blue fills" aria-pressed={fills} onClick={()=>setFills(!fills)}>▱</button><button aria-label="Zoom in" onClick={() => zoom(0.8)}>+</button><button aria-label="Zoom out" onClick={() => zoom(1.25)}>−</button><button onClick={fit}>Fit</button></div>
    {points.length > 0 && <div className="spatial-drawing-actions">{tool === 'area' && <button disabled={points.length < 3} onClick={finishArea}>Finish area</button>}<button onClick={() => setPoints([])}>Cancel drawing</button></div>}
    {!!choices.length && <dialog ref={choiceDialog} className="spatial-pick-dialog" aria-label="Choose overlapping object" onCancel={event=>{event.preventDefault();setChoices([]);setChoosingDrawCorner(false);}}><strong>Choose an object</strong><p>{choosingDrawCorner?'Choose the explicit corner connection for this drawing.':'These objects overlap at this point.'}</p>{choices.map(choice => <button key={`${choice.kind}-${choice.objectID}`} onClick={() => { if(choosingDrawCorner){const node=floor.nodes.find(n=>n.id===choice.objectID);if(node)appendDrawPoint({...node.point,nodeID:node.id});setChoosingDrawCorner(false);}else onSelect(choice); setChoices([]); }}>{objectLabel(floor, choice)} <span>{choice.kind}</span></button>)}<button onClick={() => {setChoices([]);setChoosingDrawCorner(false);}}>Cancel</button></dialog>}
  </div>;
}
