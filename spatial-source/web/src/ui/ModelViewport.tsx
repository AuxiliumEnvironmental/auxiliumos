import { beginOpeningModelDrag, openingModelDragPreview, openingModelCorners, openingModelEdges, type OpeningModelDrag } from './openingModelManipulation';
import { openingHostPreview } from '../core/scene';
import { sameOpeningGeometry, type OpeningCorner } from '../core/openings';
import { validateCutout } from '../core/cutouts';
import type { Fixture, Cutout, SurfacePoint } from '../types';
import { fixtureGeometry, fixtureFrame } from '../core/fixtures';
import { materialPolygons, profileRing } from '../core/cutoutGeometry';
import { wallRun } from '../core/surfaces';
import { beginFixtureDrag, fixtureDragPreview, fixtureHandlePoints, type FixtureDrag } from './fixtureManipulation';
import { assertCutoutDragRun, cutoutDragChart, moveCutout, resizeCutout, worldToSurfaceChart } from './cutoutManipulation';
import { installCeilingManipulator } from './ceilingManipulation';
import { CeilingHeightControls } from './CeilingHeightControls';
import { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildScene, displayCeilings, roomBoundary, wallPath, WalkNavigation } from '../core';
import { batchSceneFaces } from './sceneBatches';
import { surfaceLinearRGB, STRUCTURAL_EDGE_COLOR } from '../surfacePalette';
import { AFFECTED_COLORS, affectedKind } from '../affectedAreaPalette';
import { resolveSurface, surfaceKey, surfaceNormal, surfacePointToWorld } from '../core/surfaces';
import { domainContains } from '../core/affectedAreaGeometry';
import { projectToWall } from './openingManipulation';
import { affectedCommand, affectedCorners, affectedDragPreview, affectedFenceMatches, affectedOutline, AffectedPreviewQueue, currentAffectedFootprint, projectAffectedRay, type AffectedCommit, type AffectedDrag, type AffectedFence, type AffectedTool } from './affectedAreaManipulation';
import { trackRenderer } from './rendererDiagnostics';
import type { CeilingTarget, EditFence, SurfaceRef, SurfacePolygon, Floor, Opening, Point3, OpeningEditFence, EditCommand, Point2, Selection, SpatialDocument, WalkPosition } from '../types';

