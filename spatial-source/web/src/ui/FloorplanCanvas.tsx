import { OPENING_CATALOG, openingPlanLines, openingPreset, openingGeometryError } from '../core/openings';
import { maxSchemaVersion } from '../core/versions';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { roomBoundary, validateDocument, wallPath } from '../core';
import type { EditCommand, Floor, OpeningKind, OpeningStyleID, OpeningEditFence, Point2, Selection, SpatialDocument } from '../types';
import type { DrawingRecoveryPayload } from '../data/drawingRecovery';
import { distanceToPath, editedProvenance, freshDocument, objectLabel, openingPath, pointInPolygon, uid } from './geometry';
import { drawingSnap, overlappingSpan, zoomAt, type DrawPoint, type DrawingSnap } from './planInteraction';
import { rectangleCorners, rectangleRoomCommands } from './roomDrawing';
import { roomSnap, type RoomSnap } from './roomSnap';
import { SNAP } from './authoringSnap';
import { wallDrawingCommands } from './wallDrawing';
import { PlanGeometry } from './PlanGeometry';
import { FloorGeometryIndex } from '../core/geometry';
import { projectToWall, beginOpeningDrag, openingDragPreview, openingResizeHandles, type OpeningDrag, type OpeningPreview } from './openingManipulation';
import { previewOpeningPlacement, type OpeningPlacement } from './openingPlacement';
import { containedSelections, groupTranslation, prepareGroupTranslation, selectionKey, type SelectionBounds } from './groupSelection';

export type PlanViewState = { x: number; z: number; width: number; height: number };
export type CanvasTool = 'select' | 'pan' | 'wall' | 'area' | 'room' | 'opening' | 'marquee';
type MoveSample = { pointerId: number; clientX: number; clientY: number; shiftKey: boolean; altKey: boolean };
type GroupFilter = 'wallsAndAreas' | 'wall' | 'node' | 'room' | 'area' | 'opening' | 'all';
type Props = { document: SpatialDocument; groupSelection?: Selection[]; onGroupSelection?: (selection: Selection[]) => void; initialDraft?: DrawingRecoveryPayload; onDraftChange?: (payload: DrawingRecoveryPayload | null) => void; rememberedView?: PlanViewState; rememberView?: (view: PlanViewState) => void; onDrawingChange?: (active: boolean) => void; floor: Floor; selection: Selection | null; onSelect: (selection: Selection | null) => void; onEdit: (commands: EditCommand[], fence?: OpeningEditFence) => void | Promise<boolean>; editContext?: Omit<OpeningEditFence, 'openingID'>; disabled: boolean; tool: CanvasTool; onTool: (tool: CanvasTool) => void; onError: (message: string) => void };

const groupKinds = (filter: GroupFilter): Selection['kind'][] => filter === 'all' ? ['wall', 'node', 'room', 'area', 'opening'] : filter === 'wallsAndAreas' ? ['wall', 'area'] : [filter];
const boundsBetween = (a: Point2, b: Point2): SelectionBounds => ({ minX: Math.min(a.x, b.x), minZ: Math.min(a.z, b.z), maxX: Math.max(a.x, b.x), maxZ: Math.max(a.z, b.z) });
function pointsForSelection(floor: Floor, item: Selection): Point2[] {
  if (item.floorID !== floor.id) return [];
  if (item.kind === 'node') { const node = floor.nodes.find(value => value.id === item.objectID); return node ? [node.point] : []; }
  if (item.kind === 'wall') { const wall = floor.walls.find(value => value.id === item.objectID); return wall ? wallPath(floor, wall) : []; }
  if (item.kind === 'room') { const room = floor.rooms.find(value => value.id === item.objectID); return room ? roomBoundary(floor, room) : []; }
  if (item.kind === 'area') return floor.areas?.find(value => value.id === item.objectID)?.polygon ?? [];
  const opening = floor.openings.find(value => value.id === item.objectID), host = opening && floor.walls.find(wall => wall.id === opening.wallID);
  return opening && host ? openingPath(wallPath(floor, host), opening.offset, opening.width) : [];
}
function boundsForSelection(floor: Floor, items: Selection[]): SelectionBounds | null {
  let bounds: SelectionBounds | null = null;
  for (const item of items) for (const point of pointsForSelection(floor, item)) {
    if (!bounds) bounds = { minX: point.x, minZ: point.z, maxX: point.x, maxZ: point.z };
    else { bounds.minX = Math.min(bounds.minX, point.x); bounds.minZ = Math.min(bounds.minZ, point.z); bounds.maxX = Math.max(bounds.maxX, point.x); bounds.maxZ = Math.max(bounds.maxZ, point.z); }
  }
  return bounds;
}

/** Recovery keeps the exact shape and provenance, including an invalid draft.
 * Re-evaluate admission without generating a fresh starter shape or revision. */
function checkedPlacement(floor: Floor, draft: OpeningPlacement, schemaVersion: SpatialDocument['schemaVersion']): OpeningPlacement {
  const issues = validateDocument({ ...freshDocument('Opening draft validation'), schemaVersion: draft.opening.style ? maxSchemaVersion(schemaVersion,'1.2.0') : schemaVersion, floors: [{ ...floor, openings: [...floor.openings, draft.opening] }] });
  const error = !issues.length ? undefined : issues.some(issue => issue.code === 'opening_overlap')
    ? 'This opening overlaps another opening. Choose a clear span of the wall.'
    : 'This opening does not fit its saved wall. Reposition it inside the wall or cancel this draft.';
  return { opening: structuredClone(draft.opening), point: { ...draft.point }, ...(error ? { error } : {}) };
}

