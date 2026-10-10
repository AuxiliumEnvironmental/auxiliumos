import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene, displayCeilings, roomBoundary, wallPath, WalkNavigation } from '../core';
import { batchSceneFaces } from './sceneBatches';
import { trackRenderer } from './rendererDiagnostics';
import type { Floor, Point2, Selection, SpatialDocument, WalkPosition } from '../types';

export type ModelViewState = { camera: [number,number,number]; target: [number,number,number]; cutaway: boolean; cut: number; fills: boolean; ceilings: boolean };
type Props = { active?: boolean; rememberedView?: ModelViewState; rememberView?: (view: ModelViewState) => void; document: SpatialDocument; floor: Floor; selection: Selection | null; onSelect: (selection: Selection | null) => void };
type Runtime = { camera: THREE.PerspectiveCamera; controls: OrbitControls; render: () => void; focus: THREE.Vector3; initial: THREE.Vector3; clipping: THREE.Plane; updateSection: (height: number | null) => void; select: (selection: Selection | null) => void; showCeilings: (visible: boolean) => void; setActive: (active: boolean) => void; dispose: () => void };
export function ModelViewport({ active = true, rememberedView, rememberView, document, floor, selection, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const contextLost = useRef(false);
  const previouslyActive = useRef(active);
  const [contextAttempt, setContextAttempt] = useState(0);
  const lastFraming=useRef<ModelViewState|undefined>(rememberedView);
  const runtime = useRef<Runtime | null>(null);
  const navigation = useRef<WalkNavigation | null>(null);
  const position = useRef<WalkPosition | null>(null);
  const heading = useRef(0);
  const pitch = useRef(0);
  const walking = useRef(false);
  const settingsID=useId();
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [mode, setMode] = useState<'orbit' | 'walk'>('orbit');
  const [roomID, setRoomID] = useState(floor.rooms.find(room=>room.id===selection?.objectID)?.id ?? floor.rooms[0]?.id ?? '');
  const [cutaway, setCutaway] = useState(rememberedView?.cutaway ?? false);
  const [fills, setFills] = useState(rememberedView?.fills ?? true);
  const [ceilings, setCeilings] = useState(rememberedView?.ceilings ?? false);
  const fillsRef = useRef(fills); fillsRef.current = fills;
  const [cut, setCut] = useState(rememberedView?.cut ?? 0.5);
  const viewRef=useRef({cutaway,cut,fills,ceilings});viewRef.current={cutaway,cut,fills,ceilings};
  const rememberRef=useRef(rememberView);rememberRef.current=rememberView;
  const [message, setMessage] = useState('Drag to orbit. Scroll or pinch to zoom.');
  const [error, setError] = useState('');
  const [portalCount, setPortalCount] = useState(0);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const selectedRef = useRef(selection); selectedRef.current = selection;
  const moveTargetRef=useRef<(target:Point2)=>void>(()=>{});
  const moveRef = useRef<(forward: number, side: number) => void>(() => {});
  const lookRef = useRef<(turn: number, tilt?: number) => void>(() => {});
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRepeat = () => { if (repeat.current) clearInterval(repeat.current); repeat.current = null; };
  const modelTop = floor.elevation + Math.max(0.5, ...floor.walls.map(w => w.baseY + w.height));
  const cutHeight = floor.elevation + (modelTop - floor.elevation) * cut;
  const updateCamera = () => { const r = runtime.current, p = position.current; if (!r || !p) return; r.camera.position.set(p.point.x, p.eyeY, p.point.z); r.camera.lookAt(p.point.x + Math.sin(heading.current) * Math.cos(pitch.current), p.eyeY + Math.sin(pitch.current), p.point.z - Math.cos(heading.current) * Math.cos(pitch.current)); r.render(); };
  function leaveWalk() { walking.current = false; setMode('orbit'); stopRepeat(); const r = runtime.current; if (r) { r.controls.enabled = true; r.camera.position.copy(r.initial); r.controls.target.copy(r.focus); r.controls.update(); r.render(); } position.current = null; setMessage('Drag to orbit. Scroll or pinch to zoom.'); }
  function beginWalk(id = roomID) { try { if (!navigation.current) throw new Error('The walking model is unavailable.'); const p = navigation.current.start(id); position.current = p; const portal=navigation.current.portals.filter(portal=>portal.roomIDs.includes(id)).map(portal=>({x:(portal.a.x+portal.b.x)/2,z:(portal.a.z+portal.b.z)/2})).sort((a,b)=>Math.hypot(a.x-p.point.x,a.z-p.point.z)-Math.hypot(b.x-p.point.x,b.z-p.point.z))[0];const boundary=roomBoundary(floor,floor.rooms.find(room=>room.id===id)!);const target=portal??[...boundary].sort((a,b)=>Math.hypot(b.x-p.point.x,b.z-p.point.z)-Math.hypot(a.x-p.point.x,a.z-p.point.z))[0];heading.current=target?Math.atan2(target.x-p.point.x,-(target.z-p.point.z)):0;pitch.current = -0.35; walking.current = true; setMode('walk'); setCutaway(false); if (runtime.current) runtime.current.controls.enabled = false; updateCamera(); setMessage('Tap a visible floor to move. Drag to look, or use the move buttons.'); setError(''); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } }
  moveTargetRef.current = target => {
    if (!walking.current || !position.current || !navigation.current) return;
    try { const result = navigation.current.move(position.current,target); position.current = result.position; setRoomID(result.position.roomID); updateCamera(); setMessage(result.reachedTarget ? result.crossedPortalIDs.length ? 'Moved through a permitted opening into the next room.' : 'Walking inside the known layout.' : result.stop === 'unknownBoundary' ? 'Unknown boundary. Capture or correct this connection before walking through.' : result.stop === 'ambiguousRooms' ? 'Room connection is ambiguous. Correct the shared boundary first.' : result.stop === 'requestTooLong' ? 'Choose a closer visible floor position.' : 'Movement stopped at the wall or opening clearance.'); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
  };
  moveRef.current = (forward, side) => { const p=position.current;if(!p)return;const angle=heading.current;moveTargetRef.current({x:p.point.x+Math.sin(angle)*forward+Math.cos(angle)*side,z:p.point.z-Math.cos(angle)*forward+Math.sin(angle)*side}); };
  lookRef.current = (turn, tilt = 0) => { heading.current += turn; pitch.current = Math.max(-1, Math.min(1, pitch.current + tilt)); updateCamera(); };
  // Swap revision-derived geometry before paint. React may reveal the retained
  // canvas during reactivation, so a passive effect could expose the old revision.
  useLayoutEffect(() => {
    const el = host.current; if (!el) return;
    contextLost.current = false; setError(''); walking.current = false; setMode('orbit'); position.current = null; stopRepeat(); setMessage('Drag to orbit. Scroll or pinch to zoom.');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' }); } catch { setError('3D graphics are unavailable in this browser. The 2D editor and saved layout remain available.'); return; }
    const releaseTracker=trackRenderer(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor('#f4f7f8'); renderer.localClippingEnabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-label', 'Interactive architectural 3D model'); renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 1, 0.03, 50000);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = false; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 0.25; controls.maxDistance = 30000;
    const clipping = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e8);
    const resources: Array<{ dispose: () => void }> = [];
    const meshes: THREE.Object3D[] = [];
    const graphic = (() => { try { return buildScene(document, floor.id); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return null; } })();
    let section: THREE.LineSegments | null = null, selectedEdges: THREE.LineSegments | null = null, selectedNode: THREE.Mesh | null = null;
    const batches=graphic?batchSceneFaces(graphic,clipping):[];
    const ceilingBatches=graphic?batchSceneFaces({...graphic,faces:displayCeilings(document,floor.id),edges:[]},clipping):[];
    for(const batch of ceilingBatches){batch.mesh.visible=ceilings;batch.mesh.userData.role='ceiling';batch.updateColors(selectedRef.current?.objectID,fillsRef.current);scene.add(batch.mesh);meshes.push(batch.mesh);resources.push(batch.mesh.geometry,batch.mesh.material);}
    if (graphic) {
      for(const batch of batches){batch.updateColors(selectedRef.current?.objectID,fillsRef.current);scene.add(batch.mesh);meshes.push(batch.mesh);resources.push(batch.mesh.geometry,batch.mesh.material);}
      const grouped = new Map<string, number[]>();
      const inferred = new Set(floor.walls.filter(w=>w.provenance.origin==='inferred').map(w=>w.id));
      for (const edge of graphic.edges) { const key = inferred.has(edge.objectID) ? 'inferred' : edge.role === 'area' ? 'area' : 'normal'; const vertices = grouped.get(key) ?? []; vertices.push(edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z); grouped.set(key, vertices); }
      for (const [key, vertices] of grouped) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); const material = key==='inferred' ? new THREE.LineDashedMaterial({color:'#a87839',dashSize:.12,gapSize:.08,clippingPlanes:[clipping]}) : new THREE.LineBasicMaterial({ color: key === 'area' ? '#759fba' : '#3f5969', clippingPlanes: [clipping] }); const lines=new THREE.LineSegments(geometry, material);if(key==='inferred')lines.computeLineDistances();scene.add(lines); resources.push(geometry, material); }
      // Opening selection is a semantic hit target, never a rendered surface filling the void.
      for (const opening of floor.openings) {
        const wall = floor.walls.find(w=>w.id===opening.wallID)!; const path=wallPath(floor,wall);let traversed=0;
        for(let i=1;i<path.length;i++) {const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z),start=Math.max(opening.offset,traversed),end=Math.min(opening.offset+opening.width,traversed+length);if(end>start){const at=(offset:number)=>({x:a.x+(b.x-a.x)*(offset-traversed)/length,z:a.z+(b.z-a.z)*(offset-traversed)/length}),p=at(start),q=at(end),bottom=floor.elevation+wall.baseY+opening.bottom,top=bottom+opening.height;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([p.x,bottom,p.z,q.x,bottom,q.z,q.x,top,q.z,p.x,top,p.z],3));geometry.setIndex([0,1,2,0,2,3]);const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});const target=new THREE.Mesh(geometry,material);target.userData={objectID:opening.id,role:'opening',pickOnly:true};meshes.push(target);resources.push(geometry,material);}traversed+=length;}
      }
    }
    const bounds = new THREE.Box3(); for (const node of floor.nodes) bounds.expandByPoint(new THREE.Vector3(node.point.x, floor.elevation, node.point.z));
    if (bounds.isEmpty()) { bounds.min.set(-2, floor.elevation, -2); bounds.max.set(2, floor.elevation + 2.6, 2); } else bounds.max.y = modelTop;
    const focus = bounds.getCenter(new THREE.Vector3()), span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 4), initial = focus.clone().add(new THREE.Vector3(span * 0.8, span * 0.9, span * 1.05));
    const savedView=lastFraming.current;camera.position.copy(savedView?new THREE.Vector3(...savedView.camera):initial); controls.target.copy(savedView?new THREE.Vector3(...savedView.target):focus); controls.update();
    // Coalesce selection, resize and camera invalidations into one frame. This is
    // deliberately event-driven: hidden and unchanged models schedule no work.
    let queuedFrame = 0, disposed = false;
    const cancelFrame = () => { if (queuedFrame) cancelAnimationFrame(queuedFrame); queuedFrame = 0; };
    const render = () => {
      if (disposed || !activeRef.current || contextLost.current || window.document.hidden || queuedFrame) return;
      queuedFrame = requestAnimationFrame(() => {
        queuedFrame = 0;
        if (disposed || !activeRef.current || contextLost.current || window.document.hidden) return;
        renderer.render(scene, camera);
        renderer.domElement.dataset.rendered = 'true';
      });
    };
    const visibility = () => { if (window.document.hidden) cancelFrame(); else render(); };
    window.document.addEventListener('visibilitychange', visibility);
    const select = (selection: Selection | null) => {
      for(const batch of [...batches,...ceilingBatches])batch.updateColors(selection?.objectID,fillsRef.current);
      if (selectedEdges) { scene.remove(selectedEdges); selectedEdges.geometry.dispose(); (selectedEdges.material as THREE.Material).dispose(); selectedEdges = null; }
      if(selectedNode){scene.remove(selectedNode);selectedNode.geometry.dispose();(selectedNode.material as THREE.Material).dispose();selectedNode=null;}
      const edges = graphic?.edges.filter(e=>e.objectID===selection?.objectID) ?? [];
      if (edges.length) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(edges.flatMap(e=>[e.a.x,e.a.y,e.a.z,e.b.x,e.b.y,e.b.z]),3)); selectedEdges = new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#087aae',clippingPlanes:[clipping],depthTest:false})); selectedEdges.renderOrder=2; scene.add(selectedEdges); }
      if(selection?.kind==='node'){const node=floor.nodes.find(n=>n.id===selection.objectID);if(node){selectedNode=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshBasicMaterial({color:'#087aae',depthTest:false}));selectedNode.position.set(node.point.x,floor.elevation+.075,node.point.z);selectedNode.renderOrder=3;scene.add(selectedNode);}}
      render();
    };
    controls.addEventListener('change', render);
    const resize = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); }); resize.observe(el);
    const updateSection = (height: number | null) => {
      clipping.constant = height ?? 1e8;
      if (section) { scene.remove(section); section.geometry.dispose(); (section.material as THREE.Material).dispose(); section = null; }
      if (height !== null && graphic) {
        const segments: number[] = [];
        for (const face of graphic.faces) {
          const crossings: THREE.Vector3[] = [];
          for (let i = 0; i < face.vertices.length; i++) { const a = face.vertices[i], b = face.vertices[(i + 1) % face.vertices.length]; if ((a.y < height && b.y > height) || (a.y > height && b.y < height)) { const t = (height - a.y) / (b.y - a.y); crossings.push(new THREE.Vector3(a.x + (b.x-a.x)*t,height,a.z+(b.z-a.z)*t)); } }
          if (crossings.length === 2) segments.push(...crossings[0].toArray(), ...crossings[1].toArray());
        }
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3)); section = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#187cac' })); scene.add(section);
      }
      render();
    };
    const raycaster = new THREE.Raycaster();
    let pointer: { x: number; y: number; moved: boolean } | null = null;
    const pointerDown = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY, moved: false }; if (walking.current) renderer.domElement.setPointerCapture(event.pointerId); };
    const pointerMove = (event: PointerEvent) => { if (!pointer) return; const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; if (Math.hypot(dx, dy) > 4) pointer.moved = true; if (walking.current && pointer.moved) { lookRef.current(dx * 0.006, -dy * 0.005); pointer.x = event.clientX; pointer.y = event.clientY; } };
    const pointerUp = (event: PointerEvent) => {
      if (!pointer || pointer.moved) { pointer = null; return; } pointer = null;
      const rect = renderer.domElement.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit = raycaster.intersectObjects(meshes.filter(mesh=>mesh.visible&&(!walking.current||!mesh.userData.pickOnly))).find(candidate => candidate.point.y <= clipping.constant + 1e-6);
      if(walking.current){if(hit?.object.userData.role==='floor')moveTargetRef.current({x:hit.point.x,z:hit.point.z});else setMessage('Tap a visible floor surface to move. Walls and windows remain barriers.');return;}
      if (!hit) { selectRef.current(null); return; }
      const id = (hit.object.userData.objectID ?? hit.object.userData.triangleOwners?.[hit.faceIndex ?? -1]) as string;
      if(!id){selectRef.current(null);return;}
      const kind = floor.walls.some(w=>w.id===id) ? 'wall' : floor.openings.some(o=>o.id===id) ? 'opening' : floor.rooms.some(r=>r.id===id) ? 'room' : 'area'; selectRef.current({ floorID:floor.id,kind,objectID:id });
    };
    const keyDown = (event: KeyboardEvent) => { if (!walking.current) return; const key = event.key.toLowerCase(); if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape'].includes(key)) event.preventDefault(); if (key==='w'||key==='arrowup') moveRef.current(0.2,0); if(key==='s'||key==='arrowdown') moveRef.current(-0.2,0);if(key==='a')moveRef.current(0,-0.2);if(key==='d')moveRef.current(0,0.2);if(key==='arrowleft')lookRef.current(-0.12);if(key==='arrowright')lookRef.current(0.12);if(key==='escape')leaveWalk(); };
    const lost = (event: Event) => { event.preventDefault(); contextLost.current = true; cancelFrame(); renderer.domElement.dataset.rendered = 'false'; setError('The graphics context was interrupted. Switch to the plan, then reopen 3D to recover. Saved geometry is unaffected.'); stopRepeat(); };
    renderer.domElement.addEventListener('pointerdown', pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('keydown',keyDown);renderer.domElement.addEventListener('webglcontextlost',lost);
    const dispose = () => { disposed = true; cancelFrame(); window.document.removeEventListener('visibilitychange', visibility); stopRepeat(); resize.disconnect(); controls.removeEventListener('change',render); controls.dispose(); resources.forEach(r=>r.dispose()); if(section){section.geometry.dispose();(section.material as THREE.Material).dispose();} if(selectedEdges){selectedEdges.geometry.dispose();(selectedEdges.material as THREE.Material).dispose();} if(selectedNode){selectedNode.geometry.dispose();(selectedNode.material as THREE.Material).dispose();} renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',keyDown);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();releaseTracker();renderer.forceContextLoss(); renderer.domElement.remove(); };
    runtime.current = { camera, controls, render, focus, initial, clipping, updateSection, select, showCeilings:visible=>{ceilingBatches.forEach(batch=>{batch.mesh.visible=visible;});render();}, setActive:visible=>{controls.enabled=visible&&!walking.current;if(visible)render();else{cancelFrame();renderer.domElement.dataset.rendered='false';}}, dispose };
    try { navigation.current = new WalkNavigation(document, floor.id); setPortalCount(navigation.current.portals.length); if (!navigation.current.roomIDs.includes(roomID)) setRoomID(navigation.current.roomIDs[0] ?? ''); } catch (cause) { navigation.current = null; setMessage(cause instanceof Error ? cause.message : String(cause)); }
    updateSection(cutaway ? cutHeight : null); select(selectedRef.current); render();
    return () => { const orbit=walking.current?initial:camera.position;const saved={camera:orbit.toArray() as [number,number,number],target:controls.target.toArray() as [number,number,number],...viewRef.current};lastFraming.current=saved;rememberRef.current?.(saved);runtime.current = null; navigation.current = null; walking.current = false; dispose(); };
  }, [document.documentID, document.revision, floor.id, contextAttempt]);
  useEffect(() => {
    const reactivated = active && !previouslyActive.current; previouslyActive.current = active;
    if (!active) {
      // A view switch suspends this document's renderer, but never keeps a walk
      // gesture or hidden animation running. Unmount still releases all resources.
      stopRepeat(); if (walking.current) leaveWalk();
      runtime.current?.setActive(false);
    } else if (reactivated && (contextLost.current || !runtime.current)) {
      // Reopening retries a lost context or failed creation without an error loop.
      setContextAttempt(attempt => attempt + 1);
    } else runtime.current?.setActive(true);
  }, [active]);
  useEffect(() => { runtime.current?.updateSection(cutaway ? cutHeight : null); }, [cutaway, cutHeight]);
  useEffect(() => { if(!active)return;runtime.current?.select(selection);if(!walking.current&&selection?.kind==='room')setRoomID(selection.objectID); }, [selection, fills, active]);
  useEffect(()=>{runtime.current?.showCeilings(ceilings);},[ceilings]);
  useEffect(() => { const stop = () => stopRepeat(); window.addEventListener('pointerup',stop);window.addEventListener('blur',stop);window.document.addEventListener('visibilitychange',stop);return()=>{stopRepeat();window.removeEventListener('pointerup',stop);window.removeEventListener('blur',stop);window.document.removeEventListener('visibilitychange',stop);}; },[]);
  function hold(action: () => void) { stopRepeat(); action(); repeat.current = setInterval(action, 110); }
  return <div className="spatial-model" hidden={!active} inert={!active} style={active?undefined:{display:'none'}}><div ref={host} className="spatial-model-canvas" />
    <div className="spatial-model-bar"><div className="spatial-segmented"><button aria-pressed={mode==='orbit'} onClick={leaveWalk}>Orbit</button><button aria-pressed={mode==='walk'} disabled={!roomID || !!error} onClick={()=>beginWalk()}>Walk through</button></div><button onClick={()=>mode==='walk'?beginWalk():leaveWalk()}>Reset view</button></div>
    <div className="spatial-model-options" data-mode={mode}>{mode==='orbit'&&<button className="spatial-model-settings-toggle" aria-expanded={settingsOpen} aria-controls={settingsID} onClick={()=>setSettingsOpen(!settingsOpen)}>{settingsOpen?'Hide controls':'View controls'}</button>}<div id={settingsID} className="spatial-model-settings" data-open={settingsOpen}>{mode==='orbit' ? <><label className="spatial-check"><input type="checkbox" checked={fills} onChange={event=>setFills(event.target.checked)} />Light blue fills</label><label className="spatial-check"><input type="checkbox" checked={ceilings} onChange={event=>setCeilings(event.target.checked)} />Display ceilings</label><label className="spatial-check"><input type="checkbox" checked={cutaway} onChange={event=>setCutaway(event.target.checked)} />Cutaway</label>{cutaway && <label className="spatial-cut-control">Cut height<input type="range" aria-label="Cutaway height" min="0.1" max="0.95" step="0.01" value={cut} onChange={event=>setCut(Number(event.target.value))} /></label>}</> : <><span className="spatial-walk-badge">● WALKING</span><button onClick={leaveWalk}>Exit walking</button></>}{!!floor.rooms.length && <label className="spatial-room-select"><span>Start in</span><select value={roomID} onChange={event=>{setRoomID(event.target.value);if(mode==='walk')beginWalk(event.target.value);}}>{floor.rooms.map(room=><option key={room.id} value={room.id}>{room.label}</option>)}</select></label>}</div></div>
    {mode==='walk' && <div className="spatial-walk-controls" aria-label="Walking controls"><div><button aria-label="Turn left" onPointerDown={()=>hold(()=>lookRef.current(-0.1))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)lookRef.current(-0.1);}}>↶</button><button aria-label="Walk forward" onPointerDown={()=>hold(()=>moveRef.current(0.2,0))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0.2,0);}}>↑</button><button aria-label="Turn right" onPointerDown={()=>hold(()=>lookRef.current(0.1))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)lookRef.current(0.1);}}>↷</button></div><div><button aria-label="Step left" onPointerDown={()=>hold(()=>moveRef.current(0,-0.2))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0,-0.2);}}>←</button><button aria-label="Walk backward" onPointerDown={()=>hold(()=>moveRef.current(-0.2,0))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(-0.2,0);}}>↓</button><button aria-label="Step right" onPointerDown={()=>hold(()=>moveRef.current(0,0.2))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0,0.2);}}>→</button></div></div>}
    <div className="spatial-model-message" role="status">{error || message}{!error && mode==='walk' && <span> {portalCount === 0 ? 'No traversable room connections. Unknown boundaries stay closed.' : 'Windows and unknown exterior boundaries stay closed.'}</span>}</div>
  </div>;
}