export type ModelViewState = { camera: [number,number,number]; target: [number,number,number]; cutaway: boolean; cut: number; fills: boolean; ceilings: boolean };
type Props = { featurePlacement?:Fixture|Cutout|null; onFeaturePlaced?:()=>void; onFeatureEdit?:(commands:EditCommand[],revision:number)=>Promise<boolean>; ceilingFence?: EditFence; onCeilingEdit?: (commands: EditCommand[],fence:EditFence)=>void; onWalkingChange?:(walking:boolean)=>void; affectedTool?:AffectedTool|null; onAffectedTool?:(tool:AffectedTool|null)=>void; onAffectedEdit?:AffectedCommit; affectedFence?:AffectedFence; active?: boolean; disabled?: boolean; editContext?: Omit<OpeningEditFence, 'openingID'>; onEdit?: (commands: EditCommand[], fence?: OpeningEditFence) => void | Promise<boolean>; rememberedView?: ModelViewState; rememberView?: (view: ModelViewState) => void; document: SpatialDocument; floor: Floor; selection: Selection | null; groupSelection?: Selection[]; onSelect: (selection: Selection | null) => void };
type Runtime = { cancelEdit:()=>void; cancelCeilingEdit: () => void; refreshCeilingEdit: () => void; cancelAffected:()=>void; refreshAffected:()=>void; cancelOpeningEdit: () => void; camera: THREE.PerspectiveCamera; controls: OrbitControls; render: () => void; focus: THREE.Vector3; initial: THREE.Vector3; clipping: THREE.Plane; updateSection: (height: number | null) => void; select: (selection: Selection | null) => void; showCeilings: (visible: boolean) => void; setActive: (active: boolean) => void; dispose: () => void };
export function ModelViewport({ featurePlacement,onFeaturePlaced,onFeatureEdit,affectedTool=null,onAffectedTool,onAffectedEdit,affectedFence,active = true, rememberedView, rememberView, document, floor, selection, groupSelection, onSelect, disabled = false, editContext, onEdit, ceilingFence, onCeilingEdit, onWalkingChange }: Props) {
  const editRef = useRef({ disabled, context: editContext, onEdit }); editRef.current = { disabled, context: editContext, onEdit };
  const featureEditRef=useRef(onFeatureEdit);featureEditRef.current=onFeatureEdit;const placementRef=useRef(featurePlacement);placementRef.current=featurePlacement;const placedRef=useRef(onFeaturePlaced);placedRef.current=onFeaturePlaced;const disabledRef=useRef(disabled);disabledRef.current=disabled;
  const selectedCeilingRoom=selection?.kind==='room'?floor.rooms.find(r=>r.id===selection.objectID):selection?.kind==='ceiling'?floor.rooms.find(r=>r.ceiling?.id===selection.objectID):undefined;
  const ceilingTarget:CeilingTarget|undefined=selectedCeilingRoom&&!groupSelection?.length?{floorID:floor.id,roomID:selectedCeilingRoom.id}:undefined;
  const [ceilingTargets,setCeilingTargets]=useState<CeilingTarget[]>([]);
  const ceilingRef=useRef({ceilingFence,onCeilingEdit,ceilingTarget,ceilingTargets,disabled,onWalkingChange});ceilingRef.current={ceilingFence,onCeilingEdit,ceilingTarget,ceilingTargets,disabled,onWalkingChange};
  useLayoutEffect(()=>{setCeilingTargets(ceilingTarget?[ceilingTarget]:[]);},[ceilingTarget?.floorID,ceilingTarget?.roomID]);
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
  useEffect(()=>{ceilingRef.current.onWalkingChange?.(mode==='walk');return()=>ceilingRef.current.onWalkingChange?.(false);},[mode]);
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
  const modelTop = floor.elevation + Math.max(0.5,...floor.walls.map(w=>w.baseY+w.height),...(floor.fixtures??[]).map(f=>fixtureFrame(document,f,floor.id).origin.y-floor.elevation+f.dimensions.height),...floor.rooms.map(r=>r.ceiling?.height??0));
  const cutHeight = floor.elevation + (modelTop - floor.elevation) * cut;
  const updateCamera = () => { const r = runtime.current, p = position.current; if (!r || !p) return; r.camera.position.set(p.point.x, p.eyeY, p.point.z); r.camera.lookAt(p.point.x + Math.sin(heading.current) * Math.cos(pitch.current), p.eyeY + Math.sin(pitch.current), p.point.z - Math.cos(heading.current) * Math.cos(pitch.current)); r.render(); };
  function leaveWalk() { runtime.current?.cancelEdit(); walking.current = false; setMode('orbit'); stopRepeat(); const r = runtime.current; if (r) { r.controls.enabled = true; r.camera.position.copy(r.initial); r.controls.target.copy(r.focus); r.controls.update(); r.render(); } position.current = null; setMessage('Drag to orbit. Scroll or pinch to zoom.'); }
  function beginWalk(id = roomID) { setSurfaceEditing(false);onAffectedTool?.(null); runtime.current?.cancelEdit(); try { if (!navigation.current) throw new Error('The walking model is unavailable.'); const p = navigation.current.start(id); position.current = p; const portal=navigation.current.portals.filter(portal=>portal.roomIDs.includes(id)).map(portal=>({x:(portal.a.x+portal.b.x)/2,z:(portal.a.z+portal.b.z)/2})).sort((a,b)=>Math.hypot(a.x-p.point.x,a.z-p.point.z)-Math.hypot(b.x-p.point.x,b.z-p.point.z))[0];const boundary=roomBoundary(floor,floor.rooms.find(room=>room.id===id)!);const target=portal??[...boundary].sort((a,b)=>Math.hypot(b.x-p.point.x,b.z-p.point.z)-Math.hypot(a.x-p.point.x,a.z-p.point.z))[0];heading.current=target?Math.atan2(target.x-p.point.x,-(target.z-p.point.z)):0;pitch.current = -0.35; walking.current = true; setMode('walk'); setCutaway(false); if (runtime.current){runtime.current.select(null);runtime.current.controls.enabled = false;} updateCamera(); setMessage('Tap a visible floor to move. Drag to look, or use the move buttons.'); setError(''); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); } }
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
    const oldWalkPoint=walking.current?position.current?.point:undefined;contextLost.current = false; setError(''); walking.current = false; setMode('orbit'); position.current = null; stopRepeat(); setMessage(oldWalkPoint?'The model revision changed. Walkthrough ended; choose a valid starting position.':'Drag to orbit. Scroll or pinch to zoom.');
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
    const ceilingObjects:THREE.Object3D[]=[];
    const ceilingCutoutIDs=new Set((floor.cutouts??[]).filter(c=>c.surface.kind==='ceiling').map(c=>c.id));
    const graphic = (() => { try { return buildScene(document, floor.id); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return null; } })();
    let section: THREE.LineSegments | null = null, selectedEdges: THREE.LineSegments | null = null, selectedNode: THREE.InstancedMesh | null = null;
    let ceilingManipulator:ReturnType<typeof installCeilingManipulator>|undefined;
    const isCeiling=(face:import('../types').SceneFace)=>face.role==='ceiling'||face.surface?.kind==='ceiling';
    const batches=graphic?batchSceneFaces({...graphic,faces:graphic.faces.filter(f=>!isCeiling(f))},clipping):[];
    const ceilingBatches=graphic?batchSceneFaces({...graphic,faces:[...graphic.faces.filter(isCeiling),...displayCeilings(document,floor.id)],edges:[]},clipping):[];
    for(const batch of ceilingBatches){batch.mesh.visible=ceilings;batch.updateColors(selectedRef.current?.objectID,fillsRef.current);scene.add(batch.mesh);meshes.push(batch.mesh);ceilingObjects.push(batch.mesh);resources.push(batch.mesh.geometry,batch.mesh.material);}
    const edgeBuffers:{geometry:THREE.BufferGeometry;edges:NonNullable<typeof graphic>["edges"];original:Float32Array;owners:string[]}[]=[];
    if (graphic) {
      for(const batch of batches){batch.updateColors(selectedRef.current?.objectID,fillsRef.current);scene.add(batch.mesh);meshes.push(batch.mesh);resources.push(batch.mesh.geometry,batch.mesh.material);}
      const grouped = new Map<string, number[]>();
      const groupedEdges=new Map<string,typeof graphic.edges>();
      const inferred = new Set(floor.walls.filter(w=>w.provenance.origin==='inferred').map(w=>w.id));
      for (const edge of graphic.edges) { const key = ceilingCutoutIDs.has(edge.objectID)?'ceilingFeature':inferred.has(edge.objectID) ? 'inferred' : edge.role === 'fixture'||edge.role==='cutout'?'feature':edge.role === 'area' ? 'area' : 'normal'; const vertices = grouped.get(key) ?? []; vertices.push(edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z); grouped.set(key, vertices);groupedEdges.set(key,[...(groupedEdges.get(key)??[]),edge]); }
      for (const [key, vertices] of grouped) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); const material = key==='inferred' ? new THREE.LineDashedMaterial({color:'#a87839',dashSize:.12,gapSize:.08,clippingPlanes:[clipping]}) : new THREE.LineBasicMaterial({ color: key==='feature'||key==='ceilingFeature'?'#167bab':key === 'area' ? '#759fba' : STRUCTURAL_EDGE_COLOR, clippingPlanes: [clipping] }); const lines=new THREE.LineSegments(geometry, material);if(key==='inferred')lines.computeLineDistances();if(key==='ceilingFeature'){lines.visible=ceilings;ceilingObjects.push(lines);}scene.add(lines);edgeBuffers.push({geometry,edges:groupedEdges.get(key)!,original:new Float32Array(vertices),owners:groupedEdges.get(key)!.map(e=>e.objectID)}); resources.push(geometry, material); }
      // Opening selection is a semantic hit target, never a rendered surface filling the void.
      for (const opening of floor.openings) {
        const wall = floor.walls.find(w=>w.id===opening.wallID)!; const path=wallPath(floor,wall);let traversed=0;
        for(let i=1;i<path.length;i++) {const a=path[i-1],b=path[i],length=Math.hypot(b.x-a.x,b.z-a.z),start=Math.max(opening.offset,traversed),end=Math.min(opening.offset+opening.width,traversed+length);if(end>start){const at=(offset:number)=>({x:a.x+(b.x-a.x)*(offset-traversed)/length,z:a.z+(b.z-a.z)*(offset-traversed)/length}),p=at(start),q=at(end),bottom=floor.elevation+wall.baseY+opening.bottom,top=bottom+opening.height;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([p.x,bottom,p.z,q.x,bottom,q.z,q.x,top,q.z,p.x,top,p.z],3));geometry.setIndex([0,1,2,0,2,3]);const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});const target=new THREE.Mesh(geometry,material);target.userData={objectID:opening.id,role:'opening',pickOnly:true};meshes.push(target);resources.push(geometry,material);}traversed+=length;}
      }
    }
    if(graphic)for(const c of floor.cutouts??[]){const points=profileRing(c.profile).map(p=>surfacePointToWorld(document,c.surface,p)!);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flatMap(p=>[p.x,p.y,p.z]),3));geometry.setIndex(Array.from({length:points.length-2},(_,i)=>[0,i+1,i+2]).flat());const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});const target=new THREE.Mesh(geometry,material);target.userData={objectID:c.id,role:'cutout',pickOnly:true};if(c.surface.kind==='ceiling'){target.visible=ceilings;ceilingObjects.push(target);}meshes.push(target);resources.push(geometry,material);}
    const bounds = new THREE.Box3();if(graphic)for(const f of graphic.faces)for(const p of f.vertices)bounds.expandByPoint(new THREE.Vector3(p.x,p.y,p.z)); for (const node of floor.nodes) bounds.expandByPoint(new THREE.Vector3(node.point.x, floor.elevation, node.point.z));
    if (bounds.isEmpty()) { bounds.min.set(-2, floor.elevation, -2); bounds.max.set(2, floor.elevation + 2.6, 2); } else bounds.max.y = modelTop;
    const focus = bounds.getCenter(new THREE.Vector3()), span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z,bounds.max.y-bounds.min.y,4), initial = focus.clone().add(new THREE.Vector3(span * 0.8, span * 0.9, span * 1.05).multiplyScalar(Math.max(1,el.clientHeight/Math.max(1,el.clientWidth))));
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
        inRenderFrame=true;
        try {
          const pendingPreview=pendingAffectedFrame;pendingAffectedFrame=null;pendingPreview?.callback();
        try { flushOpeningPreview(); } catch (cause) { cancelOpeningEdit(); setMessage(cause instanceof Error ? cause.message : String(cause)); }
        camera.updateMatrixWorld(true);renderer.domElement.dataset.modelProjection=JSON.stringify(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).elements);const rect=renderer.domElement.getBoundingClientRect();renderer.domElement.dataset.featureHandles=JSON.stringify(handlePoints.map(h=>{const p=new THREE.Vector3(h.point.x,h.point.y,h.point.z).project(camera);return{mode:h.mode,x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};}));
        updateOpeningHandles();ceilingManipulator?.refresh();
        renderer.render(scene, camera);
        renderer.domElement.dataset.rendered = 'true';
          refreshAffected();
        } catch(cause) { setMessage(cause instanceof Error?cause.message:String(cause)); } finally { inRenderFrame=false; }
      });
    };
    const visibility = () => { if (window.document.hidden) { cancelOpeningEdit(); cancelFrame(); } else { touchContacts.clear(); fencedContacts.clear(); render(); } };
    window.document.addEventListener('visibilitychange', visibility);
    const gizmos=new THREE.Group();scene.add(gizmos);
    let handlePoints:{mode:string;point:Point3}[]=[];
    const updateHandles=(fixture?:Fixture,cutout?:Cutout)=>{
      for(const child of [...gizmos.children]){gizmos.remove(child);const mesh=child as THREE.Mesh;mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}
      if(cutout?.surface.kind==='ceiling'&&!viewRef.current.ceilings)cutout=undefined;
      handlePoints=fixture?fixtureHandlePoints(document,floor.id,fixture):cutout?[{mode:'resize',point:surfacePointToWorld(document,cutout.surface,profileRing(cutout.profile)[cutout.profile.shape==='circle'?0:2])!}]:[];
      for(const h of handlePoints){const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshBasicMaterial({color:'#167bab',clippingPlanes:[clipping]}));sphere.position.set(h.point.x,h.point.y,h.point.z);sphere.scale.setScalar(camera.position.distanceTo(sphere.position)*Math.tan(camera.fov*Math.PI/360)*16/Math.max(1,el.clientHeight));sphere.userData.mode=h.mode;gizmos.add(sphere);}
    };
    const select = (selection: Selection | null) => {
      cancelOpeningEdit();
      cancelFeature();updateHandles(selection?.kind==='fixture'?floor.fixtures?.find(f=>f.id===selection.objectID):undefined,selection?.kind==='cutout'?floor.cutouts?.find(c=>c.id===selection.objectID):undefined);
      ceilingManipulator?.cancel();
      const selected = (groupRef.current?.length ? groupRef.current : selection ? [selection] : []).filter(item=>item.floorID===floor.id);
      const ids = new Set<string>(selected.map(item=>item.objectID));
      renderer.domElement.dataset.selectedIds = JSON.stringify([...ids].sort());
      for(const batch of [...batches,...ceilingBatches])batch.updateColors(ids,fillsRef.current);
      if (selectedEdges) { scene.remove(selectedEdges); selectedEdges.geometry.dispose(); (selectedEdges.material as THREE.Material).dispose(); selectedEdges = null; }
      if(selectedNode){scene.remove(selectedNode);selectedNode.dispose();selectedNode.geometry.dispose();(selectedNode.material as THREE.Material).dispose();selectedNode=null;}
      const edges = graphic?.edges.filter(e=>ids.has(e.objectID)&&(viewRef.current.ceilings||!ceilingCutoutIDs.has(e.objectID))) ?? [];
      if (edges.length) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(edges.flatMap(e=>[e.a.x,e.a.y,e.a.z,e.b.x,e.b.y,e.b.z]),3)); selectedEdges = new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#087aae',clippingPlanes:[clipping],depthTest:selected.some(s=>s.kind==='fixture'||s.kind==='cutout')})); selectedEdges.renderOrder=2; scene.add(selectedEdges); }
      const nodeIDs=new Set(selected.filter(item=>item.kind==='node').map(item=>item.objectID)),nodes=floor.nodes.filter(node=>nodeIDs.has(node.id));
      if(nodes.length){const markers=new THREE.InstancedMesh(new THREE.SphereGeometry(.075,12,8),new THREE.MeshBasicMaterial({color:'#087aae',depthTest:false}),nodes.length),matrix=new THREE.Matrix4();nodes.forEach((node,index)=>{matrix.makeTranslation(node.point.x,floor.elevation+.075,node.point.z);markers.setMatrixAt(index,matrix);});markers.instanceMatrix.needsUpdate=true;markers.renderOrder=3;selectedNode=markers;scene.add(markers);}
      render();
    };
    const cameraChanged=()=>{if(feature)cancelContact();for(const child of gizmos.children){child.scale.setScalar(camera.position.distanceTo(child.position)*Math.tan(camera.fov*Math.PI/360)*16/Math.max(1,el.clientHeight));}render();};
    controls.addEventListener('change', cameraChanged);
    const resize = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (!width || !height) return; cancelOpeningEdit();runtime.current?.cancelAffected();ceilingManipulator?.cancel();if(feature)cancelContact(); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); }); resize.observe(el);
    const updateSection = (height: number | null) => {
      cancelOpeningEdit();cancelFeature();ceilingManipulator?.cancel();clipping.constant = height ?? 1e8;
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
    // Opening edits live inside this renderer. Pointer samples never recreate it.
    type EditSample = { x: number; y: number };
    type ActiveOpeningEdit = { pointerID: number; drag: OpeningModelDrag; fence: OpeningEditFence; camera: string; rect: DOMRect; host: Floor; queue: EditSample[]; result?: { opening: Opening; error?: string; held?: boolean } };
    let openingEdit: ActiveOpeningEdit | null = null;
    const touchContacts = new Set<number>(), fencedContacts = new Set<number>();
    const handleLayer = window.document.createElement('div'); handleLayer.className = 'spatial-opening-model-handles'; handleLayer.setAttribute('aria-label', 'Selected opening resize handles'); el.appendChild(handleLayer);
    const leaders = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg'); leaders.classList.add('spatial-opening-leaders'); handleLayer.appendChild(leaders);
    const handleButtons = (['start-bottom', 'start-top', 'end-bottom', 'end-top'] as OpeningCorner[]).map(corner => {
      const button = window.document.createElement('button'); button.type = 'button'; button.dataset.openingCorner = corner; button.setAttribute('aria-label', `Resize opening ${corner.replace('-', ' ')} corner`); button.title = 'Drag this corner. Use Details for exact dimensions.'; button.hidden = true;
      const dot = window.document.createElement('span'); button.appendChild(dot); handleLayer.appendChild(button); return button;
    });
    let previewObjects: THREE.Object3D[] = [], previewResources: Array<{ dispose(): void }> = [];
    const cameraSignature = () => JSON.stringify([camera.position.toArray(), camera.quaternion.toArray(), camera.projectionMatrix.elements]);
    const selectedOpening = () => selectedRef.current?.kind === 'opening' && !groupRef.current?.length ? floor.openings.find(o => o.id === selectedRef.current!.objectID) : undefined;
    const screenPoint = (point: Point3) => {
      camera.updateMatrixWorld(); const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera), rect = renderer.domElement.getBoundingClientRect();
      return { x: (projected.x + 1) * rect.width / 2, y: (1 - projected.y) * rect.height / 2, z: projected.z };
    };
    const rayAt = (x: number, y: number) => {
      const rect = renderer.domElement.getBoundingClientRect(); camera.updateMatrixWorld();
      raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
      return { origin: { x: raycaster.ray.origin.x, y: raycaster.ray.origin.y, z: raycaster.ray.origin.z }, direction: { x: raycaster.ray.direction.x, y: raycaster.ray.direction.y, z: raycaster.ray.direction.z } };
    };
    const visibleAt = (point: Point3) => {
      if (point.y > clipping.constant + 1e-6) return false;
      const screen = screenPoint(point), rect = renderer.domElement.getBoundingClientRect();
      if (screen.z < -1 || screen.z > 1 || screen.x < 0 || screen.x > rect.width || screen.y < 0 || screen.y > rect.height) return false;
      rayAt(rect.left + screen.x, rect.top + screen.y);
      const targetDistance = camera.position.distanceTo(new THREE.Vector3(point.x, point.y, point.z));
      const hit = raycaster.intersectObjects([...meshes.filter(mesh => mesh.visible && !mesh.userData.pickOnly), ...previewObjects.filter(object => object instanceof THREE.Mesh)], false).find(hit => hit.point.y <= clipping.constant + 1e-6);
      return !hit || hit.distance >= targetDistance - Math.max(.006, targetDistance * 1e-5);
    };
    const hideOriginal = (ids: ReadonlySet<string>) => {
      for (const batch of batches) batch.setHiddenObjects(ids);
      for (const buffer of edgeBuffers) {
        const positions = buffer.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < buffer.owners.length; i++) {
          const offset = i * 6, hidden = ids.has(buffer.owners[i]);
          for (let vertex = 0; vertex < 2; vertex++) { const source = offset + (hidden ? 0 : vertex * 3); positions.setXYZ(i * 2 + vertex, buffer.original[source], buffer.original[source + 1], buffer.original[source + 2]); }
        }
        positions.needsUpdate = true;
      }
    };
    const removePreview = () => { for (const object of previewObjects) scene.remove(object); for (const resource of previewResources) resource.dispose(); previewObjects = []; previewResources = []; };
    function cancelOpeningEdit(fenceContacts = true) {
      const current = openingEdit; openingEdit = null;
      if (current) {
        if (fenceContacts) fencedContacts.add(current.pointerID);
        removePreview(); hideOriginal(new Set()); if (selectedEdges) selectedEdges.visible = true; if (section) section.visible = true;
        if (renderer.domElement.hasPointerCapture(current.pointerID)) renderer.domElement.releasePointerCapture(current.pointerID);
        controls.enabled = activeRef.current && !walking.current; pointer = null; render();
        if (fenceContacts && !disposed) setMessage('Opening edit cancelled. Saved geometry is unchanged.');
      }
    }
    const editingAvailable = () => activeRef.current && !walking.current && !surfaceEditingRef.current && !editRef.current.disabled && !!editRef.current.context && !!editRef.current.onEdit && !contextLost.current && !!graphic;
    function editStillCurrent(edit: ActiveOpeningEdit): boolean {
      const context = editRef.current.context, rect = renderer.domElement.getBoundingClientRect();
      return editingAvailable() && selectedOpening()?.id === edit.fence.openingID && !!context && Object.keys(context).every(key => context[key as keyof typeof context] === edit.fence[key as keyof OpeningEditFence]) && cameraSignature() === edit.camera && ['left', 'top', 'width', 'height'].every(key => Math.abs(rect[key as 'left' | 'top' | 'width' | 'height'] - edit.rect[key as 'left' | 'top' | 'width' | 'height']) < .1);
    }
    function updateOpeningHandles() {
      leaders.replaceChildren(); const opening = openingEdit?.result?.opening ?? selectedOpening();
      for (const button of handleButtons) button.hidden = true;
      if (!editingAvailable() || !opening) return;
      const rect = renderer.domElement.getBoundingClientRect(); if (rect.width < 100 || rect.height < 100) return;
      const positions = openingModelCorners(openingEdit?.host ?? floor, opening).map((entry, i) => ({ ...entry, i, anchor: screenPoint(entry.point), visible: visibleAt(entry.point) })).filter(entry => entry.visible).map(entry => ({ ...entry, x: entry.anchor.x, y: entry.anchor.y }));
      // Separate 44px targets even for narrow projected openings. Leaders keep
      // the physical corner explicit; the frozen initial ray preserves grab offset.
      for (let pass = 0; pass < 8; pass++) for (let i = 0; i < positions.length; i++) for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i], b = positions[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= 48) continue;
        const ux = d > .01 ? dx / d : (i % 2 ? 1 : -1), uy = d > .01 ? dy / d : (j % 2 ? 1 : -1), shift = (48 - d) / 2;
        a.x -= ux * shift; a.y -= uy * shift; b.x += ux * shift; b.y += uy * shift;
      }
      for (const entry of positions) {
        entry.x = Math.max(22, Math.min(rect.width - 22, entry.x)); entry.y = Math.max(22, Math.min(rect.height - 22, entry.y));
        if (positions.some(other => other !== entry && Math.hypot(entry.x - other.x, entry.y - other.y) < 43)) continue;
        const button = handleButtons[entry.i]; button.hidden = false; button.dataset.openingId = opening.id; button.style.left = `${entry.x}px`; button.style.top = `${entry.y}px`;
        const leader = window.document.createElementNS('http://www.w3.org/2000/svg', 'line'); leader.setAttribute('x1', String(entry.anchor.x)); leader.setAttribute('y1', String(entry.anchor.y)); leader.setAttribute('x2', String(entry.x)); leader.setAttribute('y2', String(entry.y)); leaders.appendChild(leader);
      }
    }
    function paintOpeningPreview(edit: ActiveOpeningEdit) {
      const result = edit.result; if (!result) return;
      removePreview();
      const candidate = result.error ? edit.drag.chart.original : result.opening;
      const local = openingHostPreview(edit.host, candidate, document);
      for (const batch of batchSceneFaces({ ...graphic!, faces: local.faces, edges: [] }, clipping)) { batch.updateColors(new Set([candidate.id]), fillsRef.current); scene.add(batch.mesh); previewObjects.push(batch.mesh); previewResources.push(batch.mesh.geometry, batch.mesh.material); }
      const wire = (edges: { a: Point3; b: Point3 }[], color: string) => {
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(edges.flatMap(edge => [edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z]), 3));
        const material = new THREE.LineBasicMaterial({ color, clippingPlanes: [clipping] }), lines = new THREE.LineSegments(geometry, material); scene.add(lines); previewObjects.push(lines); previewResources.push(geometry, material);
      };
      wire(local.edges, STRUCTURAL_EDGE_COLOR); wire(openingModelEdges(edit.host, result.opening), result.error ? '#b34232' : '#087aae');
      setMessage(result.error ?? (result.held ? 'View angle is nearly parallel to the wall. Preview held. Use Details for exact dimensions.' : `${result.opening.width.toFixed(3)} m wide, ${result.opening.height.toFixed(3)} m high. Release to save; Escape cancels.`));
    }
    function flushOpeningPreview(paint = true) {
      const edit = openingEdit; if (!edit || !edit.queue.length) return;
      if (!editStillCurrent(edit)) { cancelOpeningEdit(); return; }
      const previous = edit.result;
      for (const sample of edit.queue.splice(0)) edit.result = openingModelDragPreview(edit.host, edit.drag, rayAt(sample.x, sample.y));
      if (paint && edit.result && (!previous || !sameOpeningGeometry(previous.opening, edit.result.opening) || previous.error !== edit.result.error || previous.held !== edit.result.held)) paintOpeningPreview(edit);
    }
    const beginEdit = (event: PointerEvent) => {
      if((event.target as Element).closest('.spatial-ceiling-drag-handle')||ceilingManipulator?.ownsPointer(event.pointerId))return;
      if (fencedContacts.has(event.pointerId)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.button !== 0 || touchContacts.size > 1 || !editingAvailable()) return;
      const opening = selectedOpening(); if (!opening) return;
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-opening-corner]');
      let mode: OpeningCorner | 'move' = 'move', grabbedU: number | undefined;
      if (button) {
        if (button.hidden || button.dataset.openingId !== opening.id || !handleButtons.includes(button)) return;
        mode = button.dataset.openingCorner as OpeningCorner;
      } else {
        const rect = renderer.domElement.getBoundingClientRect(), point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const candidates = openingModelEdges(floor, opening).map(edge => {
          const a = screenPoint(edge.a), b = screenPoint(edge.b), dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
          const t = squared > 1e-8 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0;
          const world = { x: edge.a.x + (edge.b.x - edge.a.x) * t, y: edge.a.y + (edge.b.y - edge.a.y) * t, z: edge.a.z + (edge.b.z - edge.a.z) * t };
          return { distance: Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t), u: edge.au + (edge.bu - edge.au) * t, world };
        }).filter(candidate => candidate.distance <= (event.pointerType === 'touch' ? 22 : 10) && visibleAt(candidate.world)).sort((a, b) => a.distance - b.distance);
        if (!candidates.length) return; grabbedU = candidates[0].u;
      }
      event.preventDefault(); event.stopImmediatePropagation();cancelFeature();
      const drag = beginOpeningModelDrag(floor, opening, mode, rayAt(event.clientX, event.clientY), grabbedU);
      if (!drag) { setMessage('This wall is too edge-on to edit. Rotate the view or use Details.'); return; }
      const wall = floor.walls.find(w => w.id === opening.wallID)!, nodeIDs = new Set(wall.nodeIDs);
      const hostFloor: Floor = { id: floor.id, label: floor.label, elevation: floor.elevation, nodes: floor.nodes.filter(node => nodeIDs.has(node.id)), walls: [wall], openings: floor.openings.filter(o => o.wallID === wall.id), rooms: [], cutouts: (floor.cutouts??[]).filter(c=>c.surface.kind==='wall'&&c.surface.wallID===wall.id) };
      openingEdit = { pointerID: event.pointerId, drag, fence: { ...editRef.current.context!, openingID: opening.id }, camera: cameraSignature(), rect: renderer.domElement.getBoundingClientRect(), host: structuredClone(hostFloor), queue: [{ x: event.clientX, y: event.clientY }] };
      pointer = null; controls.enabled = false;
      hideOriginal(new Set([wall.id, ...hostFloor.openings.map(o => o.id), ...(hostFloor.cutouts??[]).map(c=>c.id)])); if (selectedEdges) selectedEdges.visible = false; if (section) section.visible = false;
      try { renderer.domElement.setPointerCapture(event.pointerId); } catch { cancelOpeningEdit(); return; }
      render();
    };
    const moveEdit = (event: PointerEvent) => {
      if (fencedContacts.has(event.pointerId)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const edit = openingEdit; if (!edit || edit.pointerID !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const samples = event.getCoalescedEvents?.() ?? [];
      edit.queue.push(...(samples.length ? samples : [event]).map(sample => ({ x: sample.clientX, y: sample.clientY })));
      // Bound a suspended-tab burst; exceeding the budget cancels, never drops
      // a path-continuity sample or silently commits a shortened gesture.
      if (edit.queue.length > 4096) { cancelOpeningEdit(); setMessage('Opening edit cancelled after an interrupted pointer stream.'); return; }
      render();
    };
    const finishEdit = (event: PointerEvent) => {
      if (fencedContacts.has(event.pointerId)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const edit = openingEdit; if (!edit || edit.pointerID !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancelFrame();
      edit.queue.push({ x: event.clientX, y: event.clientY });
      try { flushOpeningPreview(false); } catch (cause) { cancelOpeningEdit(); setMessage(cause instanceof Error ? cause.message : String(cause)); return; }
      if (openingEdit !== edit) return;
      const result = edit.result; cancelOpeningEdit(false);
      if (!result || result.error || result.held || sameOpeningGeometry(edit.drag.chart.original, result.opening)) { if (result?.error) setMessage(result.error); return; }
      try { void Promise.resolve(editRef.current.onEdit?.([{ type: 'updateOpening', floorID: floor.id, opening: result.opening }], edit.fence)).catch(cause => { if (!disposed) setMessage(cause instanceof Error ? cause.message : String(cause)); }); } catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
    };
    const cancelOpeningPointer = (event: PointerEvent) => { if (openingEdit?.pointerID === event.pointerId) cancelOpeningEdit(); };
    const editKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && openingEdit) { event.preventDefault(); cancelOpeningEdit(); setMessage('Opening edit cancelled. Saved geometry is unchanged.'); } };
    const contactDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !el.contains(event.target as Node) && !openingEdit) return;
      touchContacts.add(event.pointerId);
      if (touchContacts.size > 1 && openingEdit) { for (const id of touchContacts) fencedContacts.add(id); cancelOpeningEdit(); }
    };
    const contactUp = (event: PointerEvent) => { touchContacts.delete(event.pointerId); fencedContacts.delete(event.pointerId); };
    const editBlur = () => cancelOpeningEdit();
    const editFocus = () => { cancelOpeningEdit(); touchContacts.clear(); fencedContacts.clear(); };
    const orbitChanged = () => { if (openingEdit && cameraSignature() !== openingEdit.camera) cancelOpeningEdit(); render(); };
    el.addEventListener('pointerdown', beginEdit, true); el.addEventListener('pointermove', moveEdit, true); el.addEventListener('pointerup', finishEdit, true); el.addEventListener('pointercancel', cancelOpeningPointer, true); renderer.domElement.addEventListener('lostpointercapture', cancelOpeningPointer);
    window.addEventListener('pointerdown', contactDown, true); window.addEventListener('pointerup', contactUp); window.addEventListener('pointercancel', contactUp); window.addEventListener('keydown', editKey); window.addEventListener('blur', editBlur); window.addEventListener('focus', editFocus);
    controls.addEventListener('change', orbitChanged);
    const disposeOpeningEdit = () => {
      cancelOpeningEdit(); removePreview(); handleLayer.remove();
      el.removeEventListener('pointerdown', beginEdit, true); el.removeEventListener('pointermove', moveEdit, true); el.removeEventListener('pointerup', finishEdit, true); el.removeEventListener('pointercancel', cancelOpeningPointer, true); renderer.domElement.removeEventListener('lostpointercapture', cancelOpeningPointer);
      window.removeEventListener('pointerdown', contactDown, true); window.removeEventListener('pointerup', contactUp); window.removeEventListener('pointercancel', contactUp); window.removeEventListener('keydown', editKey); window.removeEventListener('blur', editBlur); window.removeEventListener('focus', editFocus); controls.removeEventListener('change', orbitChanged);
    };

    const raycaster = new THREE.Raycaster();
    let pointer: { x: number; y: number; moved: boolean; id:number } | null = null;
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
      const state=affectedRef.current;if(!surfaceEditingRef.current||walking.current||state.disabled||!state.onEdit||event.button!==0||!state.fence||state.fence.documentID!==document.documentID||state.fence.expectedRevision!==document.revision)return;
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


    let feature: {pointerID:number; fixture?:FixtureDrag; cutout?:Cutout; start:Point3; plane:THREE.Plane; mode:string; last?:Fixture|Cutout; revision:number} | null=null;
    let featureFrame=0,latestEvent:PointerEvent|null=null;
    const contacts=new Set<number>();let fenced=false;
    const pick=(event:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);return raycaster.intersectObjects(meshes.filter(mesh=>mesh.visible&&(!walking.current&&!placementRef.current||!mesh.userData.pickOnly&&!affectedKind(mesh.userData.role)))).find(candidate=>candidate.point.y<=clipping.constant+1e-6);};
    const previewFixture=(fixture:Fixture)=>{const geometry=fixtureGeometry(document,fixture,floor.id);for(const batch of batches)if(batch.mesh.userData.role==='fixture')batch.updateObjectVertices(fixture.id,geometry.faces);previewEdges(fixture.id,geometry.edges);updateHandles(fixture);render();};
    const previewEdges=(id:string,edges:NonNullable<typeof graphic>['edges'])=>{for(const buffer of edgeBuffers){const positions=buffer.geometry.getAttribute('position');let cursor=0;for(let i=0;i<buffer.edges.length;i++){if(buffer.edges[i].objectID!==id)continue;const e=edges[cursor++];if(!e)continue;positions.setXYZ(i*2,e.a.x,e.a.y,e.a.z);positions.setXYZ(i*2+1,e.b.x,e.b.y,e.b.z);}positions.needsUpdate=true;buffer.geometry.computeBoundingSphere();}};
    let surfacePreview:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>|null=null;let previewHost:{id:string;role:string}|null=null;
    const clearSurfacePreview=()=>{if(surfacePreview){scene.remove(surfacePreview);surfacePreview.geometry.dispose();surfacePreview.material.dispose();surfacePreview=null;}if(previewHost)for(const batch of [...batches,...ceilingBatches])if(batch.mesh.userData.role===previewHost.role)batch.setObjectVisible(previewHost.id,true);previewHost=null;};
    const previewCutout=(cutout:Cutout)=>{
      const ref=cutout.surface,id=ref.kind==='wall'?ref.wallID:ref.kind==='ceiling'?ref.ceilingID:ref.roomID,role=ref.kind;
      const draft={...document,floors:document.floors.map(f=>f.id!==floor.id?f:{...f,cutouts:(f.cutouts??[]).map(c=>c.id===cutout.id?cutout:c)})};
      validateCutout(draft,cutout);const domain=resolveSurface(draft,ref);if(!domain)return;const wall=ref.kind==='wall'?floor.walls.find(w=>w.id===ref.wallID):null,breaks:number[]=[];if(wall){const path=wallPath(floor,wall);let u=0;breaks.push(0);for(let i=1;i<path.length;i++){u+=Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z);breaks.push(u);}}
      const positions:number[]=[];for(const polygon of materialPolygons(domain.domain,breaks)){const vertices=polygon.map(p=>surfacePointToWorld(draft,ref,p)!);for(let i=1;i<vertices.length-1;i++)for(const p of [vertices[0],vertices[i],vertices[i+1]])positions.push(p.x,p.y,p.z);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeBoundingSphere();
      if(!surfacePreview){previewHost={id,role};for(const batch of [...batches,...ceilingBatches])if(batch.mesh.userData.role===role)batch.setObjectVisible(id,false);surfacePreview=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:new THREE.Color(...surfaceLinearRGB(role)),side:THREE.DoubleSide,clippingPlanes:[clipping],polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));surfacePreview.visible=role!=='ceiling'||viewRef.current.ceilings;scene.add(surfacePreview);}else{surfacePreview.geometry.dispose();surfacePreview.geometry=geometry;}