export function FloorplanCanvas({ document: geometryDocument, groupSelection = [], onGroupSelection, initialDraft, onDraftChange, rememberedView, rememberView, onDrawingChange, floor, selection, onSelect, onEdit, editContext, disabled: parentDisabled, tool, onTool, onError }: Props) {
  const restored = useRef(initialDraft?.tool === tool ? structuredClone(initialDraft) : undefined);
  const draftCallback = useRef(onDraftChange); draftCallback.current = onDraftChange;
  const [submitting, setSubmitting] = useState(false);
  const disabled = parentDisabled || submitting;
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const submission = useRef<object | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; submission.current = null; }; }, []);
  const svg = useRef<SVGSVGElement>(null);
  const choiceDialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState(rememberedView ?? { x: -1.5, z: -1.5, width: 11, height: 7 });
  const viewRef = useRef(view); viewRef.current = view;
  const rememberRef = useRef(rememberView); rememberRef.current = rememberView;
  const layoutReady = useRef(false), framed = useRef(false);
  useEffect(() => () => rememberRef.current?.({ ...viewRef.current }), []);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [points, setPoints] = useState<DrawPoint[]>(() => restored.current && restored.current.tool !== 'opening' ? restored.current.points.map(point => ({ ...point, nodeID: point.nodeID ?? uid() })) : []);
  const pointsRef = useRef(points);
  const [strokeStart, setStrokeStart] = useState<(Point2 & { nodeID?: string }) | null>(null);
  const [roomDragStart, setRoomDragStart] = useState<Point2 | null>(null);
  const [roomSnapping, setRoomSnapping] = useState(true);
  const roomSnapMemory = useRef<RoomSnap | null>(null);
  const wallSnapMemory = useRef<DrawingSnap | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('wallsAndAreas');
  const [addToGroup, setAddToGroup] = useState(false);
  const [marquee, setMarquee] = useState<SelectionBounds | null>(null);
  const [groupActive, setGroupActive] = useState(false);
  const [groupPreview, setGroupPreview] = useState<{ bounds: SelectionBounds; floor?: Floor; error?: string } | null>(null);
  const choosingGroup = useRef<{ additive: boolean; base: Selection[] } | null>(null);
  const groupKey = groupSelection.map(selectionKey).sort().join('|');
  const previousGroupKey = useRef(groupKey);
  const [openingActive, setOpeningActive] = useState(false);
  const [openingPreview, setOpeningPreview] = useState<OpeningPreview | null>(null);
  const [openingStyle, setOpeningStyle] = useState<OpeningStyleID | undefined>(() => restored.current?.tool === 'opening' ? restored.current.opening.style?.id : 'door_single');
  const [openingKind, setOpeningKind] = useState<OpeningKind>(() => restored.current?.tool === 'opening' ? restored.current.opening.kind : 'door');
  const [placement, setPlacement] = useState<OpeningPlacement | null>(() => restored.current?.tool === 'opening' ? checkedPlacement(floor, restored.current, geometryDocument.schemaVersion) : null);
  const placementRef = useRef(placement);
  const completedPlacement = useRef(placement);
  const placementIdentity = useRef<string | null>(placement?.opening.id ?? null);
  const [placementActive, setPlacementActive] = useState(false);
  const [choosingPlacement, setChoosingPlacement] = useState<Point2 | null>(null);
  const placementChoiceRef = useRef<Point2 | null>(null);
  const drawingCallback = useRef(onDrawingChange); drawingCallback.current = onDrawingChange;
  const hasDrawing = points.length > 0 || strokeStart !== null || roomDragStart !== null || openingActive || placementActive || placement !== null || choosingPlacement !== null || groupActive;
  useLayoutEffect(() => { drawingCallback.current?.(hasDrawing); return () => drawingCallback.current?.(false); }, [hasDrawing]);
  const [cursor, setCursor] = useState<{ point: Point2; shift: boolean; alt: boolean } | null>(null);
  const [choosingDrawCorner, setChoosingDrawCorner] = useState(false);
  const [preview, setPreview] = useState<{ kind: 'node' | 'wall'; id: string; delta: Point2 } | null>(null);
  const [choices, setChoices] = useState<Selection[]>([]);
  const [fills, setFills] = useState(true);
  const spaceHeld = useRef(false);
  const [spacePan, setSpacePan] = useState(false);
  const submittedIDs = useRef<string[]>([]);
  const submittedRoom = useRef<string | null>(null);
  const submittedOpening = useRef<string | null>(null);
  const gesture = useRef<{ pointerID: number; start: Point2; clientX: number; clientY: number; view: PlanViewState; hits: Selection[]; pan: boolean; drag?: Selection; opening?: OpeningDrag; fence?: OpeningEditFence; placementWallID?: string; roomAnchor?: Point2 & { nodeID?: string }; roomHandle?: 0 | 1; roomOffset?: Point2; roomBlocked?: boolean; wallStroke?: Point2 & { nodeID?: string }; marquee?: { additive: boolean; base: Selection[]; kinds: Selection['kind'][] }; group?: { document: SpatialDocument; selected: Selection[]; bounds: SelectionBounds }; moved: boolean } | null>(null);
  const moveFrame = useRef<number | null>(null);
  const queuedMove = useRef<{ latest: MoveSample; openingSamples: MoveSample[] } | null>(null);
  useEffect(() => () => cancelMoveFrame(), []);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const fencedContacts = useRef(new Set<number>());
  const pinch = useRef<{ distance: number; center: Point2; view: PlanViewState } | null>(null);
  const previousFloor = useRef(floor);
  const previousTool = useRef(tool);
  const units = view.width / size.width;
  function updatePoints(next: DrawPoint[], completed = false) {
    pointsRef.current = next; setPoints(next); submittedIDs.current = []; submittedRoom.current = null; submittedOpening.current = null;
    if (completed && (tool === 'wall' || tool === 'area' || tool === 'room')) draftCallback.current?.(next.length ? { tool, points: structuredClone(next) } : null);
  }
  function clearDrawing() { updatePoints([]); setCursor(null); setChoices([]); setChoosingDrawCorner(false); }
  function clearPlacement(forgetIdentity = true) {
    placementRef.current = null; setPlacement(null); setPlacementActive(false);
    if (forgetIdentity) placementIdentity.current = null;
    if (placementChoiceRef.current) setChoices([]);
    placementChoiceRef.current = null; setChoosingPlacement(null);
  }
  function restorePlacement() {
    clearPlacement();
    const last = completedPlacement.current;
    placementRef.current = last; setPlacement(last); placementIdentity.current = last?.opening.id ?? null;
  }
  function cancelMoveFrame() { if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current); moveFrame.current = null; queuedMove.current = null; }
  function clearGesture(finishedPointerID?: number, discardPlacement = false) {
    cancelMoveFrame();
    roomSnapMemory.current = null; wallSnapMemory.current = null;
    const captured = [...pointers.current.keys()];
    for (const id of captured) if (id !== finishedPointerID) fencedContacts.current.add(id);
    pointers.current.clear(); pinch.current = null; gesture.current = null; setPreview(null); setStrokeStart(null); setRoomDragStart(null); setOpeningPreview(null); setOpeningActive(false); setMarquee(null); setGroupPreview(null); setGroupActive(false);
    if (choosingGroup.current) { choosingGroup.current = null; setChoices([]); }
    if (discardPlacement) completedPlacement.current = null;
    restorePlacement();
    spaceHeld.current = false; setSpacePan(false);
    for (const id of captured) if (svg.current?.hasPointerCapture(id)) svg.current.releasePointerCapture(id);
  }
  function discardDrawing() { clearGesture(undefined, true); clearDrawing(); draftCallback.current?.(null); }
  function clearSubmission() { submission.current = null; setSubmitting(false); submittedIDs.current = []; submittedRoom.current = null; submittedOpening.current = null; }
  function submit(commands: EditCommand[]) {
    const attempt = {}; submission.current = attempt; setSubmitting(true);
    const settle = (accepted: boolean | void, cause?: unknown) => {
      if (!mounted.current || submission.current !== attempt) return;
      submission.current = null; setSubmitting(false);
      if (accepted === false) { submittedIDs.current = []; submittedRoom.current = null; submittedOpening.current = null; }
      if (cause) onError(cause instanceof Error ? cause.message : String(cause));
    };
    try { const result = onEdit(commands); if (result) void result.then(value => settle(value), cause => settle(false, cause)); else settle(undefined); }
    catch (cause) { settle(false, cause); }
  }
  const fit = () => {
    cancelMoveFrame(); setCursor(null);
    if (gesture.current || pinch.current) clearGesture();
    const all = [...floor.openings.flatMap(o => openingPlanLines(floor, o).flatMap(line => [line.a, line.b])), ...floor.nodes.map(n => n.point), ...(floor.areas ?? []).flatMap(a => a.polygon)];
    if (!all.length) { setView({ x: -1.5, z: -1.5, width: 11, height: 11 * size.height / size.width }); return; }
    const { minX, maxX, minZ, maxZ } = all.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    const aspect = size.width / size.height, width = Math.max(maxX - minX + 3, (maxZ - minZ + 3) * aspect, 4);
    setView({ x: (minX + maxX - width) / 2, z: (minZ + maxZ - width / aspect) / 2, width, height: width / aspect });
  };
  useEffect(() => { const el = svg.current; if (!el) return; const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (width > 0 && height > 0) { layoutReady.current = true; setSize({ width, height }); } }); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => { if (!layoutReady.current) return; if (gesture.current || pinch.current) clearGesture(); if (!framed.current && !rememberedView) { framed.current = true; fit(); return; } framed.current = true; setView(previous => { const height = previous.width * size.height / size.width; return { ...previous, z: previous.z + (previous.height - height) / 2, height }; }); }, [size.width, size.height]);
  useLayoutEffect(() => {
    if (previousFloor.current === floor) return;
    previousFloor.current = floor;
    const accepted = submittedIDs.current.length > 0 && submittedIDs.current.every(id => floor.walls.some(wall => wall.id === id) || floor.rooms.some(room => room.id === id) || floor.openings.some(opening => opening.id === id) || floor.areas?.some(area => area.id === id));
    const acceptedRoom = accepted ? submittedRoom.current : null;
    const acceptedOpening = accepted ? submittedOpening.current : null;
    const hadDrawing = pointsRef.current.length > 0 || placementRef.current !== null;
    clearGesture(undefined, true); clearDrawing(); clearSubmission();
    // The parent's pending snapshot owns a submitted edit, including a failed durable save.
    // Only leave drawing mode after that canonical snapshot contains this exact transaction.
    if (accepted) { onTool('select'); if (acceptedRoom) onSelect({ floorID: floor.id, kind: 'room', objectID: acceptedRoom }); if (acceptedOpening) onSelect({ floorID: floor.id, kind: 'opening', objectID: acceptedOpening }); }
    else if (hadDrawing) onError('The layout changed. The unfinished drawing is no longer active; any saved recovery remains separate from this revision.');
  }, [floor]);
  useLayoutEffect(() => { if (previousTool.current === tool) return; previousTool.current = tool; clearDrawing(); clearGesture(undefined, true); clearSubmission(); }, [tool]);
  useLayoutEffect(() => { if (previousGroupKey.current === groupKey) return; previousGroupKey.current = groupKey; if (gesture.current?.group || gesture.current?.marquee || choosingGroup.current) clearGesture(); }, [groupKey]);
  useLayoutEffect(() => { if (gesture.current?.opening) clearGesture(); }, [editContext?.documentID, editContext?.floorID, editContext?.revision, editContext?.generation, editContext?.scope, editContext?.view]);
  useEffect(() => { if (gesture.current?.opening && (selection?.kind !== 'opening' || selection.objectID !== gesture.current.opening.original.id)) clearGesture(); }, [selection?.kind, selection?.objectID]);
  useLayoutEffect(() => { if (disabled) { clearGesture(); setCursor(null); } }, [disabled]);
  useEffect(() => {
    const cancel = () => { clearGesture(); setCursor(null); };
    // Reentry starts from fresh pointerdown events. Abandoned contacts cannot
    // resurrect a drag, and a missing terminal event cannot permanently lock input.
    const resume = () => { clearGesture(); fencedContacts.current.clear(); setCursor(null); };
    const visibility = () => { if (document.visibilityState !== 'visible') cancel(); else resume(); };
    const release = (event: globalThis.PointerEvent) => fencedContacts.current.delete(event.pointerId);
    window.addEventListener('blur', cancel); window.addEventListener('focus', resume); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointerup', release, true); window.addEventListener('pointercancel', release, true);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pointerup', release, true); window.removeEventListener('pointercancel', release, true); };
  }, []);
  useEffect(() => { if (!choices.length) return; const active = window.document.activeElement as HTMLElement | null; choiceDialog.current?.showModal(); return () => active?.focus(); }, [!!choices.length]);
  useEffect(() => { if (!hasDrawing) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [hasDrawing]);
  useEffect(() => {
    const element = svg.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current || pinch.current) return;
      const rect = element.getBoundingClientRect();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const factor = Math.exp(Math.max(-0.7, Math.min(0.7, pixels * (event.ctrlKey ? 0.01 : 0.0015))));
      setView(current => zoomAt(current, factor, { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }, rect.height / rect.width));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  const world = (x: number, y: number): Point2 => { const rect = svg.current!.getBoundingClientRect(), current = viewRef.current; return { x: current.x + (x - rect.left) / rect.width * current.width, z: current.z + (y - rect.top) / rect.height * current.height }; };
  const geometryIndex = useMemo(() => new FloorGeometryIndex(floor), [floor]);
  const displayedFloor: Floor = groupPreview?.floor ?? (openingPreview ? { ...floor, openings: floor.openings.map(opening => opening.id === openingPreview.opening.id ? openingPreview.opening : opening) } : preview ? { ...floor, nodes: floor.nodes.map(n => (preview.kind === 'node' ? n.id === preview.id : floor.walls.find(w => w.id === preview.id)?.nodeIDs.includes(n.id)) ? { ...n, point: { x: n.point.x + preview.delta.x, z: n.point.z + preview.delta.z } } : n) } : floor);
  const selectedOpening = selection?.kind === 'opening' ? displayedFloor.openings.find(opening => opening.id === selection.objectID) : undefined;
  const openingHandles = tool === 'select' && selectedOpening ? openingResizeHandles(displayedFloor, selectedOpening, units) : [];
  function candidates(p: Point2): Selection[] {
    const select = (kind: Selection['kind'], id: string): Selection => ({ floorID: floor.id, kind, objectID: id });
    const nearNodes = floor.nodes.filter(n => Math.hypot(n.point.x - p.x, n.point.z - p.z) <= units * 22);
    if (nearNodes.length) return nearNodes.map(n => select('node', n.id));
    const nearOpenings = floor.openings.filter(o => { const wall = floor.walls.find(w => w.id === o.wallID)!; const path = geometryIndex.path(wall); return distanceToPath(p, openingPath(path, o.offset, o.width)) <= units * 22; });
    if (nearOpenings.length) return nearOpenings.map(o => select('opening', o.id));
    const nearWalls = floor.walls.filter(w => distanceToPath(p, geometryIndex.path(w)) <= units * 22);
    if (nearWalls.length) return nearWalls.map(w => select('wall', w.id));
    return [...(floor.areas ?? []).filter(a => pointInPolygon(p, a.polygon)).map(a => select('area', a.id)), ...floor.rooms.filter(r => { try { return pointInPolygon(p, geometryIndex.boundary(r)); } catch { return false; } }).map(r => select('room', r.id))];
  }
  function choose(hits: Selection[]) { setChoosingDrawCorner(false); if (hits.length === 1) { onSelect(hits[0]); setChoices([]); } else if (hits.length > 1) setChoices(hits); else { onSelect(null); setChoices([]); } }
  function hitsSelection(point: Point2, item: Selection): boolean {
    const shape = pointsForSelection(floor, item);
    if (!shape.length) return false;
    if (item.kind === 'node') return Math.hypot(shape[0].x - point.x, shape[0].z - point.z) <= units * 22;
    if (item.kind === 'area' || item.kind === 'room') return pointInPolygon(point, shape);
    return distanceToPath(point, shape) <= units * 22;
  }
  function groupCandidates(point: Point2, kinds: Selection['kind'][]): Selection[] {
    const all: Selection[] = ([['node', floor.nodes], ['wall', floor.walls], ['opening', floor.openings], ['room', floor.rooms], ['area', floor.areas ?? []]] as const).flatMap(([kind, items]) => kinds.includes(kind) ? items.map(item => ({ floorID: floor.id, kind, objectID: item.id })) : []);
    return all.filter(item => hitsSelection(point, item));
  }
  function publishGroup(items: Selection[]) {
    const unique = [...new Map(items.map(item => [selectionKey(item), item])).values()];
    if (onGroupSelection) onGroupSelection(unique); else onError('Group selection is unavailable in this workspace.');
  }
  function chooseGroup(item: Selection, action: { additive: boolean; base: Selection[] }) {
    const key = selectionKey(item), already = action.base.some(value => selectionKey(value) === key);
    publishGroup(action.additive ? already ? action.base.filter(value => selectionKey(value) !== key) : [...action.base, item] : [item]);
  }
  function previewGroup(g: NonNullable<typeof gesture.current>, point: Point2) {
    if (!g.group) return;
    const group = g.group, delta = { x: point.x - g.start.x, z: point.z - g.start.z }, base = group.bounds;
    const bounds = { minX: base.minX + delta.x, minZ: base.minZ + delta.z, maxX: base.maxX + delta.x, maxZ: base.maxZ + delta.z };
    // Frame-limited display only. Canonical admission runs once on release.
    try { setGroupPreview({ bounds, floor: prepareGroupTranslation(group.document, floor.id, group.selected, delta).uncheckedFloor }); }
    catch (cause) { setGroupPreview({ bounds, error: cause instanceof Error ? cause.message : String(cause) }); }
  }
  function placementCandidates(point: Point2): Selection[] {
    return floor.walls.filter(wall => distanceToPath(point, geometryIndex.path(wall)) <= units * 22).map(wall => ({ floorID: floor.id, kind: 'wall', objectID: wall.id }));
  }
  function place(wallID: string, point: Point2, kind = openingKind, completed = false, styleID: OpeningStyleID | null = openingStyle ?? null) {
    if (disabled) return;
    try {
      const id = placementIdentity.current ?? uid(); placementIdentity.current = id;
      let next = previewOpeningPlacement(floor, wallID, kind, point, id, styleID ?? undefined);
      const previous = completedPlacement.current?.opening;
      if (previous && previous.kind === kind && previous.style?.id === (styleID ?? undefined)) {
        const host = floor.walls.find(wall => wall.id === wallID)!;
        const opening = { ...structuredClone(previous), id, wallID, offset: projectToWall(wallPath(floor, host), point) - previous.width / 2 };
        next = { opening, point: { ...point }, error: openingGeometryError(floor, opening) };
      }
      placementRef.current = next; setPlacement(next); submittedIDs.current = []; submittedOpening.current = null; onError('');
      if (completed) { completedPlacement.current = next; draftCallback.current?.({ tool: 'opening', opening: structuredClone(next.opening), point: { ...next.point } }); }
    } catch (cause) { restorePlacement(); onError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function finishPlacement() {
    const draft = placementRef.current;
    if (disabled || pointers.current.size || !draft || draft.error || placementChoiceRef.current || submittedIDs.current.length) return;
    // Recheck against the current canonical floor. A preview never bypasses the
    // core command validator or the parent's durable transaction/save state.
    const checked = checkedPlacement(floor, draft, geometryDocument.schemaVersion);
    if (checked.error) { placementRef.current = checked; setPlacement(checked); return; }
    submittedIDs.current = [checked.opening.id]; submittedOpening.current = checked.opening.id;
    submit([{ type: 'addOpening', floorID: floor.id, opening: checked.opening }]);
  }
  function draw(p: Point2, modifiers: { shift: boolean; alt: boolean }) {
    const snap = drawingSnap(floor, pointsRef.current, p, units, { ...modifiers, enabled: tool === 'area' || roomSnapping, alt: modifiers.alt, cornersOnly: tool === 'area', previous: wallSnapMemory.current }, geometryIndex);
    if (snap.kind === 'ambiguous') { if (snap.corners.length) { setChoosingDrawCorner(true); setChoices(snap.corners.map(n => ({ floorID: floor.id, kind: 'node', objectID: n.nodeID }))); } else onError(snap.message!); return; }
    appendDrawPoint(snap.point);
  }
  function appendDrawPoint(next: Point2 & { nodeID?: string }) {
    const previous = pointsRef.current;
    if (previous.length && Math.hypot(next.x - previous.at(-1)!.x, next.z - previous.at(-1)!.z) < units * SNAP.minimumSegment) { onError('Choose a different corner, or finish the drawing.'); return; }
    if (previous.length >= 1001) { onError('Finish these walls before starting another drawing.'); return; }
    if (tool === 'wall' && previous.length) {
      const start = previous.at(-1)!;
      const duplicateDraft = previous.some((point, index) => index > 0 && overlappingSpan(start, next, previous[index - 1], point));
      const duplicateSaved = floor.walls.some(wall => { const path = geometryIndex.path(wall); return path.some((point, index) => index > 0 && overlappingSpan(start, next, path[index - 1], point)); });
      if (duplicateDraft || duplicateSaved) { onError('A wall already follows those corners. Choose another corner, use Back, or finish this drawing.'); return; }
    }
    onError('');
    updatePoints([...previous, { ...next, nodeID: next.nodeID ?? uid() }], true);
    wallSnapMemory.current = null;
    setCursor(null);
  }
  function finishDrawing() {
    if (disabled || pointers.current.size || submittedIDs.current.length) return;
    const draft = pointsRef.current;
    if (tool === 'room') {
      if (draft.length !== 2) return;
      try {
        const result = rectangleRoomCommands(floor, draft[0], draft[1], geometryDocument.schemaVersion);
        submittedIDs.current = result.submittedIDs; submittedRoom.current = result.roomID;
        submit(result.commands);
      } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
    } else if (tool === 'area') {
      if (draft.length < 3) return;
      const id = uid(); submittedIDs.current = [id];
      submit([{ type: 'setArea', floorID: floor.id, area: { id, label: 'New area', polygon: draft.map(p => ({ x: p.x, z: p.z })), provenance: editedProvenance() } }]);
    } else if (tool === 'wall' && draft.length > 1) {
      try { const result = wallDrawingCommands(floor, draft, geometryDocument.schemaVersion); submittedIDs.current = result.submittedIDs; submit(result.commands); }
      catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
    }
  }
  function onKey(event: KeyboardEvent<SVGSVGElement>) {
    if (disabled) { if (event.key === 'Escape' || event.key === 'Enter' || event.key === 'Backspace') event.preventDefault(); return; }
    if (event.key === 'Escape') { event.preventDefault(); if (tool === 'marquee' || groupSelection.length || gesture.current?.group || gesture.current?.marquee) { clearGesture(); setCursor(null); onError(''); return; } discardDrawing(); onTool('select'); }
    if (disabled) return;
    if (event.code === 'Space') { event.preventDefault(); spaceHeld.current = true; setSpacePan(true); setCursor(null); return; }
    if (event.key === 'Backspace' && placementRef.current) { event.preventDefault(); discardDrawing(); }
    if (event.key === 'Backspace' && pointsRef.current.length) { event.preventDefault(); clearGesture(); updatePoints(pointsRef.current.slice(0, -1), true); setCursor(null); }
    if (event.key === 'Enter' && tool === 'opening') { event.preventDefault(); finishPlacement(); }
    if (event.key === 'Enter' && pointsRef.current.length) { event.preventDefault(); finishDrawing(); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(0.8); }
    if (event.key === '-') { event.preventDefault(); zoom(1.25); }
    if (cursor && (event.key === 'Shift' || event.key === 'Alt')) setCursor({ ...cursor, shift: event.shiftKey, alt: event.altKey });
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    const middleMouse = event.pointerType === 'mouse' && event.button === 1;
    if (event.button !== 0 && !middleMouse) return;
    cancelMoveFrame();
    if (disabled || fencedContacts.current.size) { fencedContacts.current.add(event.pointerId); return; }
    event.currentTarget.focus({ preventScroll: true });
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) { roomSnapMemory.current = null; wallSnapMemory.current = null; const [a, b] = [...pointers.current.values()]; pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), center: world((a.x + b.x) / 2, (a.y + b.y) / 2), view }; gesture.current = null; cancelMoveFrame(); setPreview(null); setCursor(null); setStrokeStart(null); setRoomDragStart(null); setOpeningPreview(null); setOpeningActive(false); setMarquee(null); setGroupPreview(null); setGroupActive(false); restorePlacement(); return; }
    if (pointers.current.size !== 1) return;
    const temporaryPan = event.pointerType === 'mouse' && (middleMouse || spaceHeld.current);
    if (temporaryPan) event.preventDefault();
    const p = world(event.clientX, event.clientY);
    const touchedGroup = groupSelection.length > 0 && groupSelection.some(item => hitsSelection(p, item));
    if (!temporaryPan && (tool === 'marquee' || tool === 'select' && (event.shiftKey || touchedGroup))) {
      const additive = event.shiftKey || tool === 'marquee' && addToGroup;
      const base = groupSelection.length ? groupSelection : selection ? [selection] : [];
      const bounds = boundsForSelection(floor, groupSelection);
      const dragGroup = !additive && bounds && touchedGroup;
      const kinds = tool === 'marquee' ? groupKinds(groupFilter) : ['wall', 'node', 'room', 'area', 'opening'] as Selection['kind'][];
      gesture.current = { pointerID: event.pointerId, start: p, clientX: event.clientX, clientY: event.clientY, view, hits: [], pan: false, moved: false, ...(dragGroup ? { group: { document: geometryDocument, selected: structuredClone(groupSelection), bounds } } : { marquee: { additive, base: structuredClone(base), kinds } }) };
      setGroupActive(true); setMarquee(null); setGroupPreview(null); onError(''); return;
    }
    if (tool === 'opening' && !temporaryPan) {
      const hits = placementCandidates(p);
      const placementWallID = hits.length === 1 ? hits[0].objectID : undefined;
      gesture.current = { pointerID: event.pointerId, start: p, clientX: event.clientX, clientY: event.clientY, view, hits, pan: false, moved: false, placementWallID };
      // Every tap begins a new intentional target choice. A saved draft cannot
      // remain finishable while an ambiguous or empty target is being chosen.
      clearPlacement(false); setPlacementActive(true);
      if (placementWallID) place(placementWallID, p);
      return;
    }
    const handle = !temporaryPan ? openingHandles.find(item => Math.hypot(item.center.x - p.x, item.center.z - p.z) <= units * 22) : undefined;
    const selectedBody = tool === 'select' && !temporaryPan && selectedOpening && distanceToPath(p, openingPath(wallPath(floor, floor.walls.find(wall => wall.id === selectedOpening.wallID)!), selectedOpening.offset, selectedOpening.width)) <= units * 22;
    const hits: Selection[] = (handle || selectedBody) && selectedOpening ? [{ floorID: floor.id, kind: 'opening', objectID: selectedOpening.id }] : tool === 'select' && !temporaryPan ? candidates(p) : [];
    const direct = hits.length === 1 && (hits[0].kind === 'wall' || hits[0].kind === 'node' || hits[0].kind === 'opening') && (event.pointerType === 'mouse' || hits[0].kind === selection?.kind && hits[0].objectID === selection?.objectID) ? hits[0] : undefined;
    if (direct) onSelect(direct);
    let opening: OpeningDrag | undefined;
    if (direct?.kind === 'opening') {
      const original = floor.openings.find(item => item.id === direct.objectID);
      if (original) try { opening = beginOpeningDrag(floor, original, handle?.mode ?? 'move', p); }
      catch (cause) { clearGesture(); onError(cause instanceof Error ? cause.message : String(cause)); return; }
    }
    const initialRoomSnap = tool === 'room' && !temporaryPan && !pointsRef.current.length ? roomSnap(floor, p, units, { enabled: roomSnapping, alt: event.altKey }, geometryIndex) : undefined;
    if (initialRoomSnap?.kind === 'ambiguous') {
      gesture.current = { pointerID: event.pointerId, start: p, clientX: event.clientX, clientY: event.clientY, view, hits: [], pan: false, moved: false, roomBlocked: true };
      setCursor({ point: p, shift: event.shiftKey, alt: event.altKey }); onError(initialRoomSnap.message!); return;
    }
    const wallStart = tool === 'wall' && !temporaryPan && !pointsRef.current.length
      ? drawingSnap(floor, [], p, units, { shift: event.shiftKey, alt: event.altKey, enabled: roomSnapping }, geometryIndex) : undefined;
    if (wallStart?.kind === 'ambiguous') {
      gesture.current = { pointerID: event.pointerId, start: p, clientX: event.clientX, clientY: event.clientY, view, hits: [], pan: false, moved: false, roomBlocked: true };
      draw(p, { shift: event.shiftKey, alt: event.altKey }); return;
    }
    const wallStroke = tool === 'wall' && !temporaryPan ? pointsRef.current.at(-1) ?? wallStart!.point : undefined;
    const handles = tool === 'room' && !temporaryPan && pointsRef.current.length === 2
      ? pointsRef.current.map((point, i) => ({ i: i as 0 | 1, distance: Math.hypot(point.x - p.x, point.z - p.z) })).filter(item => item.distance <= units * 22).sort((a, b) => a.distance - b.distance) : [];
    const roomHandle = handles[0]?.i;
    const movingRoomPoint = roomHandle === undefined ? undefined : pointsRef.current[roomHandle];
    const roomOffset = movingRoomPoint ? { x: movingRoomPoint.x - p.x, z: movingRoomPoint.z - p.z } : undefined;
    const roomAnchor = tool === 'room' && !temporaryPan ? roomHandle === 0 ? pointsRef.current[1] : pointsRef.current[0] ?? initialRoomSnap!.point : undefined;
    gesture.current = { pointerID: event.pointerId, start: p, clientX: event.clientX, clientY: event.clientY, view, hits, pan: temporaryPan || tool === 'pan', moved: false, drag: opening ? undefined : direct, opening, fence: opening && editContext ? { ...editContext, openingID: opening.original.id } : undefined, roomAnchor, roomHandle, roomOffset, wallStroke };
    roomSnapMemory.current = null; wallSnapMemory.current = null;
    if (opening) { setOpeningActive(true); setOpeningPreview({ opening: opening.original }); }
    if (roomAnchor) { setRoomDragStart(roomAnchor); setCursor({ point: movingRoomPoint ?? p, shift: event.shiftKey, alt: event.altKey }); onError(''); }
  }
  function sampleOf(event: MoveSample): MoveSample { return { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey, altKey: event.altKey }; }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (disabledRef.current || fencedContacts.current.has(event.pointerId)) return;
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const latest = sampleOf(coalesced.at(-1) ?? event);
    const pending = queuedMove.current ?? { latest, openingSamples: [] };
    pending.latest = latest;
    // Opening hosts track travel through bends. Keep their sample sequence,
    // while updating React only once in the display frame.
    if (gesture.current?.opening) pending.openingSamples.push(...(coalesced.length ? coalesced.map(sampleOf) : [latest]));
    queuedMove.current = pending;
    if (moveFrame.current !== null) return;
    moveFrame.current = requestAnimationFrame(() => {
      moveFrame.current = null;
      const next = queuedMove.current; queuedMove.current = null;
      if (next && mounted.current && !disabledRef.current) processMove(next.latest, next.openingSamples);
    });
  }
  function processMove(event: MoveSample, openingSamples: MoveSample[] = []) {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current) {
      if (pointers.current.size !== 2) return;
      const [a, b] = [...pointers.current.values()], start = pinch.current, distance = Math.hypot(a.x - b.x, a.y - b.y); if (distance < 1 || start.distance < 1) return;
      const width = Math.min(40000, Math.max(.25, start.view.width * start.distance / distance)), height = width * size.height / size.width, rect = svg.current!.getBoundingClientRect();
      setView({ x: start.center.x - ((a.x + b.x) / 2 - rect.left) / rect.width * width, z: start.center.z - ((a.y + b.y) / 2 - rect.top) / rect.height * height, width, height }); return;
    }
    if (disabledRef.current) return;
    const g = gesture.current;
    const rawPoint = world(event.clientX, event.clientY);
    const cursorPoint = g?.roomOffset ? { x: rawPoint.x + g.roomOffset.x, z: rawPoint.z + g.roomOffset.z } : rawPoint;
    if ((tool === 'wall' || tool === 'area' || tool === 'room') && !g?.pan && !spaceHeld.current) {
      if (tool === 'room') roomSnapMemory.current = roomSnap(floor, cursorPoint, units, { enabled: roomSnapping, alt: event.altKey, anchor: g?.roomAnchor ?? pointsRef.current[0], previous: roomSnapMemory.current }, geometryIndex);
      else wallSnapMemory.current = drawingSnap(floor, pointsRef.current.length ? pointsRef.current : g?.wallStroke ? [{ ...g.wallStroke, nodeID: g.wallStroke.nodeID ?? 'stroke-preview' }] : [], cursorPoint, units, { enabled: tool === 'area' || roomSnapping, shift: event.shiftKey, alt: event.altKey, cornersOnly: tool === 'area', previous: wallSnapMemory.current }, geometryIndex);
      setCursor({ point: cursorPoint, shift: event.shiftKey, alt: event.altKey });
    }
    if (!g || g.pointerID !== event.pointerId) return;
    if (Math.hypot(event.clientX - g.clientX, event.clientY - g.clientY) < (g.roomAnchor || g.wallStroke ? SNAP.dragThreshold : 5) && !g.moved) return;
    g.moved = true;
    if (g.wallStroke && !pointsRef.current.length) setStrokeStart(g.wallStroke);
    const dx = (event.clientX - g.clientX) * g.view.width / size.width, dz = (event.clientY - g.clientY) * g.view.height / size.height;
    if (g.group) previewGroup(g, { x: g.start.x + dx, z: g.start.z + dz });
    else if (g.marquee) setMarquee(boundsBetween(g.start, { x: g.start.x + dx, z: g.start.z + dz }));
    else if (g.placementWallID) place(g.placementWallID, world(event.clientX, event.clientY));
    else if (g.opening) {
      for (const sample of openingSamples) if (sample.pointerId === g.pointerID) openingDragPreview(floor, g.opening, world(sample.clientX, sample.clientY));
      setOpeningPreview(openingDragPreview(floor, g.opening, world(event.clientX, event.clientY)));
    }
    else if (g.drag) setPreview({ kind: g.drag.kind as 'node' | 'wall', id: g.drag.objectID, delta: { x: dx, z: dz } });
    else if (g.pan || tool === 'select' && g.hits.length === 0) setView({ ...g.view, x: g.view.x - dx, z: g.view.z - dz });
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    const pendingMove = queuedMove.current;
    cancelMoveFrame();
    // Release is authoritative, including a release before the next paint.
    if (!disabledRef.current && (gesture.current?.pointerID === event.pointerId || pinch.current)) processMove(sampleOf(event), pendingMove?.openingSamples ?? []);
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pinch.current) { if (!pointers.current.size) pinch.current = null; gesture.current = null; return; }
    const g = gesture.current; if (!g || g.pointerID !== event.pointerId) return; gesture.current = null;
    if (disabled) { setPreview(null); setStrokeStart(null); setRoomDragStart(null); setOpeningPreview(null); setOpeningActive(false); setMarquee(null); setGroupPreview(null); setGroupActive(false); restorePlacement(); return; }
    if (g.pan) { setCursor(null); return; }
    if (g.group || g.marquee) {
      cancelMoveFrame();
      setGroupActive(false); setGroupPreview(null); setMarquee(null);
      const point = { x: g.start.x + (event.clientX - g.clientX) * g.view.width / size.width, z: g.start.z + (event.clientY - g.clientY) * g.view.height / size.height };
      if (g.group) {
        if (!g.moved) return;
        try { const result = groupTranslation(g.group.document, floor.id, g.group.selected, { x: point.x - g.start.x, z: point.z - g.start.z }); submit(result.commands); }
        catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
      } else if (g.marquee) {
        if (g.moved) { const contained = containedSelections(floor, boundsBetween(g.start, point), g.marquee.kinds); publishGroup(g.marquee.additive ? [...g.marquee.base, ...contained] : contained); }
        else {
          const hits = tool === 'select' ? candidates(point) : groupCandidates(point, g.marquee.kinds);
          if (hits.length === 1) chooseGroup(hits[0], g.marquee);
          else if (hits.length > 1) { choosingGroup.current = g.marquee; setChoosingDrawCorner(false); setChoices(hits); }
          else if (!g.marquee.additive) publishGroup([]);
        }
      }
      return;
    }
    if (g.roomBlocked) return;
    if (g.wallStroke && g.moved) {
      setStrokeStart(null);
      const terminalSnap = wallSnapMemory.current;
      if (!pointsRef.current.length) appendDrawPoint(g.wallStroke);
      wallSnapMemory.current = terminalSnap;
      if (pointsRef.current.length) draw(world(event.clientX, event.clientY), { shift: event.shiftKey, alt: event.altKey });
      setCursor(null); return;
    }
    if (tool === 'opening') {
      setPlacementActive(false);
      if (g.placementWallID) place(g.placementWallID, world(event.clientX, event.clientY), openingKind, true);
      else if (g.hits.length > 1) { placementChoiceRef.current = g.start; setChoosingPlacement(g.start); setChoosingDrawCorner(false); setChoices(g.hits); }
      else { restorePlacement(); onError('Choose a saved wall for the opening. Draw walls first if the layout is empty.'); }
      return;
    }
    if (g.roomAnchor) {
      if (g.roomHandle !== undefined && !g.moved) { setRoomDragStart(null); setCursor(null); return; }
      const first = { ...g.roomAnchor, nodeID: g.roomAnchor.nodeID ?? uid() };
      if (g.moved || pointsRef.current.length) {
        const raw = world(event.clientX, event.clientY), p = { x: raw.x + (g.roomOffset?.x ?? 0), z: raw.z + (g.roomOffset?.z ?? 0) };
        const snapped = roomSnap(floor, p, units, { enabled: roomSnapping, alt: event.altKey, anchor: first, previous: roomSnapMemory.current }, geometryIndex);
        if (snapped.kind === 'ambiguous') { if (!pointsRef.current.length) updatePoints([first], true); setRoomDragStart(null); setCursor({ point: p, shift: event.shiftKey, alt: event.altKey }); onError(snapped.message!); return; }
        const opposite = { ...snapped.point, nodeID: snapped.point.nodeID ?? uid() };
        updatePoints(g.roomHandle === 0 ? [opposite, first] : [first, opposite], true);
      } else updatePoints([first], true);
      setRoomDragStart(null); setCursor(null); onError(''); return;
    }
    if (g.opening) {
      setOpeningPreview(null); setOpeningActive(false);
      if (!g.moved) return;
      const result = openingDragPreview(floor, g.opening, world(event.clientX, event.clientY));
      if (result.error) { onError(result.error); return; }
      const original = g.opening.original, changed = result.opening;
      if (Math.abs(original.offset - changed.offset) < 1e-6 && Math.abs(original.width - changed.width) < 1e-6) return;
      onEdit(g.opening.mode === 'move' ? [{ type: 'moveOpening', floorID: floor.id, openingID: original.id, offset: changed.offset }] : [{ type: 'updateOpening', floorID: floor.id, opening: changed }], g.fence);
      return;
    }
    if (g.drag && g.moved) {
      const delta = { x: (event.clientX - g.clientX) * g.view.width / size.width, z: (event.clientY - g.clientY) * g.view.height / size.height };
      if (g.drag.kind === 'node') { const node = floor.nodes.find(n => n.id === g.drag!.objectID); if (node) onEdit([{ type: 'moveNode', floorID: floor.id, nodeID: node.id, point: { x: node.point.x + delta.x, z: node.point.z + delta.z } }]); }
      else onEdit([{ type: 'moveWall', floorID: floor.id, wallID: g.drag.objectID, translation: delta }]);
      setPreview(null);
    } else if (tool === 'select' && g.hits.length > 1) choose(g.hits);
    else if (!g.moved) { const p = world(event.clientX, event.clientY); if (tool === 'wall' || tool === 'area') draw(p, { shift: event.shiftKey, alt: event.altKey }); else if (tool === 'select') choose(candidates(p)); }
  }
  const hoverPoints = points.length ? points : strokeStart ? [{ ...strokeStart, nodeID: strokeStart.nodeID ?? 'stroke-preview' }] : points;
  const hover = cursor && !choices.length && (tool === 'wall' || tool === 'area') ? drawingSnap(floor, hoverPoints, cursor.point, units, { enabled: tool === 'area' || roomSnapping, shift: cursor.shift, alt: cursor.alt, cornersOnly: tool === 'area', previous: wallSnapMemory.current }, geometryIndex) : null;
  const roomAnchor = roomDragStart ?? points[0];
  const roomHover = cursor && tool === 'room' && !spacePan ? roomSnap(floor, cursor.point, units, { enabled: roomSnapping, alt: cursor.alt, anchor: roomAnchor, previous: roomSnapMemory.current }, geometryIndex) : null;
  const roomOpposite = roomDragStart ? roomHover?.kind === 'ambiguous' ? undefined : roomHover?.point : points[1] ?? (roomHover?.kind === 'ambiguous' ? undefined : roomHover?.point);
  const roomPreview = tool === 'room' && roomAnchor && roomOpposite ? rectangleCorners(roomAnchor, roomOpposite) : null;
  const path = (ps: Point2[]) => ps.map(p => `${p.x},${p.z}`).join(' ');
  const zoom = (factor: number) => { cancelMoveFrame(); setCursor(null); if (gesture.current || pinch.current) clearGesture(); setView(v => zoomAt(v, factor, { x: 0.5, y: 0.5 }, size.height / size.width)); };
  return <div className="spatial-plan">
    <svg ref={svg} viewBox={`${view.x} ${view.z} ${view.width} ${view.height}`} preserveAspectRatio="none" role="img" aria-label="Editable floor plan. Choose an object from the Objects panel for keyboard editing." tabIndex={0}
      aria-describedby="spatial-plan-instructions" style={{ cursor: gesture.current?.pan ? 'grabbing' : spacePan ? 'grab' : undefined }} onKeyDown={onKey} onKeyUp={event => { if (event.code === 'Space') { event.preventDefault(); spaceHeld.current = false; setSpacePan(false); } if (cursor && (event.key === 'Shift' || event.key === 'Alt')) setCursor({ ...cursor, shift: event.shiftKey, alt: event.altKey }); }}
      onBlur={() => { spaceHeld.current = false; setSpacePan(false); if (gesture.current || pinch.current) clearGesture(); }}
      onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerLeave={() => { if (!gesture.current) { cancelMoveFrame(); setCursor(null); } }}
      onLostPointerCapture={event => { if (gesture.current?.pointerID === event.pointerId || pinch.current && pointers.current.has(event.pointerId)) { clearGesture(); setCursor(null); } }}
      onPointerCancel={event => { clearGesture(event.pointerId); setCursor(null); }}>
      <title>Drag to size a room or draw a wall, or tap corners. Drag either room draft corner to resize. Enter finishes, Backspace removes the last point, Escape cancels. Shift aligns walls; Alt places freely. Hold Space or middle-drag to pan.</title>
      <PlanGeometry floor={displayedFloor} selection={selection} groupSelection={groupSelection} units={units} fills={fills} openingPreview={openingPreview} />
      {placement && (() => {
        const host = floor.walls.find(wall => wall.id === placement.opening.wallID);
        if (!host) return null;
        const shape = openingPath(wallPath(floor, host), placement.opening.offset, placement.opening.width);
        const color = placement.error ? '#a25738' : '#167bab';
        return <g data-opening-placement={placement.error ? 'invalid' : 'valid'} data-placement-wall={host.id} data-placement-id={placement.opening.id} pointerEvents="none" aria-hidden="true">
          <polyline points={path(shape)} fill="none" stroke="#f8fafb" strokeWidth={units * 9} />
          <polyline points={path(shape)} fill="none" stroke={color} strokeWidth={units * 4} strokeDasharray={`${units * 5} ${units * 3}`} />
          {[shape[0], shape.at(-1)!].map((point, index) => <circle key={index} cx={point.x} cy={point.z} r={units * 5} fill="white" stroke={color} strokeWidth={units * 2} />)}
        </g>;
      })()}
      {!!openingHandles.length && <g data-opening-handles="true" pointerEvents="none" aria-hidden="true">{openingHandles.map(handle => <g key={handle.mode}>
        <line x1={handle.anchor.x} y1={handle.anchor.z} x2={handle.center.x} y2={handle.center.z} stroke="#7c9eb1" strokeWidth={units} />
        <circle data-opening-handle={handle.mode} cx={handle.center.x} cy={handle.center.z} r={units * 22} fill="transparent" />
        <circle cx={handle.center.x} cy={handle.center.z} r={units * 8} fill="white" stroke={openingPreview?.error ? '#a25738' : '#167bab'} strokeWidth={units * 2} />
        <path d={`M ${handle.center.x - units * 3} ${handle.center.z} H ${handle.center.x + units * 3}`} stroke="#167bab" strokeWidth={units * 2} />
      </g>)}</g>}
      {tool !== 'room' && points.length > 0 && <g data-drawing-draft="true"><polyline points={path(points)} fill={tool === 'area' ? '#7bb4dc33' : 'none'} stroke="#167bab" strokeWidth={units * 2} strokeDasharray={`${units * 5} ${units * 4}`} />{points.map((p, i) => <circle key={i} cx={p.x} cy={p.z} r={units * 5} fill="#177aac" />)}</g>}
      {tool === 'room' && hasDrawing && <g data-drawing-draft="true" data-room-draft="true" pointerEvents="none">
        {roomPreview && <polygon data-room-preview="true" points={path(roomPreview)} fill="none" stroke="#167bab" strokeWidth={units * 2} strokeDasharray={`${units * 5} ${units * 4}`} />}
        {points.map((point, i) => { const shown = gesture.current?.roomHandle === i && roomHover && roomHover.kind !== 'ambiguous' ? roomHover.point : point; return <circle key={i} data-room-handle={i} cx={shown.x} cy={shown.z} r={units * 7} fill="white" stroke="#177aac" strokeWidth={units * 2} />; })}
      </g>}
      {roomHover && <g data-room-snap={roomHover.kind} pointerEvents="none" aria-hidden="true">
        {roomHover.guides.map((guide, index) => <line key={index} data-room-snap-guide="true" x1={guide.from.x} y1={guide.from.z} x2={guide.to.x} y2={guide.to.z} stroke="#7dacc5" strokeWidth={units} strokeDasharray={`${units * 5} ${units * 4}`} />)}
        <circle cx={roomHover.point.x} cy={roomHover.point.z} r={units * 9} fill={roomHover.kind === 'corner' || roomHover.kind === 'boundary' ? '#cce7f6' : 'white'} stroke={roomHover.kind === 'ambiguous' ? '#a76a22' : '#167bab'} strokeWidth={units * 2} />
        {roomHover.kind !== 'free' && <text x={roomHover.point.x + units * 15} y={roomHover.point.z - units * 14} fontSize={units * 12} fill="#315f79" stroke="#f8fafb" strokeWidth={units * 4} paintOrder="stroke">{roomHover.kind === 'corner' ? 'Corner snap' : roomHover.kind === 'boundary' ? 'Boundary snap' : roomHover.kind === 'alignment' ? 'Boundary alignment' : 'Ambiguous target'}</text>}
      </g>}
      {hover && <g pointerEvents="none" data-drawing-preview={hover.kind}>
        {hoverPoints.length > 0 && <polyline data-rubber-band="true" points={path([hoverPoints.at(-1)!, hover.point])} fill="none" stroke={hover.kind === 'ambiguous' ? '#a76a22' : '#167bab'} strokeWidth={units * 2} strokeDasharray={`${units * 5} ${units * 4}`} />}
        <circle cx={hover.point.x} cy={hover.point.z} r={units * 9} fill={hover.kind === 'corner' ? '#cce7f6' : 'white'} stroke={hover.kind === 'ambiguous' ? '#a76a22' : '#167bab'} strokeWidth={units * 2} />
        {hover.kind !== 'free' && <text x={hover.point.x + units * 15} y={hover.point.z - units * 14} fontSize={units * 12} fill="#315f79" stroke="#f8fafb" strokeWidth={units * 4} paintOrder="stroke">{hover.kind === 'corner' ? 'Corner snap' : hover.kind === 'boundary' ? 'Wall snap' : hover.kind === 'ambiguous' ? 'Choose target' : hover.kind === 'horizontal' ? 'Horizontal' : 'Vertical'}</text>}
      </g>}
      {marquee && <rect data-group-marquee="true" x={marquee.minX} y={marquee.minZ} width={marquee.maxX - marquee.minX} height={marquee.maxZ - marquee.minZ} fill="#a7d2ed22" stroke="#167bab" strokeWidth={units * 1.5} strokeDasharray={`${units * 5} ${units * 3}`} pointerEvents="none" />}
      {groupPreview && <rect data-group-preview={groupPreview.error ? 'invalid' : 'unchecked'} x={groupPreview.bounds.minX - units * 6} y={groupPreview.bounds.minZ - units * 6} width={groupPreview.bounds.maxX - groupPreview.bounds.minX + units * 12} height={groupPreview.bounds.maxZ - groupPreview.bounds.minZ + units * 12} fill="none" stroke={groupPreview.error ? '#a25738' : '#b08032'} strokeWidth={units * 2} strokeDasharray={`${units * 5} ${units * 3}`} pointerEvents="none" />}
    </svg>
    <div id="spatial-plan-instructions" className="spatial-canvas-note" role={tool === 'opening' || tool === 'room' || tool === 'marquee' ? 'status' : undefined}>{tool === 'marquee' || groupSelection.length ? groupPreview?.error ?? (groupPreview ? 'Unchecked group preview. Release to validate and save. Shared corners adjust connected geometry. Escape cancels.' : groupSelection.length ? 'Drag a selected object to move the group. Add to group or Shift adds objects; a box selects fully enclosed objects.' : 'Drag a box around objects, or tap an object. Add to group or Shift adds to the selection.') : tool === 'opening' ? placement?.error ?? (placement ? 'Opening draft. Tap or drag along a wall to reposition, then Finish opening. Starter shape, not measured.' : 'Choose a type, then tap or drag on a saved wall. Finish opening saves the cutout.') : tool === 'room' ? roomHover?.message ?? (points.length === 2 ? 'Drag either corner to resize, or tap to set the opposite corner. Finish room saves the draft.' : points.length ? 'Choose the opposite corner. Boundary guides align the shared span; Finish room saves it.' : roomSnapping ? 'Drag or tap two corners. Start on a saved corner or boundary to connect an adjoining room. Alt places freely.' : 'Free placement. Drag or tap two opposite corners. Existing contacts still require compatible geometry.') : tool === 'wall' ? points.length ? `${points.length - 1} wall${points.length === 2 ? '' : 's'} in draft. Add corners, then Finish walls. Back removes the last point.` : 'Drag to draw a wall, or tap corners. Nearby corners and walls connect. Pull away to place freely.' : tool === 'area' ? 'Choose at least three points, then Finish area. Back removes the last point.' : openingPreview ? openingPreview.error ?? 'Release to save the opening. Escape cancels.' : preview ? 'Release to save this correction' : selectedOpening ? 'Drag the opening to move it. Drag either handle to resize. Details has keyboard controls.' : 'Drag a wall or corner to correct. Drag empty space to pan. Scroll to zoom at the pointer.'}</div>
    <div className="spatial-view-controls">{(tool === 'room' || tool === 'wall') && <button disabled={disabled} style={{ fontSize: 'calc(12px * var(--spatial-text-scale, 1))' }} aria-label={tool === 'room' ? 'Snap room corners and boundaries' : 'Snap wall corners and boundaries'} aria-pressed={roomSnapping} title="Corner and boundary snapping. Hold Alt for free placement." onClick={() => { clearGesture(); setRoomSnapping(!roomSnapping); setCursor(null); svg.current?.focus(); }}>{roomSnapping ? 'Snaps on' : 'Snaps off'}</button>}<button aria-label="Light blue fills" aria-pressed={fills} onClick={() => setFills(!fills)}>▱</button><button aria-label="Zoom in" onClick={() => zoom(0.8)}>+</button><button aria-label="Zoom out" onClick={() => zoom(1.25)}>−</button><button onClick={fit}>Fit</button></div>
    {tool === 'marquee' && <div className="spatial-group-canvas-controls" style={{ position: 'absolute', left: 15, right: 15, bottom: 74, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 'calc(11px * var(--spatial-text-scale, 1))' }}>
      <select aria-label="Group object type" value={groupFilter} disabled={disabled} style={{ width: 'auto', maxWidth: '100%' }} onChange={event => { clearGesture(); setGroupFilter(event.target.value as GroupFilter); onError(''); }}>
        <option value="wallsAndAreas">Walls and areas</option><option value="wall">Walls</option><option value="node">Corners</option><option value="room">Rooms</option><option value="area">Areas</option><option value="opening">Openings</option><option value="all">All objects</option>
      </select>
      <button aria-label="Add to group" aria-pressed={addToGroup} disabled={disabled} onClick={() => { clearGesture(); setAddToGroup(!addToGroup); onError(''); svg.current?.focus(); }}>{addToGroup ? 'Add: on' : 'Add: off'}</button>
      {groupActive && <button onClick={() => { clearGesture(); onError(''); svg.current?.focus(); }}>Cancel group gesture</button>}
    </div>}
    {openingActive && <div className="spatial-drawing-actions" style={{ bottom: 74 }}><button onClick={() => { clearGesture(); svg.current?.focus(); }}>Cancel opening edit</button></div>}
    {tool === 'opening' && <div className="spatial-opening-placement-actions">
      <select aria-label="New opening type" value={openingStyle ?? `generic_${openingKind}`} disabled={disabled || placementActive || choosingPlacement !== null} onChange={event => {
        const preset = openingPreset(event.target.value), kind = preset?.kind ?? event.target.value.replace('generic_', '') as OpeningKind;
        setOpeningKind(kind); setOpeningStyle(preset?.id);
        const current = placementRef.current; if (current) place(current.opening.wallID, current.point, kind, true, preset?.id ?? null);
      }}><optgroup label="Opening catalog">{OPENING_CATALOG.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</optgroup><optgroup label="Unspecified style"><option value="generic_door">Generic door</option><option value="generic_window">Generic window</option><option value="generic_passage">Generic passage</option></optgroup></select>
      <button disabled={disabled || placementActive || !placement || !!placement.error || choosingPlacement !== null} onClick={finishPlacement}>Finish opening</button>
      <button disabled={disabled} onClick={() => { discardDrawing(); onTool('select'); onError(''); svg.current?.focus(); }}>Cancel opening</button>
    </div>}
    {(points.length > 0 || tool === 'room') && <div className="spatial-drawing-actions" style={{ bottom: 74, right: 15, flexWrap: 'wrap', ...(tool === 'room' ? { fontSize: 'calc(12px * var(--spatial-text-scale, 1))' } : {}) }}>
      <button disabled={disabled || roomDragStart !== null || points.length < (tool === 'area' ? 3 : 2)} title="Finish drawing (Enter)" onClick={finishDrawing}>{tool === 'room' ? 'Finish room' : tool === 'area' ? 'Finish area' : 'Finish walls'}</button>
      <button disabled={disabled || !points.length} aria-label="Remove last drawing point" title="Remove last point (Backspace)" onClick={() => { clearGesture(); updatePoints(pointsRef.current.slice(0, -1), true); setCursor(null); svg.current?.focus(); }}>Back</button>
      <button disabled={disabled} aria-label="Cancel drawing" title="Cancel drawing (Escape)" onClick={() => { discardDrawing(); svg.current?.focus(); }}>{tool === 'room' ? 'Cancel' : 'Cancel drawing'}</button>
    </div>}
    {!!choices.length && <dialog ref={choiceDialog} className="spatial-pick-dialog" aria-label="Choose overlapping object" onCancel={event => { event.preventDefault(); setChoices([]); setChoosingDrawCorner(false); choosingGroup.current = null; restorePlacement(); }}>
      <strong>Choose an object</strong>
      <p>{choosingGroup.current ? 'Choose the exact object to include or remove from the group.' : choosingPlacement ? 'Choose the wall that owns this opening. No wall connection will be inferred.' : choosingDrawCorner ? 'Choose the explicit corner connection for this drawing.' : 'These objects overlap at this point.'}</p>
      {choices.map(choice => <button key={`${choice.kind}-${choice.objectID}`} disabled={disabled} onClick={() => {
        const groupAction = choosingGroup.current;
        if (groupAction) { choosingGroup.current = null; chooseGroup(choice, groupAction); }
        else if (placementChoiceRef.current) { place(choice.objectID, placementChoiceRef.current, openingKind, true); placementChoiceRef.current = null; setChoosingPlacement(null); }
        else if (choosingDrawCorner) { const node = floor.nodes.find(n => n.id === choice.objectID), draft = pointsRef.current.find(point => point.nodeID === choice.objectID); if (node) appendDrawPoint({ ...node.point, nodeID: node.id }); else if (draft) appendDrawPoint(draft); setChoosingDrawCorner(false); }
        else onSelect(choice);
        setChoices([]);
      }}>{choosingDrawCorner && !floor.nodes.some(node => node.id === choice.objectID) ? `Draft corner ${points.findIndex(point => point.nodeID === choice.objectID) + 1}` : objectLabel(floor, choice)} <span>{choice.kind}</span></button>)}
      <button onClick={() => { setChoices([]); setChoosingDrawCorner(false); choosingGroup.current = null; restorePlacement(); }}>Cancel</button>
    </dialog>}
  </div>;
}
