import type { CeilingHeightEdit, CeilingTarget, EditFence, Point3, SpatialDocument } from '../types';
import { prepareCeilingEdit, previewCeilingHeights, type CeilingEditPlan, type CeilingHeightPreview } from '../core/ceilings';

export interface CeilingRay { origin: Point3; direction: Point3 }
export interface CeilingDragSample { preview: CeilingHeightPreview | null; valid: boolean; message: string; delta: number }
export function ceilingFenceMatches(a: EditFence, b: EditFence): boolean {
  return a.documentID === b.documentID && a.expectedRevision === b.expectedRevision && a.contextKey === b.contextKey && a.generation === b.generation;
}
const finite = (point: Point3): boolean => [point.x, point.y, point.z].every(Number.isFinite);
function intersect(ray: CeilingRay, origin: Point3, normal: Point3): Point3 | null {
  if (!finite(ray.origin) || !finite(ray.direction)) return null;
  const length = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z), denominator = ray.direction.x * normal.x + ray.direction.z * normal.z;
  if (length <= 1e-12 || Math.abs(denominator) / length < 1e-5) return null;
  const t = ((origin.x - ray.origin.x) * normal.x + (origin.z - ray.origin.z) * normal.z) / denominator;
  if (!Number.isFinite(t) || t < 0) return null;
  const point = { x: ray.origin.x + t * ray.direction.x, y: ray.origin.y + t * ray.direction.y, z: ray.origin.z + t * ray.direction.z };
  return finite(point) && Math.abs(point.y) <= 20000 ? point : null;
}

/** A concrete ceiling gesture, always based on one original revision and one vertical plane. */
export class CeilingDrag {
  readonly plan: CeilingEditPlan;
  readonly fence: EditFence;
  readonly pointerID: number;
  private readonly origin: Point3;
  private readonly normal: Point3;
  private readonly grabY: number;
  private readonly basis: readonly number[];
  private ended = false;
  private last: CeilingDragSample = { preview: null, valid: false, message: '', delta: 0 };
  constructor(document: SpatialDocument, targets: readonly CeilingTarget[], fence: EditFence, pointerID: number, grab: Point3, ray: CeilingRay, cameraBasis: readonly number[]) {
    if (!Number.isSafeInteger(pointerID) || !finite(grab) || !cameraBasis.length || !cameraBasis.every(Number.isFinite) || fence.documentID !== document.documentID || fence.expectedRevision !== document.revision) throw new Error('The ceiling gesture cannot start from this view or revision.');
    this.plan = prepareCeilingEdit(document, targets); previewCeilingHeights(this.plan, 'delta', 0); // Null members must be initialized explicitly.
    const x = ray.origin.x - grab.x, z = ray.origin.z - grab.z, length = Math.hypot(x, z);
    if (length < 1e-5) throw new Error('This view is too close to directly overhead. Orbit slightly or enter an exact height.');
    this.origin = { ...grab }; this.normal = { x: x / length, y: 0, z: z / length };
    const start = intersect(ray, this.origin, this.normal); if (!start) throw new Error('The height plane is edge-on. Orbit slightly or enter an exact height.');
    this.grabY = start.y; this.pointerID = pointerID; this.fence = { ...fence }; this.basis = [...cameraBasis];
  }
  sample(ray: CeilingRay, cameraBasis: readonly number[]): CeilingDragSample {
    if (this.ended) return { ...this.last, valid: false, message: 'This ceiling gesture has ended.' };
    if (cameraBasis.length !== this.basis.length || !cameraBasis.every((value, i) => Number.isFinite(value) && Math.abs(value - this.basis[i]) <= 1e-10)) return { ...this.last, valid: false, message: 'The camera changed. Release and begin a new height gesture, or enter an exact value.' };
    const point = intersect(ray, this.origin, this.normal);
    if (!point) return { ...this.last, valid: false, message: 'The height plane is edge-on. The last valid preview is held; use exact height entry.' };
    try {
      const delta = point.y - this.grabY, preview = previewCeilingHeights(this.plan, 'delta', delta);
      this.last = { preview, valid: true, message: '', delta }; return this.last;
    } catch (cause) { return { ...this.last, valid: false, message: cause instanceof Error ? cause.message : String(cause) }; }
  }
  finish(ray: CeilingRay, cameraBasis: readonly number[], currentFence: EditFence): CeilingHeightEdit | null {
    if (this.ended || !ceilingFenceMatches(this.fence, currentFence)) { this.cancel(); return null; }
    const sample = this.sample(ray, cameraBasis); this.ended = true;
    if (!sample.valid || !sample.preview?.changed) return null;
    return { type: 'setCeilingHeights', targets: this.plan.targets.map(({ floorID, roomID }) => ({ floorID, roomID })), mode: 'delta', value: sample.delta };
  }
  cancel(): void { this.ended = true; }
}