const ring=profileRing(cutout.profile).map(p=>surfacePointToWorld(document,cutout.surface,p)!);previewEdges(cutout.id,ring.map((a,i)=>({objectID:cutout.id,role:'cutout',a,b:ring[(i+1)%ring.length]})));updateHandles(undefined,cutout);render();};
    function cancelFeature(){if(featureFrame)cancelAnimationFrame(featureFrame);featureFrame=0;latestEvent=null;const old=feature;feature=null;if(old){if(old.fixture)previewFixture(old.fixture.original);if(old.cutout){const ring=profileRing(old.cutout.profile).map(p=>surfacePointToWorld(document,old.cutout!.surface,p)!);previewEdges(old.cutout.id,ring.map((a,i)=>({objectID:old.cutout!.id,role:'cutout',a,b:ring[(i+1)%ring.length]})));updateHandles(undefined,old.cutout);clearSurfacePreview();}if(renderer.domElement.hasPointerCapture(old.pointerID))renderer.domElement.releasePointerCapture(old.pointerID);}controls.enabled=!walking.current;pointer=null;if(old){if(selectedEdges)selectedEdges.visible=true;render();}}
    const intersect=(event:PointerEvent,plane:THREE.Plane)=>{pick(event);const point=raycaster.ray.intersectPlane(plane,new THREE.Vector3());return point&&Math.abs(raycaster.ray.direction.dot(plane.normal))>1e-5?point:null;};
    const candidate=(event:PointerEvent):Fixture|Cutout|null=>{if(!feature)return null;const point=intersect(event,feature.plane);if(!point)return null;if(feature.fixture)return fixtureDragPreview(feature.fixture,point);const cutout=feature.cutout!,{start,end}=cutoutDragChart(document,cutout,feature.start,point),value=feature.mode==='resize'?resizeCutout(cutout,end.u-start.u,end.v-start.v):moveCutout(cutout,start,end);assertCutoutDragRun(document,cutout,value);return value;};
    const processFeature=(event:PointerEvent)=>{if(!feature||disabledRef.current)return;try{const value=candidate(event);if(!value)return;feature.last=value;if('catalog' in value)previewFixture(value);else previewCutout(value);setMessage('Draft preview. Release to validate and save. Escape cancels.');}catch(e){setMessage((e as Error).message);}};
    const pointerDown = (event: PointerEvent) => {
      if(event.button!==0)return;contacts.add(event.pointerId);if(contacts.size>1){fenced=true;cancelFeature();return;}if(fenced)return;
      pointer={x:event.clientX,y:event.clientY,moved:false,id:event.pointerId};if(walking.current){renderer.domElement.setPointerCapture(event.pointerId);return;}
      if(disabledRef.current||placementRef.current)return;
      const hit=pick(event),selected=selectedRef.current,id=hit&&(hit.object.userData.objectID??hit.object.userData.triangleOwners?.[hit.faceIndex??-1]);
      const fixture=selected?.kind==='fixture'?floor.fixtures?.find(f=>f.id===selected.objectID):undefined,cutout=selected?.kind==='cutout'?floor.cutouts?.find(c=>c.id===selected.objectID):undefined;if(!fixture&&!cutout)return;
      const rect=renderer.domElement.getBoundingClientRect();
      const handle=handlePoints.map(h=>{const p=new THREE.Vector3(h.point.x,h.point.y,h.point.z).project(camera);const center=new THREE.Vector3(h.point.x,h.point.y,h.point.z),ray=new THREE.Raycaster(camera.position,center.clone().sub(camera.position).normalize());const obstruction=ray.intersectObjects(meshes.filter(m=>m.visible&&!m.userData.pickOnly)).find(x=>x.point.y<=clipping.constant+1e-6),owner=obstruction&&(obstruction.object.userData.objectID??obstruction.object.userData.triangleOwners?.[obstruction.faceIndex??-1]);return{h,d:Math.hypot(rect.left+(p.x+1)*rect.width/2-event.clientX,rect.top+(1-p.y)*rect.height/2-event.clientY),visible:p.z>=-1&&p.z<=1&&h.point.y<=clipping.constant+1e-6&&(!obstruction||owner===selected?.objectID||obstruction.distance>=camera.position.distanceTo(center)-.01)};}).filter(v=>v.visible&&v.d<=22).sort((a,b)=>a.d-b.d)[0]?.h;
      if(!handle&&id!==selected?.objectID)return;const mode=handle?.mode??'move';
      const origin=fixture?fixtureFrame(document,fixture,floor.id).origin:surfacePointToWorld(document,cutout!.surface,cutout!.profile.center)!;
      let normal=new THREE.Vector3(0,1,0);if(mode==='height'||mode==='move'&&(fixture?.mount.kind==='wall'||cutout?.surface.kind==='wall')||cutout?.surface.kind==='wall'){
        if(fixture?.mount.kind==='wall'||cutout?.surface.kind==='wall'){const ref=fixture?.mount.kind==='wall'?fixture.mount.surface:cutout!.surface;if(ref.kind!=='wall')return;const u=fixture?.mount.kind==='wall'?fixture.mount.u:cutout!.profile.center.u,run=wallRun(document,ref,u-.001,u+.001);if(!run)return;normal.set(-run.tz,0,run.tx);}else{normal.copy(camera.position).sub(new THREE.Vector3(origin.x,origin.y,origin.z));normal.y=0;if(normal.length()<1e-5)return;normal.normalize();}
      }
      const anchor=handle?.point??origin,plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(anchor.x,anchor.y,anchor.z)),grab=intersect(event,plane);if(!grab){setMessage('Use exact dimensions for this viewing angle.');return;}
      feature={pointerID:event.pointerId,fixture:fixture?beginFixtureDrag(document,floor.id,fixture,mode as FixtureDrag['mode'],grab):undefined,cutout:cutout?structuredClone(cutout):undefined,start:{x:grab.x,y:grab.y,z:grab.z},plane,mode,revision:document.revision};controls.enabled=false;if(selectedEdges)selectedEdges.visible=false;renderer.domElement.setPointerCapture(event.pointerId);event.stopImmediatePropagation();
    };
    const pointerMove = (event: PointerEvent) => {if(feature){if(feature.pointerID!==event.pointerId)return;latestEvent=event;if(!featureFrame)featureFrame=requestAnimationFrame(()=>{featureFrame=0;const latest=latestEvent;latestEvent=null;if(latest)processFeature(latest);});if(pointer&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>4)pointer.moved=true;return;}if(!pointer||pointer.id!==event.pointerId)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;if(Math.hypot(dx,dy)>4)pointer.moved=true;if(walking.current&&pointer.moved){lookRef.current(dx*.006,-dy*.005);pointer.x=event.clientX;pointer.y=event.clientY;} };
    const pointerUp = (event: PointerEvent) => {
      contacts.delete(event.pointerId);if(fenced){if(!contacts.size)fenced=false;return;}
      if(feature&&feature.pointerID===event.pointerId){const owned=feature,moved=pointer?.moved;let value:Fixture|Cutout|null=null;try{value=candidate(event);}catch(e){setMessage((e as Error).message);}cancelFeature();if(!disabledRef.current&&moved&&value&&JSON.stringify(value)!==JSON.stringify(owned.fixture?.original??owned.cutout)){const commands:EditCommand[]='catalog' in value?[{type:'setFixture',floorID:floor.id,fixture:value}]:[{type:'setCutout',floorID:floor.id,cutout:value}];void featureEditRef.current?.(commands,owned.revision);}return;}
      if(!pointer||pointer.moved){pointer=null;return;}pointer=null;const hit=pick(event);
      if(walking.current){if(hit?.object.userData.role==='floor')moveTargetRef.current({x:hit.point.x,z:hit.point.z});else setMessage('Tap a visible floor surface to move. Walls and windows remain barriers.');return;}
      const template=placementRef.current;if(template&&!disabledRef.current){if(!hit){setMessage('Choose a visible point on the explicitly selected host surface.');return;}const id=hit.object.userData.objectID??hit.object.userData.triangleOwners?.[hit.faceIndex??-1];const value=structuredClone(template);
        if('catalog' in value){if(value.mount.kind==='floor'){if(hit.object.userData.role!=='floor'){setMessage('Choose a visible floor surface for this fixture, or use the 2D plan.');return;}value.mount.position={x:hit.point.x,z:hit.point.z};}else{if(id!==value.mount.surface.wallID){setMessage('Choose the explicitly selected host wall.');return;}const p=worldToSurfaceChart(document,value.mount.surface,hit.point);value.mount.u=p.u;value.mount.v=p.v;}}
        else{const expected=value.surface.kind==='wall'?value.surface.wallID:value.surface.kind==='ceiling'?value.surface.ceilingID:value.surface.roomID;if(id!==expected||hit.object.userData.role!==value.surface.kind){setMessage('Choose the explicitly selected surface. Show ceilings to place a ceiling hole.');return;}value.profile.center=worldToSurfaceChart(document,value.surface,hit.point);}
        const commands:EditCommand[]='catalog' in value?[{type:'setFixture',floorID:floor.id,fixture:value}]:[{type:'setCutout',floorID:floor.id,cutout:value}];void featureEditRef.current?.(commands,document.revision).then(ok=>{if(ok){placedRef.current?.();selectRef.current({floorID:floor.id,kind:'catalog' in value?'fixture':'cutout',objectID:value.id});}});return;
      }
      if(!hit){selectRef.current(null);return;}const id=(hit.object.userData.objectID??hit.object.userData.triangleOwners?.[hit.faceIndex??-1]) as string;if(!id){selectRef.current(null);return;}
      if(affectedKind(hit.object.userData.role)){selectRef.current({floorID:floor.id,kind:'affectedArea',objectID:id,...(hitSurface(hit)?{surface:hitSurface(hit)!}:{})});return;}
      if(surfaceEditingRef.current){const surface=hitSurface(hit);if(surface){selectRef.current({floorID:floor.id,kind:'surface',objectID:id,surface});return;}if(hit.object.userData.role==='ceiling'){setMessage('This is a display-only ceiling. Establish its height before recording on it.');return;}}
      const kind=floor.fixtures?.some(f=>f.id===id)?'fixture':floor.cutouts?.some(c=>c.id===id)?'cutout':floor.walls.some(w=>w.id===id)?'wall':floor.openings.some(o=>o.id===id)?'opening':floor.rooms.some(r=>r.id===id)?'room':floor.rooms.some(r=>r.ceiling?.id===id)?'ceiling':'area';selectRef.current({floorID:floor.id,kind,objectID:id});
    };
    const cancelContact=()=>{fenced=contacts.size>0;cancelFeature();};
    const lostContact=(event:PointerEvent)=>{if(feature?.pointerID===event.pointerId)cancelContact();};
    const endCancel=(event:PointerEvent)=>{contacts.delete(event.pointerId);cancelContact();if(!contacts.size)fenced=false;};
    const globalRelease=(event:PointerEvent)=>{contacts.delete(event.pointerId);if(!contacts.size)fenced=false;};window.addEventListener('pointerup',globalRelease);window.addEventListener('pointercancel',globalRelease);const suspend=()=>{cancelFeature();contacts.clear();fenced=false;};window.addEventListener('blur',suspend);window.document.addEventListener('visibilitychange',suspend);renderer.domElement.addEventListener('pointercancel',endCancel);renderer.domElement.addEventListener('lostpointercapture',lostContact);
    const keyDown = (event: KeyboardEvent) => {if(event.key==='Escape'&&!walking.current&&(owned||affectedRef.current.tool)){event.preventDefault();cancelAffected();affectedRef.current.onTool?.(null);return;}if(event.key==='Escape'&&feature){event.preventDefault();cancelContact();return;} if (!walking.current) return; const key = event.key.toLowerCase(); if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','escape'].includes(key)) event.preventDefault(); if (key==='w'||key==='arrowup') moveRef.current(0.2,0); if(key==='s'||key==='arrowdown') moveRef.current(-0.2,0);if(key==='a')moveRef.current(0,-0.2);if(key==='d')moveRef.current(0,0.2);if(key==='arrowleft')lookRef.current(-0.12);if(key==='arrowright')lookRef.current(0.12);if(key==='escape')leaveWalk(); };
    const lost = (event: Event) => { event.preventDefault();cancelAffected();cancelOpeningEdit();ceilingManipulator?.cancel();cancelFeature(); contextLost.current = true; cancelFrame(); renderer.domElement.dataset.rendered = 'false'; setError('The graphics context was interrupted. Switch to the plan, then reopen 3D to recover. Saved geometry is unaffected.'); stopRepeat(); };
    renderer.domElement.addEventListener('pointerdown', pointerDown, true);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('keydown',keyDown);renderer.domElement.addEventListener('webglcontextlost',lost);
    const previewCeilingHeights = (heights: ReadonlyMap<string,number> | null) => {
      ceilingBatches.forEach(batch=>batch.previewCeilingHeights(heights));
      const cutoutHeights = new Map<string,number>();
      for(const cutout of floor.cutouts??[])if(cutout.surface.kind==='ceiling'){
        const source=surfacePointToWorld(document,cutout.surface,cutout.profile.center);
        if(source)cutoutHeights.set(cutout.id,heights?.get(cutout.surface.ceilingID)??source.y);
      }
      for(const buffer of edgeBuffers){const positions=buffer.geometry.getAttribute('position');let changed=false;
        for(let i=0;i<buffer.edges.length;i++){const y=cutoutHeights.get(buffer.edges[i].objectID);if(y===undefined)continue;positions.setY(i*2,y);positions.setY(i*2+1,y);changed=true;}
        if(changed){positions.needsUpdate=true;buffer.geometry.computeBoundingSphere();}
      }
      for(const mesh of meshes){const y=cutoutHeights.get(mesh.userData.objectID);if(y===undefined||!mesh.userData.pickOnly||!(mesh instanceof THREE.Mesh))continue;const positions=mesh.geometry.getAttribute('position');for(let i=0;i<positions.count;i++)positions.setY(i,y);positions.needsUpdate=true;mesh.geometry.computeBoundingSphere();}
    };
    ceilingManipulator=installCeilingManipulator({three:THREE,scene,camera,controls,clipping,canvas:renderer.domElement,host:el,meshes,
      state:()=>{const state=ceilingRef.current;return{document,floorID:floor.id,targets:state.ceilingTarget?state.ceilingTargets:[],fence:state.ceilingFence??{documentID:document.documentID,expectedRevision:document.revision,contextKey:'',generation:-1},enabled:activeRef.current&&!walking.current&&!surfaceEditingRef.current&&!state.disabled&&!!state.ceilingFence&&!!state.onCeilingEdit&&!!state.ceilingTarget&&!contextLost.current,navigationEnabled:activeRef.current&&!walking.current,viewKey:JSON.stringify([cameraSignature(),viewRef.current,editRef.current.context?.view])};},
      render,requestPreview:callback=>requestAnimationFrame(callback),cancelPreview:cancelAnimationFrame,notify:setMessage,previewHeights:previewCeilingHeights,commit:(command,fence)=>ceilingRef.current.onCeilingEdit?.([command],fence)});
    const dispose = () => {disposeAffected();ceilingManipulator?.dispose();cancelFeature();for(const child of gizmos.children){const mesh=child as THREE.Mesh;mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}window.removeEventListener('pointerup',globalRelease);window.removeEventListener('pointercancel',globalRelease);window.removeEventListener('blur',suspend);window.document.removeEventListener('visibilitychange',suspend);renderer.domElement.removeEventListener('pointercancel',endCancel);renderer.domElement.removeEventListener('lostpointercapture',lostContact); disposed = true; cancelFrame();disposeOpeningEdit(); window.document.removeEventListener('visibilitychange', visibility); stopRepeat(); resize.disconnect(); controls.removeEventListener('change',cameraChanged); controls.dispose(); resources.forEach(r=>r.dispose()); if(section){section.geometry.dispose();(section.material as THREE.Material).dispose();} if(selectedEdges){selectedEdges.geometry.dispose();(selectedEdges.material as THREE.Material).dispose();} if(selectedNode){selectedNode.dispose();selectedNode.geometry.dispose();(selectedNode.material as THREE.Material).dispose();} renderer.domElement.removeEventListener('pointerdown',pointerDown,true);renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('keydown',keyDown);renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();releaseTracker();renderer.forceContextLoss(); renderer.domElement.remove(); };
    runtime.current = { cancelAffected,refreshAffected,cancelCeilingEdit:()=>ceilingManipulator?.cancel(),refreshCeilingEdit:()=>ceilingManipulator?.refresh(),cancelOpeningEdit,cancelEdit:()=>{cancelAffected();cancelOpeningEdit();ceilingManipulator?.cancel();cancelContact();}, camera, controls, render, focus, initial, clipping, updateSection, select, showCeilings:visible=>{cancelAffected();cancelOpeningEdit();ceilingManipulator?.cancel();cancelContact();ceilingObjects.forEach(object=>{object.visible=visible;});select(selectedRef.current);}, setActive:visible=>{if(!visible){cancelAffected();cancelOpeningEdit();ceilingManipulator?.cancel();cancelContact();}controls.enabled=visible&&!walking.current;if(visible)render();else{cancelFrame();renderer.domElement.dataset.rendered='false';}}, dispose };
    try { navigation.current = new WalkNavigation(document, floor.id); setPortalCount(navigation.current.portals.length); if (!navigation.current.roomIDs.includes(roomID)) setRoomID(navigation.current.roomIDs[0] ?? ''); } catch (cause) { navigation.current = null; setMessage(cause instanceof Error ? cause.message : String(cause)); }
    updateSection(cutaway ? cutHeight : null); select(selectedRef.current); render();
    return () => { const orbit=walking.current?initial:camera.position;const saved={camera:orbit.toArray() as [number,number,number],target:controls.target.toArray() as [number,number,number],...viewRef.current};lastFraming.current=saved;rememberRef.current?.(saved);runtime.current = null; navigation.current = null; walking.current = false; dispose(); };
  }, [document.documentID, document.revision, floor.id, contextAttempt]);
  useLayoutEffect(() => { runtime.current?.refreshCeilingEdit(); runtime.current?.render(); }, [ceilingFence?.documentID,ceilingFence?.expectedRevision,ceilingFence?.contextKey,ceilingFence?.generation,JSON.stringify(ceilingTargets),disabled,active]);
  useLayoutEffect(() => { runtime.current?.cancelOpeningEdit(); runtime.current?.render(); }, [disabled, editContext?.generation, editContext?.scope, editContext?.view, editContext?.revision, active, selection?.kind, selection?.objectID]);
  useEffect(()=>{if(affectedTool){setSurfaceEditing(true);if(walking.current)leaveWalk();}runtime.current?.cancelAffected();runtime.current?.refreshAffected();},[affectedTool?.token,affectedFence?.contextKey,affectedFence?.generation,affectedFence?.expectedRevision,disabled,selection?.objectID,selection?.kind]);
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
  useEffect(()=>{if(disabled||!active||featurePlacement)runtime.current?.cancelEdit();},[disabled,active,featurePlacement]);
  useEffect(() => { const stop = () => stopRepeat(); window.addEventListener('pointerup',stop);window.addEventListener('blur',stop);window.document.addEventListener('visibilitychange',stop);return()=>{stopRepeat();window.removeEventListener('pointerup',stop);window.removeEventListener('blur',stop);window.document.removeEventListener('visibilitychange',stop);}; },[]);
  function hold(action: () => void) { stopRepeat(); action(); repeat.current = setInterval(action, 110); }
  return <div className="spatial-model" hidden={!active} inert={!active} style={active?undefined:{display:'none'}}><div ref={host} className="spatial-model-canvas" />
    <div className="spatial-model-bar"><div className="spatial-segmented"><button aria-pressed={mode==='orbit'} onClick={leaveWalk}>Orbit</button><button aria-pressed={mode==='walk'} disabled={!roomID || !!error} onClick={()=>beginWalk()}>Walk through</button></div>{mode==='orbit'&&<button aria-pressed={surfaceEditing} disabled={disabled} onClick={()=>{runtime.current?.cancelAffected();setSurfaceEditing(!surfaceEditing);onAffectedTool?.(null);}}>Edit surfaces</button>}<button onClick={()=>{runtime.current?.cancelAffected();mode==='walk'?beginWalk():leaveWalk();}}>Reset view</button></div>
    <div className="spatial-model-options" data-mode={mode}>{mode==='orbit'&&<button className="spatial-model-settings-toggle" aria-expanded={settingsOpen} aria-controls={settingsID} onClick={()=>setSettingsOpen(!settingsOpen)}>{settingsOpen?'Hide controls':'View controls'}</button>}<div id={settingsID} className="spatial-model-settings" data-open={settingsOpen}>{mode==='orbit' ? <><label className="spatial-check"><input type="checkbox" checked={fills} onChange={event=>setFills(event.target.checked)} />Surface fills</label><label className="spatial-check"><input type="checkbox" checked={ceilings} onChange={event=>setCeilings(event.target.checked)} />Display ceilings</label><label className="spatial-check"><input type="checkbox" checked={cutaway} onChange={event=>setCutaway(event.target.checked)} />Cutaway</label>{cutaway && <label className="spatial-cut-control">Cut height<input type="range" aria-label="Cutaway height" min="0.1" max="0.95" step="0.01" value={cut} onChange={event=>setCut(Number(event.target.value))} /></label>}</> : <><span className="spatial-walk-badge">● WALKING</span><button onClick={leaveWalk}>Exit walking</button></>}{!!floor.rooms.length && <label className="spatial-room-select"><span>Start in</span><select value={roomID} onChange={event=>{setRoomID(event.target.value);if(mode==='walk')beginWalk(event.target.value);}}>{floor.rooms.map(room=><option key={room.id} value={room.id}>{room.label}</option>)}</select></label>}</div></div>
    {mode==='orbit'&&ceilingTarget&&ceilingFence&&onCeilingEdit&&<details className="spatial-ceiling-model-panel"><summary>Ceiling height</summary><CeilingHeightControls document={document} target={ceilingTarget} fence={ceilingFence} disabled={disabled} onEdit={onCeilingEdit} onTargetsChange={setCeilingTargets}/></details>}
    {mode==='walk' && <div className="spatial-walk-controls" aria-label="Walking controls"><div><button aria-label="Turn left" onPointerDown={()=>hold(()=>lookRef.current(-0.1))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)lookRef.current(-0.1);}}>↶</button><button aria-label="Walk forward" onPointerDown={()=>hold(()=>moveRef.current(0.2,0))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0.2,0);}}>↑</button><button aria-label="Turn right" onPointerDown={()=>hold(()=>lookRef.current(0.1))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)lookRef.current(0.1);}}>↷</button></div><div><button aria-label="Step left" onPointerDown={()=>hold(()=>moveRef.current(0,-0.2))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0,-0.2);}}>←</button><button aria-label="Walk backward" onPointerDown={()=>hold(()=>moveRef.current(-0.2,0))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(-0.2,0);}}>↓</button><button aria-label="Step right" onPointerDown={()=>hold(()=>moveRef.current(0,0.2))} onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onClick={event=>{if(event.detail===0)moveRef.current(0,0.2);}}>→</button></div></div>}
    <div className="spatial-model-message" role="status">{error || message}{!error && mode==='walk' && <span> {portalCount === 0 ? 'No traversable room connections. Unknown boundaries stay closed.' : 'Windows and unknown exterior boundaries stay closed.'}</span>}</div>
  </div>;
}
