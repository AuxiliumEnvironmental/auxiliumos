import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene, displayCeilings, roomBoundary, wallPath, WalkNavigation } from '../core';
import { batchSceneFaces } from './sceneBatches';
import { STRUCTURAL_EDGE_COLOR } from '../surfacePalette';
import { AFFECTED_COLORS, affectedKind } from '../affectedAreaPalette';
import { resolveSurface, surfaceKey, surfaceNormal, surfacePointToWorld } from '../core/surfaces';
import { domainContains } from '../core/affectedAreaGeometry';
import { projectToWall } from './openingManipulation';
import { affectedCommand, affectedCorners, affectedDragPreview, affectedFenceMatches, affectedOutline, AffectedPreviewQueue, currentAffectedFootprint, projectAffectedRay, type AffectedCommit, type AffectedDrag, type AffectedFence, type AffectedTool } from './affectedAreaManipulation';
import { trackRenderer } from './rendererDiagnostics';
import type { Floor, Point2, Selection, SpatialDocument, WalkPosition, SurfaceRef, SurfacePoint, SurfacePolygon } from '../types';

export type ModelViewState = { camera: [number,number,number]; target: [number,number,number]; cutaway: boolean; cut: number; fills: boolean; ceilings: boolean };
type Props = { affectedTool?:AffectedTool|null; onAffectedTool?:(tool:AffectedTool|null)=>void; onAffectedEdit?:AffectedCommit; affectedFence?:AffectedFence; disabled?:boolean; active?: boolean; rememberedView?: ModelViewState; rememberView?: (view: ModelViewState) => void; document: SpatialDocument; floor: Floor; selection: Selection | null; groupSelection?: Selection[]; onSelect: (selection: Selection | null) => void };
type Runtime = { cancelAffected:()=>void; refreshAffected:()=>void; camera: THREE.PerspectiveCamera; controls: OrbitControls; render: () => void; focus: THREE.Vector3; initial: THREE.Vector3; clipping: THREE.Plane; updateSection: (height: number | null) => void; select: (selection: Selection | null) => void; showCeilings: (visible: boolean) => void; setActive: (active: boolean) => void; dispose: () => void };
export function ModelViewport({ affectedTool=null,onAffectedTool,onAffectedEdit,affectedFence,disabled=false,active = true, rememberedView, rememberView, document, floor, selection, groupSelection, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [surfaceEditing,setSurfaceEditing]=useState(false),surfaceEditingRef=useRef(surfaceEditing);surfaceEditingRef.current=surfaceEditing;
  const affectedRef=useRef({tool:affectedTool,onTool:onAffectedTool,onEdit:onAffectedEdit,fence:affectedFence,disabled});affectedRef.current={tool:affectedTool,onTool:onAffectedTool,onEdit:onAffectedEdit,fence:affectedFence,disabled};
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
  const groupRef = useRef(groupSelection); groupRef.current = groupSelection;
  const moveTargetRef=useRef<(target:Point2)=>void>(()=>{});
  const moveRef = useRef<(forward: number, side: number) => void>(() => {});
  const lookRef = useRef<(turn: number, tilt?: number) => void>(() => {});
  const repeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRepeat = () => { if (repeat.current) clearInterval(repeat.current); repeat.current = null; };
  const modelTop = floor.elevation + Math.max(0.5, ...floor.walls.map(w => w.baseY + w.height));
  const cutHeight = floor.elevation + (modelTop - floor.elevation) * cut;
  const updateCamera = () => { const r = runtime.current, p = position.current; if (!r || !p) return; r.camera.position.set(p.point.x, p.eyeY, p.point.z); r.camera.lookAt(p.point.x + Math.sin(heading.current) * Math.cos(pitch.current), p.eyeY + Math.sin(pitch.current), p.point.z - Math.cos(heading.current) * Math.cos(pitch.current)); r.render(); };
  function leaveWalk() { runtime.current?.cancelAffected();walking.current = false; setMode('orbit'); stopRepeat(); const r = runtime.current; if (r) { r.controls.enabled = true; r.camera.position.copy(r.initial); r.controls.target.copy(r.focus); r.controls.update(); r.render(); } position.current = null; setMessage('Drag to orbit. Scroll or pinch to zoom.'); }
  function beginWalk(id = roomID) { runtime.current?.cancelAffected();setSurfaceEditing(false);onAffectedTool?.(null);try { if (!navigation.current) throw new Error('The walking model is unavailable.'); const p = navigation.current.start(id); position.current = p; const portal=navigation.current.portals.filter(portal=>portal.roomIDs.includes(id)).map(portal=>({x:(portal.a.x+portal.b.x)/2,z:(portal.a.z+portal.b.z)/2})).sort((a,b)=>Math.hypot(a.x-p.point.x,a.z-p.point.z)-Math.hypot(b.x-p.point.x,b.z-p.point.z))[0];const boundary=roomBoundary(floor,floor.rooms.find(room=>room.id===id)!);const target=portal??[...boundary].sort((a,b)=>Math.hypot(b.x-p.point.x,b.z-p.point.z)-Math.hypot(a.x-p.point.x,a.z-p.point.z))[0];heading.current=target?Math.atan2(target.x-p.point.x,-(target.z-p.point.z)):0;pitch.current = -0.35; walking.current = true; setMode('walk'); setCutaway(false); if (runtime.current) runtime.current.controls.enabled = false; updateCamera(); setMessage('Tap a visible floor to move. Drag to look, or use the move buttons.'); setError(''); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } }
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
    let section: THREE.LineSegments | null = null, selectedEdges: THREE.LineSegments | null = null, selectedNode: THREE.InstancedMesh | null = null;
    const isCeiling=(face:import('../types').SceneFace)=>face.role==='ceiling'||face.surface?.kind==='ceiling';
    const batches=graphic?batchSceneFaces({...graphic,faces:graphic.faces.filter(f=>!isCeiling(f))},clipping):[];
    const ceilingBatches=graphic?batchSceneFaces({...graphic,faces:[...graphic.faces.filter(isCeiling),...displayCeilings(document,floor.id)],edges:[]},clipping):[];
    for(const batch of ceilingBatches){batch.mesh.visible=ceilings;batch.updateColors(selectedRef.current?.objectID,fillsRef.current);scene.add(batch.mesh);meshes.push(batch.mesh);resources.push(batch.mesh.geometry,batch.mesh.material);}
    if (graphic) {
      for(const batch of batches){batch.updateColors(selectedRef.current?.objectID,fillsRef.current);scene.add(batch.mesh);meshes.push(batch.mesh);resources.push(batch.mesh.geometry,batch.mesh.material);}
      const grouped = new Map<string, number[]>();
      const inferred = new Set(floor.walls.filter(w=>w.provenance.origin==='inferred').map(w=>w.id));
      for (const edge of graphic.edges) { const key = inferred.has(edge.objectID) ? 'inferred' : edge.role === 'area' ? 'area' : 'normal'; const vertices = grouped.get(key) ?? []; vertices.push(edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z); grouped.set(key, vertices); }
      for (const [key, vertices] of grouped) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); const material = key==='inferred' ? new THREE.LineDashedMaterial({color:'#a87839',dashSize:.12,gapSize:.08,clippingPlanes:[clipping]}) : new THREE.LineBasicMaterial({ color: key === 'area' ? '#759fba' : STRUCTURAL_EDGE_COLOR, clippingPlanes: [clipping] }); const lines=new THREE.LineSegments(geometry, material);if(key==='inferred')lines.computeLineDistances();scene.add(lines); resources.push(geometry, material); }
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
    let queuedFrame = 0, disposed = false, inRenderFrame=false, previewFrameID=0;
    let pendingAffectedFrame:{id:number;callback:()=>void}|null=null;
    let refreshAffected=()=>{};
    const cancelFrame = () => { if (queuedFrame) cancelAnimationFrame(queuedFrame); queuedFrame = 0; };
    const render = () => {
      if (disposed || inRenderFrame || !activeRef.current || contextLost.current || window.document.hidden || queuedFrame) return;
      queuedFrame = requestAnimationFrame(() => {
        queuedFrame = 0;
        if (disposed || !activeRef.current || contextLost.current || window.document.hidden) return;
        inRenderFrame=true;try{const pendingPreview=pendingAffectedFrame;pendingAffectedFrame=null;pendingPreview?.callback();renderer.render(scene,camera);refreshAffected();renderer.domElement.dataset.rendered='true';}catch(cause){setMessage(cause instanceof Error?cause.message:String(cause));}finally{inRenderFrame=false;}
      });
    };
    const visibility = () => { if (window.document.hidden) cancelFrame(); else render(); };
    window.document.addEventListener('visibilitychange', visibility);
    const select = (selection: Selection | null) => {
      const selected = (groupRef.current?.length ? groupRef.current : selection ? [selection] : []).filter(item=>item.floorID===floor.id);
      const ids = new Set<string>(selected.map(item=>item.objectID));
      renderer.domElement.dataset.selectedIds = JSON.stringify([...ids].sort());
      for(const batch of [...batches,...ceilingBatches])batch.updateColors(ids,fillsRef.current);
      if (selectedEdges) { scene.remove(selectedEdges); selectedEdges.geometry.dispose(); (selectedEdges.material as THREE.Material).dispose(); selectedEdges = null; }
      if(selectedNode){scene.remove(selectedNode);selectedNode.dispose();selectedNode.geometry.dispose();(selectedNode.material as THREE.Material).dispose();selectedNode=null;}
      const edges = graphic?.edges.filter(e=>ids.has(e.objectID)) ?? [];
      if (edges.length) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(edges.flatMap(e=>[e.a.x,e.a.y,e.a.z,e.b.x,e.b.y,e.b.z]),3)); selectedEdges = new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#087aae',clippingPlanes:[clipping],depthTest:false})); selectedEdges.renderOrder=2; scene.add(selectedEdges); }
      const nodeIDs=new Set(selected.filter(item=>item.kind==='node').map(item=>item.objectID)),nodes=floor.nodes.filter(node=>nodeIDs.has(node.id));
      if(nodes.length){const markers=new THREE.InstancedMesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshBasicMaterial({color:'#087aae',depthTest:false}),nodes.length),matrix=new THREE.Matrix4();nodes.forEach((node,index)=>{matrix.makeTranslation(node.point.x,floor.elevation+.075,node.point.z);markers.setMatrixAt(index,matrix);});markers.instanceMatrix.needsUpdate=true;markers.renderOrder=3;selectedNode=markers;scene.add(markers);}
      render();
    };
    controls.addEventListener('change', render);
    const resize = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();runtime.current?.cancelAffected();render(); }); resize.observe(el);
    const updateSection = (height: number | null) => {
      clipping.constant = height ?? 1e8;
      if (section) { scene.remove(section); section.geometry.dispose(); (section.material as THREE.Material).dispose(); section = null; }
      if (height !== null && graphic) {
        const segments: number[] = [];
        for (const face of graphic.faces.filter(f=>!affectedKind(f.role))) {
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
    type Hit=THREE.Intersection<THREE.Object3D>;
    const setRay=(event:{clientX:number;clientY:number})=>{const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);return{origin:raycaster.ray.origin,direction:raycaster.ray.direction};};
    const hitAt=(event:{clientX:number;clientY:number},navigationOnly=false)=>{setRay(event);return raycaster.intersectObjects(meshes.filter(mesh=>mesh.visible&&(!navigationOnly||!mesh.userData.pickOnly&&!affectedKind(mesh.userData.role)))).find(h=>h.point.y<=clipping.constant+1e-6);};
    const hitID=(hit:Hit)=>String(hit.object.userData.objectID??hit.object.userData.triangleOwners?.[hit.faceIndex??-1]??'');
    const hitSurface=(hit:Hit):SurfaceRef|null=>{
      const saved=hit.object.userData.triangleSurfaces?.[hit.faceIndex??-1] as SurfaceRef|undefined;if(saved)return saved;
      const role=hit.object.userData.role,id=hitID(hit);
      if(role==='wall'){const ref:SurfaceRef={floorID:floor.id,kind:'wall',wallID:id,side:'positive'},wall=floor.walls.find(w=>w.id===id);if(!wall)return null;const u=projectToWall(wallPath(floor,wall),{x:hit.point.x,z:hit.point.z}),normal=surfaceNormal(document,ref,u);return normal?{...ref,side:raycaster.ray.direction.dot(new THREE.Vector3(normal.x,normal.y,normal.z))<0?'positive':'negative'}:null;}
      if(role==='floor'&&floor.rooms.some(r=>r.id===id))return{floorID:floor.id,kind:'floor',roomID:id};
      if(role==='ceiling'){const room=floor.rooms.find(r=>r.ceiling?.id===id);return room?.ceiling?{floorID:floor.id,kind:'ceiling',roomID:room.id,ceilingID:room.ceiling.id}:null;}return null;
    };
    let owned:{drag:AffectedDrag;tool:AffectedTool;camera:number[];lastU:number;preview:SurfacePolygon|null}|null=null;
    let previewLine:THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>|null=null;
    const blockedPointers=new Set<number>();
    const handles=Array.from({length:4},(_,index)=>{const button=window.document.createElement('button');button.type='button';button.className='spatial-affected-model-handle';button.setAttribute('aria-label',`Resize affected region corner ${index+1}`);button.dataset.affectedHandle=String(index);button.style.display='none';button.addEventListener('pointerdown',e=>beginOwned(e,index as 0|1|2|3));el.appendChild(button);return button;});
    const hideHandles=()=>handles.forEach(h=>h.style.display='none');
    const selectedArea=()=>{const selection=selectedRef.current;return selection?.kind==='affectedArea'?document.affectedAreas?.find(a=>a.id===selection.objectID):undefined;};
    const previewQueue=new AffectedPreviewQueue<SurfacePoint>(point=>{
      if(!owned)return;const polygon=affectedDragPreview(owned.drag,point);owned.preview=polygon;if(!polygon)return;
      let points:ReturnType<typeof affectedOutline>;try{points=affectedOutline(document,owned.tool.surface,polygon);}catch(cause){owned.preview=null;setMessage(cause instanceof Error?cause.message:String(cause));return;}
      if(!previewLine){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(20000*3),3).setUsage(THREE.DynamicDrawUsage));previewLine=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:AFFECTED_COLORS[owned.tool.kind].line,clippingPlanes:[clipping],depthTest:true}));previewLine.frustumCulled=false;scene.add(previewLine);}
      const attribute=previewLine.geometry.getAttribute('position') as THREE.BufferAttribute;points.forEach((p,i)=>attribute.setXYZ(i,p.x,p.y,p.z));attribute.needsUpdate=true;previewLine.geometry.setDrawRange(0,points.length);render();
    },callback=>{const id=++previewFrameID;pendingAffectedFrame={id,callback};render();return id;},id=>{if(pendingAffectedFrame?.id===id)pendingAffectedFrame=null;});
    const cancelAffected=()=>{if(owned)blockedPointers.add(owned.drag.pointerID);owned=null;previewQueue.cancel();if(previewLine){scene.remove(previewLine);previewLine.geometry.dispose();previewLine.material.dispose();previewLine=null;}controls.enabled=activeRef.current&&!walking.current;hideHandles();render();};
    refreshAffected=()=>{
      hideHandles();if(owned||!surfaceEditingRef.current||walking.current||affectedRef.current.disabled||!activeRef.current||affectedRef.current.tool?.mode==='draw')return;
      const area=selectedArea(),current=area?currentAffectedFootprint(area):null;if(!current||current.surface.kind==='ceiling'&&!viewRef.current.ceilings)return;
      const domain=resolveSurface(document,current.surface)?.domain;if(!domain)return;
      const corners=affectedCorners(current.footprint),rect=renderer.domElement.getBoundingClientRect(),projected=corners.map(p=>{if(!domainContains(domain,p))return null;const world=surfacePointToWorld(document,current.surface,p);if(!world)return null;const normal=surfaceNormal(document,current.surface,p.u);if(!normal)return null;const point=new THREE.Vector3(world.x+normal.x*.003,world.y+normal.y*.003,world.z+normal.z*.003),screen=point.clone().project(camera);if(screen.z<-1||screen.z>1||point.y>clipping.constant+1e-6||camera.position.clone().sub(point).dot(new THREE.Vector3(normal.x,normal.y,normal.z))<=0)return null;
        raycaster.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);const nearest=raycaster.intersectObjects(meshes.filter(m=>m.visible&&!m.userData.pickOnly)).find(h=>h.point.y<=clipping.constant+1e-6);if(nearest&&nearest.distance<raycaster.ray.origin.distanceTo(point)-.015)return null;
        return{x:(screen.x+1)*rect.width/2,y:(1-screen.y)*rect.height/2};});
      const visible=projected.filter((p):p is {x:number;y:number}=>p!==null);if(!visible.length)return;const center=visible.reduce((c,p)=>({x:c.x+p.x/visible.length,y:c.y+p.y/visible.length}),{x:0,y:0});
      projected.forEach((p,i)=>{if(!p)return;const button=handles[i],x=center.x+(Math.sign(p.x-center.x)||1)*Math.max(25,Math.abs(p.x-center.x)),y=center.y+(Math.sign(p.y-center.y)||1)*Math.max(25,Math.abs(p.y-center.y));if(x<22||y<22||x>rect.width-22||y>rect.height-22)return;button.style.left=`${x}px`;button.style.top=`${y}px`;button.style.color=AFFECTED_COLORS[area!.kind].line;button.style.display='block';});
    };
    function beginOwned(event:PointerEvent,handle?:0|1|2|3):void{
      if(owned&&event.pointerId!==owned.drag.pointerID){cancelAffected();blockedPointers.add(event.pointerId);event.preventDefault();event.stopImmediatePropagation();return;}
      if(blockedPointers.size&&!blockedPointers.has(event.pointerId)){blockedPointers.add(event.pointerId);event.preventDefault();event.stopImmediatePropagation();return;}blockedPointers.delete(event.pointerId);
      const state=affectedRef.current;if(!surfaceEditingRef.current||walking.current||state.disabled||!state.onEdit||event.button!==0||!state.fence||state.fence.documentID!==document.documentID||state.fence.revision!==document.revision)return;
      const area=selectedArea(),current=area?currentAffectedFootprint(area):null,tool=state.tool??(area&&current?{kind:area.kind,surface:current.surface,mode:'resize' as const,areaID:area.id,token:area.id}:null);if(!tool)return;
      const hit=hitAt(event),surface=hit?hitSurface(hit):null;
      if(handle===undefined&&(tool.mode==='draw'?(!surface||surfaceKey(surface)!==surfaceKey(tool.surface)):!hit||hitID(hit)!==tool.areaID))return;
      if(handle!==undefined&&(!current||handles[handle].style.display==='none'))return;
      const preferred=handle!==undefined&&current?affectedCorners(current.footprint)[handle].u:hit&&tool.surface.kind==='wall'?projectToWall(wallPath(floor,floor.walls.find(w=>w.id===(tool.surface as Extract<SurfaceRef,{kind:'wall'}>).wallID)!),{x:hit.point.x,z:hit.point.z}):0;
      const ray=setRay(event),start=projectAffectedRay(document,tool.surface,ray,preferred);if(!start)return;
      event.preventDefault();event.stopImmediatePropagation();pointer=null;controls.enabled=false;
      owned={tool,drag:{start,original:tool.mode==='draw'?null:current?.footprint??null,handle:handle??'body',planWall:false,fence:{...state.fence},pointerID:event.pointerId},camera:[...camera.matrixWorld.elements],lastU:start.u,preview:null};hideHandles();renderer.domElement.setPointerCapture(event.pointerId);setMessage('Drag to adjust this observation. Escape, a second touch, or leaving the view cancels.');
    }
    const affectedMove=(event:PointerEvent)=>{if(blockedPointers.has(event.pointerId)){event.stopImmediatePropagation();return;}if(!owned||event.pointerId!==owned.drag.pointerID)return;event.preventDefault();event.stopImmediatePropagation();const state=affectedRef.current;if(state.disabled||!state.fence||!affectedFenceMatches(owned.drag.fence,state.fence)||owned.camera.some((v,i)=>Math.abs(v-camera.matrixWorld.elements[i])>1e-10)){cancelAffected();return;}
      const samples=event.getCoalescedEvents?.()??[event];for(const sample of samples.length?samples:[event]){const point=projectAffectedRay(document,owned.tool.surface,setRay(sample),owned.lastU);if(point){owned.lastU=point.u;previewQueue.move(point);}}
    };
    const affectedUp=(event:PointerEvent)=>{if(blockedPointers.delete(event.pointerId)){event.stopImmediatePropagation();return;}if(!owned||event.pointerId!==owned.drag.pointerID)return;event.stopImmediatePropagation();const ending=owned,state=affectedRef.current,point=projectAffectedRay(document,ending.tool.surface,setRay(event),ending.lastU);if(point)previewQueue.release(point);const polygon=ending.preview,valid=!state.disabled&&!!state.fence&&affectedFenceMatches(ending.drag.fence,state.fence)&&ending.camera.every((v,i)=>Math.abs(v-camera.matrixWorld.elements[i])<=1e-10);cancelAffected();blockedPointers.delete(event.pointerId);if(!point||!polygon||!valid)return;const command=affectedCommand(ending.tool,polygon);if(command&&JSON.stringify(polygon)!==JSON.stringify(ending.drag.original)){void state.onEdit?.([command],ending.drag.fence);state.onTool?.(null);}};
    const cancelPointer=(event:PointerEvent)=>{if(owned?.drag.pointerID===event.pointerId)cancelAffected();blockedPointers.delete(event.pointerId);pointer=null;};
    const affectedBlur=()=>{cancelAffected();blockedPointers.clear();pointer=null;};
    renderer.domElement.addEventListener('pointerdown',beginOwned,true);renderer.domElement.addEventListener('pointermove',affectedMove,true);renderer.domElement.addEventListener('pointerup',affectedUp,true);renderer.domElement.addEventListener('pointercancel',cancelPointer);renderer.domElement.addEventListener('lostpointercapture',cancelPointer);window.addEventListener('blur',affectedBlur);window.document.addEventListener('visibilitychange',affectedBlur);
    const disposeAffected=()=>{cancelAffected();handles.forEach(h=>h.remove());renderer.domElement.removeEventListener('pointerdown',beginOwned,true);renderer.domElement.removeEventListener('pointermove',affectedMove,true);renderer.domElement.removeEventListener('pointerup',affectedUp,true);renderer.domElement.removeEventListener('pointercancel',cancelPointer);renderer.domElement.removeEventListener('lostpointercapture',cancelPointer);window.removeEventListener('blur',affectedBlur);window.document.removeEventListener('visibilitychange',affectedBlur);};

    const pointerDown = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY, moved: false }; if (walking.current) renderer.domElement.setPointerCapture(event.pointerId); };
    const pointerMove = (event: PointerEvent) => { if (!pointer) return; const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; if (Math.hypot(dx, dy) > 4) pointer.moved = true; if (walking.current && pointer.moved) { lookRef.current(dx * 0.006, -dy * 0.005); pointer.x = event.clientX; pointer.y = event.clientY; } };
    const pointerUp = (event: PointerEvent) => {
      if (!pointer || pointer.moved) { pointer = null; return; } pointer = null;
      const hit=hitAt(event,walking.current);
      if(walking.current){if(hit?.object.userData.role==='floor')moveTargetRef.current({x:hit.point.x,z:hit.point.z});else setMessage('Tap a visible floor surface to move. Walls and windows remain barriers.');return;}
      if (!hit) { selectRef.current(null); return; }
      const id = (hit.object.userData.objectID ?? hit.object.userData.triangleOwners?.[hit.faceIndex ?? -1]) as string;
      if(!id){selectRef.current(null);return;}
      if(affectedKind(hit.object.userData.role)){selectRef.current({floorID:floor.id,kind:'affectedArea',objectID:id,...(hitSurface(hit)?{surface:hitSurface(hit)!}:{})});return;}
      if(surfaceEditingRef.current){const surface=hitSurface(hit);if(surface){selectRef.current({floorID:floor.id,kind:'surface',objectID:id,surface});return;}if(hit.object.userData.role==='ceiling'){setMessage('This is a display-only ceiling. Establish its height before recording on it.');return;}}
      const ceilingRoom=floor.rooms.find(r=>r.ceiling?.id===id);
      const kind = floor.walls.some(w=>w.id===id) ? 'wall' : floor.openings.some(o=>o.id===id) ? 'opening' : floor.rooms.some(r=>r.id===id)||ceilingRoom ? 'room' : 'area'; selectRef.current({ floorID:floor.id,kind,objectID:ceilingRoom?.id??id });
    };
    const keyDown = (event: KeyboardEvent) => { if(event.key==='Escape'&&!walking.current){cancelAffected();affectedRef.current.onTool?.(null);event.preventDefault();return;}if (!walking.current) return; const key = event.key.toLowerCase(); if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape'].includes(key)) event.preventDefault(); if (key==='w'||key==='arrowup') moveRef.current(0.2,0); if(key==='s'||key==='arrowdown') moveRef.current(-0.2,0);if(key==='a')moveRef.current(0,-0.2);if(key==='d')moveRef.current(0,0.2);if(key==='arrowleft')lookRef.current(-0.12);if(key==='arrowright')lookRef.current(0.12);if(key==='escape')leaveWalk(); };
    const lost = (event: Event) => { event.preventDefault(); contextLost.current = true; cancelFrame(); renderer.domElement.dataset.rendered = 'false'; setError('The graphics context was interrupted. Switch to the plan, then reopen 3D to recover. Saved geometry is unaffected.'); stopRepeat(); };
    renderer.domElement.addEventListener('pointerdown', pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('keydown',keyDown);renderer.domElement.addEventListener('webglcontextlost',lost);
    const dispose = () => { disposed = true; disposeAffected();cancelFrame(); window.document.removeEventListener('visibilitychange', visibility); stopRepeat(); resize.disconnect(); controls.removeEventListener('change',render); controls.dispose(); resources.forEach(r=>r.dispose()); if(section){section.geometry.dispose();(section.material as THREE.Material).dispose();} if(selectedEdges){selectedEdges.geometry.dispose();(selectedEdges.material as THREE.Material).dispose();} if(selectedNode){selectedNode.dispose();selectedNode.geometry.dispose();(selectedNode.material as THREE.Material).dispose();} renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',keyDown);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();releaseTracker();renderer.forceContextLoss(); renderer.domElement.remove(); };
    runtime.current = { cancelAffected,refreshAffected,camera, controls, render, focus, initial, clipping, updateSection, select, showCeilings:visible=>{cancelAffected();ceilingBatches.forEach(batch=>{batch.mesh.visible=visible;});render();}, setActive:visible=>{if(!visible)cancelAffected();controls.enabled=visible&&!walking.current;if(visible)render();else{cancelFrame();renderer.domElement.dataset.rendered='false';}}, dispose };
    try { navigation.current = new WalkNavigation(document, floor.id); setPortalCount(navigation.current.portals.length); if (!navigation.current.roomIDs.includes(roomID)) setRoomID(navigation.current.roomIDs[0] ?? ''); } catch (cause) { navigation.current = null; setMessage(cause instanceof Error ? cause.message : String(cause)); }
    updateSection(cutaway ? cutHeight : null); select(selectedRef.current); render();
    return () => { const orbit=walking.current?initial:camera.position;const saved={camera:orbit.toArray() as [number,number,number],target:controls.target.toArray() as [number,number,number],...viewRef.current};lastFraming.current=saved;rememberRef.current?.(saved);runtime.current = null; navigation.current = null; walking.current = false; dispose(); };
  }, [document.documentID, document.revision, floor.id, contextAttempt]);
  useEffect(()=>{if(affectedTool){setSurfaceEditing(true);if(walking.current)leaveWalk();}runtime.current?.cancelAffected();runtime.current?.refreshAffected();},[affectedTool?.token,affectedFence?.contextKey,disabled,selection?.objectID,selection?.kind]);
  useEffect(()=>{runtime.current?.cancelAffected();runtime.current?.refreshAffected();},[surfaceEditing]);
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
  useEffect(() => { runtime.current?.cancelAffected();runtime.current?.updateSection(cutaway ? cutHeight : null); }, [cutaway, cutHeight]);
  useEffect(() => { if(!active)return;runtime.current?.select(selection);if(!walking.current&&selection?.kind==='room')setRoomID(selection.objectID); }, [selection, groupSelection, fills, active]);
  useEffect(()=>{runtime.current?.showCeilings(ceilings);},[ceilings]);
  useEffect(() => { const stop = () => stopRepeat(); window.addEventListener('pointerup',stop);window.addEventListener('blur',stop);window.document.addEventListener('visibilitychange',stop);return()=>{stopRepeat();window.removeEventListener('pointerup',stop);window.removeEventListener('blur',stop);window.document.removeEventListener('visibilitychange',stop);}; },[]);
  function hold(action: () => void) { stopRepeat(); action(); repeat.current = setInterval(action, 110); }
  return <div className="spatial-model" hidden={!active} inert={!active} style={active?undefined:{display:'none'}}><div ref={host} className="spatial-model-canvas" />
    <div className="spatial-model-bar"><div className="spatial-segmented"><button aria-pressed={mode==='orbit'} onClick={leaveWalk}>Orbit</button><button aria-pressed={mode==='walk'} disabled={!roomID || !!error} onClick={()=>beginWalk()}>Walk through</button></div>{mode==='orbit'&&<button aria-pressed={surfaceEditing} disabled={disabled} onClick={()=>{runtime.current?.cancelAffected();setSurfaceEditing(!surfaceEditing);onAffectedTool?.(null);}}>Edit surfaces</button>}<button onClick={()=>{runtime.current?.cancelAffected();mode==='walk'?beginWalk():leaveWalk();}}>Reset view</button></div>
    <div className="spatial-model-options" data-mode={mode}>{mode==='orbit'&&<button className="spatial-model-settings-toggle" aria-expanded={settingsOpen} aria-controls={settingsID} onClick={()=>setSettingsOpen(!settingsOpen)}>{settingsOpen?'Hide controls':'View controls'}</button>}<div id={settingsID} className="spatial-model-settings" data-open={settingsOpen}>{mode==='orbit' ? <><label className="spatial-check"><input type="checkbox" checked={fills} onChange={event=>setFills(event.target.checked)} />Surface fills</label><label className="spatial-check"><input type="checkbox" checked={ceilings} onChange={event=>setCeilings(event.target.checked)} />Display ceilings</label><label className="spatial-check"><input type="checkbox" checked={cutaway} onChange={event=>setCutaway(event.target.checked)} />Cutaway</label>{cutaway && <label className="spatial-cut-control">Cut height<input type="range" aria-label="Cutaway height" min="0.1" max="0.95" step="0.01" value={cut} onChange={event=>setCut(Number(event.target.value))} /></label>}</> : <><span className="spatial-walk-badge">● WALKING</span><button onClick={leaveWalk}>Exit walking</button></>}{!!floor.rooms.length && <label className="spatial-room-select"><span>Start in</span><select value={roomID} onChange={event=>{setRoomID(event.target.value);if(mode==='walk')beginWalk(event.target.value);}}>{floor.rooms.map(room=><option key={room.id} value={room.id}>{room.label}</option>)}</select></label>}</div></div>
    {mode==='walk' && <div className="spatial-walk-controls" aria-label="Walking controls"><div><button aria-label="Turn left" onPointerDown={()=>hold(()=>lookRef.current(-0.1))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)lookRef.current(-0.1);}}>↶</button><button aria-label="Walk forward" onPointerDown={()=>hold(()=>moveRef.current(0.2,0))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0.2,0);}}>↑</button><button aria-label="Turn right" onPointerDown={()=>hold(()=>lookRef.current(0.1))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)lookRef.current(0.1);}}>↷</button></div><div><button aria-label="Step left" onPointerDown={()=>hold(()=>moveRef.current(0,-0.2))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0,-0.2);}}>←</button><button aria-label="Walk backward" onPointerDown={()=>hold(()=>moveRef.current(-0.2,0))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(-0.2,0);}}>↓</button><button aria-label="Step right" onPointerDown={()=>hold(()=>moveRef.current(0,0.2))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0,0.2);}}>→</button></div></div>}
    <div className="spatial-model-message" role="status">{error || message}{!error && mode==='walk' && <span> {portalCount === 0 ? 'No traversable room connections. Unknown boundaries stay closed.' : 'Windows and unknown exterior boundaries stay closed.'}</span>}</div>
  </div>;
}