/** One latest ceiling sample per animation frame; terminal release bypasses queued approximation. */
export class CeilingPreviewFrames<T> {
  private pending: T | undefined;
  private frame: number | null = null;
  constructor(private readonly publish: (sample: T) => void, private readonly request: (callback: FrameRequestCallback) => number = requestAnimationFrame, private readonly cancelRequest: (id: number) => void = cancelAnimationFrame) {}
  push(value: T): void { this.pending = value; if (this.frame === null) this.frame = this.request(() => { this.frame = null; const value = this.pending; this.pending = undefined; if (value !== undefined) this.publish(value); }); }
  flush(value: T): void { this.clear(); this.publish(value); }
  clear(): void { if (this.frame !== null) this.cancelRequest(this.frame); this.frame = null; this.pending = undefined; }
}

import { roomBoundary, triangulate, wallPath } from '../core/geometry';
import { resolvedCeilingHeight } from '../core/ceilings';
interface CeilingViewportState {
  document: SpatialDocument;
  floorID: string;
  targets: readonly CeilingTarget[];
  fence: EditFence;
  enabled: boolean;
  navigationEnabled: boolean;
  viewKey: string;
}
interface CeilingViewportOptions {
  three: typeof import('three');
  scene: import('three').Scene;
  camera: import('three').PerspectiveCamera;
  controls: { enabled: boolean };
  clipping: import('three').Plane;
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  meshes: import('three').Object3D[];
  state: () => CeilingViewportState;
  render: () => void;
  requestPreview: (callback: FrameRequestCallback) => number;
  cancelPreview: (id: number) => void;
  notify: (message: string) => void;
  previewHeights: (heights: ReadonlyMap<string, number> | null) => void;
  commit: (command: CeilingHeightEdit, fence: EditFence) => void;
}
/** DOM/Three adapter for the same tested ceiling command. It never writes a document or storage. */
export function installCeilingManipulator(options: CeilingViewportOptions): { refresh: () => void; cancel: () => void; ownsPointer: (id: number) => boolean; dispose: () => void } {
  const { three: T, camera, scene, canvas, host, controls, clipping } = options;
  const handle = window.document.createElement('button'); handle.type = 'button'; handle.className = 'spatial-ceiling-drag-handle'; handle.textContent = '\u2195'; handle.setAttribute('aria-label', 'Drag ceiling height'); handle.title = 'Drag vertically to change the selected ceiling heights. Exact entry is also available.'; handle.hidden = true; host.appendChild(handle);
  const raycaster = new T.Raycaster(), point = new T.Vector3(), projected = new T.Vector3();
  const contacts = new Map<number, { x: number; y: number; type: string }>(), abandoned = new Set<number>();
  let forwarding = false, disposed = false, stamp = '', drag: CeilingDrag | null = null, dragStamp = '', anchor: Point3 | null = null;
  let outline: import('three').LineSegments | null = null;
  let outlineBase: number[] = [], vertexRooms: { id: string; start: number; count: number; height: number }[] = [];
  let extension: import('three').LineSegments | null = null, extensionRanges: { id: string; start: number; count: number; baseY: number; height: number }[] = [];
  const signature = (state: CeilingViewportState) => JSON.stringify([state.fence, state.floorID, state.targets, state.enabled, state.viewKey]);
  const basis = () => [...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements];
  const ray = (x: number, y: number): CeilingRay => { const rect = canvas.getBoundingClientRect(); camera.updateMatrixWorld(); raycaster.setFromCamera(new T.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera); return { origin: { ...raycaster.ray.origin }, direction: { ...raycaster.ray.direction } }; };
  const disposeLine = (line: import('three').LineSegments | null) => { if (line) { scene.remove(line); line.geometry.dispose(); (line.material as import('three').Material).dispose(); } };
  const line = (values: number[], visible = true) => { const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(values, 3)); const result = new T.LineSegments(geometry, new T.LineBasicMaterial({ color: '#087aae', clippingPlanes: [clipping], depthTest: true })); result.visible = visible; scene.add(result); return result; };
  const moveHandle = () => {
    const state = options.state();
    if (!state.enabled || !anchor || disposed) { handle.hidden = true; return; }
    camera.updateMatrixWorld(); point.set(anchor.x, anchor.y, anchor.z); projected.copy(point).project(camera);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > .94 || Math.abs(projected.y) > .9 || anchor.y > clipping.constant + 1e-6) { handle.hidden = true; return; }
    if (!drag) {
      raycaster.set(camera.position, point.clone().sub(camera.position).normalize());
      const distance = camera.position.distanceTo(point);
      const blocked = raycaster.intersectObjects(options.meshes.filter(mesh => mesh.visible && !mesh.userData.pickOnly)).some(hit => hit.point.y <= clipping.constant + 1e-6 && hit.distance < distance - .015);
      if (blocked) { handle.hidden = true; return; }
    }
    handle.hidden = false; handle.style.left = `${(projected.x + 1) * rect.width / 2}px`; handle.style.top = `${(1 - projected.y) * rect.height / 2}px`;
  };
  const resetPreview = () => {
    options.previewHeights(null);
    if (outline) { const attribute = outline.geometry.getAttribute('position') as import('three').BufferAttribute; attribute.copyArray(outlineBase); attribute.needsUpdate = true; outline.geometry.computeBoundingSphere(); }
    disposeLine(extension); extension = null; extensionRanges = [];
  };
  const frames = new CeilingPreviewFrames<{ x: number; y: number }>(sample => {
    if (!drag || !options.state().enabled || signature(options.state()) !== dragStamp) { cancel(); return; }
    const result = drag.sample(ray(sample.x, sample.y), basis());
    if (result.preview) {
      const floor = options.state().document.floors.find(f => f.id === options.state().floorID)!;
      const heights = new Map<string, number>();
      for (const h of result.preview.heights) if (h.floorID === floor.id) { const room = floor.rooms.find(r => r.id === h.roomID)!; heights.set(room.ceiling?.id ?? room.id, floor.elevation + h.height); }
      options.previewHeights(heights);
      if (outline) { const attribute = outline.geometry.getAttribute('position') as import('three').BufferAttribute; for (const range of vertexRooms) { const y = heights.get(range.id) ?? range.height; for (let i = range.start; i < range.start + range.count; i++) attribute.setY(i, y); } attribute.needsUpdate = true; outline.geometry.computeBoundingSphere(); }
      if (extension) { const attribute = extension.geometry.getAttribute('position') as import('three').BufferAttribute; for (const range of extensionRanges) { const h = result.preview.extensions.find(e => e.floorID === floor.id && e.wallID === range.id)?.height ?? range.height; for (let i = range.start; i < range.start + range.count; i++) attribute.setY(i, floor.elevation + range.baseY + h); } attribute.needsUpdate = true; extension.geometry.computeBoundingSphere(); extension.visible = result.preview.extensions.some(e => e.floorID === floor.id); }
      const first = result.preview.heights.find(h => h.floorID === floor.id && options.state().targets.some(t => t.floorID === h.floorID && t.roomID === h.roomID)); if (first && anchor) anchor.y = floor.elevation + first.height;
      options.notify(result.valid ? `${result.preview.heights.map(h => `${floor.id === h.floorID ? floor.rooms.find(r => r.id === h.roomID)?.label ?? h.roomID : h.roomID}: ${h.height.toFixed(3)} m`).join('; ')}. ${result.preview.extensions.length} wall extensions. Release to save once.` : result.message);
      moveHandle(); options.render();
    } else if (result.message) options.notify(result.message);
  },options.requestPreview,options.cancelPreview);
  function cancel(): void {
    frames.clear(); const previous = drag; drag = null;
    if (previous) { previous.cancel(); abandoned.add(previous.pointerID); if (handle.hasPointerCapture(previous.pointerID)) handle.releasePointerCapture(previous.pointerID); controls.enabled = options.state().navigationEnabled; resetPreview(); stamp = ''; options.render(); }
  }
  const refresh = () => {
    if (disposed) return;
    const state = options.state(), next = signature(state);
    if (drag && next !== dragStamp) cancel();
    if (stamp !== next) {
      stamp = next; disposeLine(outline); outline = null; outlineBase = []; vertexRooms = []; anchor = null;
      const floor = state.document.floors.find(f => f.id === state.floorID);
      const unknown = state.targets.some(t => { const f = state.document.floors.find(f => f.id === t.floorID), r = f?.rooms.find(r => r.id === t.roomID); return !f || !r || resolvedCeilingHeight(f, r) === null; });
      if (state.enabled && floor && !unknown && state.targets.length > 0 && state.targets.length <= 1000) {
        for (const target of state.targets.filter(t => t.floorID === floor.id)) {
          const room = floor.rooms.find(r => r.id === target.roomID); if (!room) continue;
          const height = resolvedCeilingHeight(floor, room); if (height === null) continue;
          const ring = roomBoundary(floor, room), y = floor.elevation + height, start = outlineBase.length / 3;
          if (start + ring.length * 2 > 200000) { outlineBase = []; vertexRooms = []; anchor = null; options.notify('Use exact height entry or a smaller visible room set for this preview.'); break; }
          for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; outlineBase.push(a.x, y, a.z, b.x, y, b.z); }
          vertexRooms.push({ id: room.ceiling?.id ?? room.id, start, count: ring.length * 2, height: y });
          if (!anchor) { const triangles = triangulate(ring); const t = triangles[0]; if (t) { const points = t.map(i => ring[i]); anchor = { x: points.reduce((sum, p) => sum + p.x, 0) / 3, y, z: points.reduce((sum, p) => sum + p.z, 0) / 3 }; } }
        }
        if (outlineBase.length) outline = line(outlineBase);
      }
      options.render();
    }
    moveHandle();
  };
  const down = (event: PointerEvent) => {
    const state = options.state();
    if (!state.enabled || !anchor || handle.hidden || event.button !== 0 || abandoned.has(event.pointerId) || contacts.size > 1) return;
    try {
      drag = new CeilingDrag(state.document, state.targets, state.fence, event.pointerId, anchor, ray(event.clientX, event.clientY), basis()); dragStamp = signature(state);
      controls.enabled = false; event.preventDefault(); event.stopPropagation(); handle.setPointerCapture(event.pointerId);
      const floor = state.document.floors.find(f => f.id === state.floorID)!, values: number[] = [];
      for (const wall of drag.plan.walls.filter(w => w.floorID === floor.id)) { const hostWall = floor.walls.find(w => w.id === wall.wallID)!, path = wallPath(floor, hostWall), start = values.length / 3; for (let i = 1; i < path.length; i++) values.push(path[i - 1].x, floor.elevation + wall.baseY + wall.height, path[i - 1].z, path[i].x, floor.elevation + wall.baseY + wall.height, path[i].z); extensionRanges.push({ id: wall.wallID, start, count: values.length / 3 - start, baseY: wall.baseY, height: wall.height }); }
      extension = line(values, false); options.notify('Drag the height handle. One common change applies to the displayed room set.');
    } catch (cause) { cancel(); options.notify(cause instanceof Error ? cause.message : String(cause)); }
  };
  const move = (event: PointerEvent) => { if (drag?.pointerID === event.pointerId) { event.preventDefault(); event.stopPropagation(); frames.push({ x: event.clientX, y: event.clientY }); } };
  const up = (event: PointerEvent) => {
    if (drag?.pointerID !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); frames.clear(); const current = drag, state = options.state();
    const command = state.enabled && signature(state) === dragStamp ? current.finish(ray(event.clientX, event.clientY), basis(), state.fence) : null;
    drag = null; abandoned.add(event.pointerId); if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); controls.enabled = state.navigationEnabled; resetPreview(); stamp = ''; refresh();
    if (command) options.commit(command, current.fence); else options.notify('No ceiling change was saved. Use a valid height or enter an exact value.');
  };
  const globalDown = (event: PointerEvent) => {
    if (forwarding) return;
    if (!contacts.has(event.pointerId)) abandoned.delete(event.pointerId);
    contacts.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
    if (drag && event.pointerId !== drag.pointerID) {
      const firstID = drag.pointerID, first = contacts.get(firstID); cancel(); options.notify('Height edit canceled. Two fingers navigate; no height was saved.');
      // The first contact began on the handle, not OrbitControls. Start its fresh
      // navigation contact before the second native event reaches the canvas.
      if (first?.type === 'touch' && event.pointerType === 'touch' && event.target === canvas) { forwarding = true; canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: firstID, pointerType: 'touch', clientX: first.x, clientY: first.y, button: 0, buttons: 1, isPrimary: true })); forwarding = false; }
    }
  };
  const globalMove = (event: PointerEvent) => { if (contacts.has(event.pointerId)) contacts.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType }); };
  const globalUp = (event: PointerEvent) => { contacts.delete(event.pointerId); queueMicrotask(() => abandoned.delete(event.pointerId)); };
  const interrupt = () => { cancel(); refresh(); };
  const blur = () => { interrupt(); contacts.clear(); };
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && drag) { event.preventDefault(); interrupt(); options.notify('Ceiling height edit canceled.'); } };
  const visibility = () => { if (window.document.hidden) interrupt(); };
  const lost = (event: PointerEvent) => { if (drag?.pointerID === event.pointerId) interrupt(); };
  const resize = new ResizeObserver(interrupt); resize.observe(canvas);
  handle.addEventListener('pointerdown', down); handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', lost); handle.addEventListener('lostpointercapture', lost);
  window.addEventListener('pointerdown', globalDown, true); window.addEventListener('pointermove', globalMove, true); window.addEventListener('pointerup', globalUp, true); window.addEventListener('pointercancel', globalUp, true); window.addEventListener('keydown', key, true); window.addEventListener('blur', blur); window.document.addEventListener('visibilitychange', visibility);
  refresh();
  return { refresh, cancel: interrupt, ownsPointer: id => drag?.pointerID === id || abandoned.has(id) || contacts.size > 1,
    dispose: () => { cancel(); disposed = true; frames.clear(); resize.disconnect(); disposeLine(outline); disposeLine(extension); handle.remove(); window.removeEventListener('pointerdown', globalDown, true); window.removeEventListener('pointermove', globalMove, true); window.removeEventListener('pointerup', globalUp, true); window.removeEventListener('pointercancel', globalUp, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); window.document.removeEventListener('visibilitychange', visibility); contacts.clear(); abandoned.clear(); }
  };
}
