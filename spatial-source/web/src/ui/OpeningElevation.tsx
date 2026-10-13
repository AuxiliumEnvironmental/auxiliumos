import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { EditCommand, Floor, Opening, OpeningEditFence } from '../types';
import { pathLength, wallPath } from '../core/geometry';
import { beginOpeningChartDrag, previewOpeningChartDrag, sameOpeningGeometry, type OpeningChartDrag, type OpeningCorner, type OpeningEditMode } from '../core/openings';

type Props = { floor: Floor; opening: Opening; fence?: OpeningEditFence; disabled: boolean; onEdit: (commands: EditCommand[], fence?: OpeningEditFence) => void | Promise<boolean> };
/** Compact physical wall chart, separate from the top-down plan symbol. */
export function OpeningElevation({ floor, opening, fence, disabled, onEdit }: Props) {
  const host = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), frame = useRef<number | null>(null);
  const [width, setWidth] = useState(280), [preview, setPreview] = useState<{ opening: Opening; error?: string } | null>(null);
  const gesture = useRef<{ pointer: number; chart: OpeningChartDrag; fence: OpeningEditFence; rect: DOMRect; x: number; y: number } | null>(null);
  const contacts = useRef(new Set<number>()), blocked = useRef(new Set<number>());
  const wall = floor.walls.find(w => w.id === opening.wallID)!;
  const length = pathLength(wallPath(floor, wall)), height = 210, padding = 32, scale = Math.min((width - padding * 2) / Math.max(length, .1), (height - padding * 2) / Math.max(wall.height, .1));
  const shown = preview?.opening ?? opening, x = padding + shown.offset * scale, y = height - padding - (shown.bottom + shown.height) * scale, w = shown.width * scale, h = shown.height * scale;
  const cancel = () => {
    const current = gesture.current; gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null;
    if (current) { blocked.current.add(current.pointer); if (svg.current?.hasPointerCapture(current.pointer)) svg.current.releasePointerCapture(current.pointer); }
    setPreview(null);
  };
  const cancelRef = useRef(cancel); cancelRef.current = cancel;
  const signature = JSON.stringify([fence, disabled, opening, width]);
  useLayoutEffect(() => { cancelRef.current(); }, [signature]);
  useLayoutEffect(() => {
    const element = host.current; if (!element) return;
    const observer = new ResizeObserver(entries => { cancelRef.current(); setWidth(Math.max(180, entries[0].contentRect.width)); }); observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelRef.current(); };
    const focus = () => { cancelRef.current(); contacts.current.clear(); blocked.current.clear(); };
    const visibility = () => { if (document.hidden) cancelRef.current(); else focus(); };
    const down = (e: PointerEvent) => { if (e.pointerType !== 'touch') return; contacts.current.add(e.pointerId); if (contacts.current.size > 1) { for (const id of contacts.current) blocked.current.add(id); cancelRef.current(); } };
    const up = (e: PointerEvent) => { contacts.current.delete(e.pointerId); blocked.current.delete(e.pointerId); };
    const blur = () => cancelRef.current();
    window.addEventListener('keydown', key); window.addEventListener('blur', blur); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility); window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', blur); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (frame.current !== null) cancelAnimationFrame(frame.current); gesture.current = null; };
  }, []);
  const sample = (clientX: number, clientY: number, rect: DOMRect) => ({ u: ((clientX - rect.left) * width / rect.width - padding) / scale, v: (height - padding - (clientY - rect.top) * height / rect.height) / scale });
  const stable = (g: NonNullable<typeof gesture.current>) => {
    const rect = svg.current?.getBoundingClientRect();
    return !disabled && !!rect && JSON.stringify(g.fence) === JSON.stringify(fence) && (['left', 'top', 'width', 'height'] as const).every(key => Math.abs(rect[key] - g.rect[key]) < .1);
  };
  const publish = () => { frame.current = null; const g = gesture.current; if (g && !stable(g)) { cancel(); return; } if (g) setPreview(previewOpeningChartDrag(floor, g.chart, sample(g.x, g.y, g.rect))); };
  function begin(event: ReactPointerEvent<SVGElement>, mode: OpeningEditMode) {
    if (disabled || !fence || blocked.current.has(event.pointerId) || contacts.current.size > 1 || event.button !== 0 || !svg.current) return;
    event.preventDefault(); event.stopPropagation(); const rect = svg.current.getBoundingClientRect();
    gesture.current = { pointer: event.pointerId, chart: beginOpeningChartDrag(opening, mode, sample(event.clientX, event.clientY, rect)), fence: { ...fence }, rect, x: event.clientX, y: event.clientY };
    svg.current.setPointerCapture(event.pointerId);
  }
  function release(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
    if (!stable(g)) { cancel(); return; }
    const result = previewOpeningChartDrag(floor, g.chart, sample(event.clientX, event.clientY, g.rect));
    gesture.current = null; if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; setPreview(null);
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    if (!result.error && !sameOpeningGeometry(g.chart.original, result.opening)) void onEdit([{ type: 'updateOpening', floorID: floor.id, opening: result.opening }], g.fence);
  }
  const corners = (['start-bottom', 'start-top', 'end-bottom', 'end-top'] as OpeningCorner[]).map(corner => {
    const right = corner.startsWith('end'), top = corner.endsWith('top');
    return { corner, ax: right ? x + w : x, ay: top ? y : y + h, cx: x + w / 2 + (right ? 1 : -1) * Math.max(w / 2, 24), cy: y + h / 2 + (top ? -1 : 1) * Math.max(h / 2, 24) };
  });
  return <section className="spatial-opening-elevation" ref={host} aria-label="Opening wall elevation">
    <h3>Wall elevation</h3><p className="spatial-caption">Drag a corner to resize. Drag the edge to move along the wall. The opposite corner stays fixed.</p>
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Physical opening width, height and bottom on its wall" onPointerMove={event => { const g = gesture.current; if (!g || g.pointer !== event.pointerId) return; g.x = event.clientX; g.y = event.clientY; if (frame.current === null) frame.current = requestAnimationFrame(publish); }} onPointerUp={release} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current) cancel(); }}>
      <rect x={padding} y={height - padding - wall.height * scale} width={length * scale} height={wall.height * scale} fill="#f2f3f5" stroke="#68717c" />
      <line x1={padding} x2={padding + length * scale} y1={height - padding + wall.baseY * scale} y2={height - padding + wall.baseY * scale} stroke="#68717c" strokeDasharray="4 4" />
      <rect x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} fill="#fff" stroke={preview?.error ? '#b34232' : '#177aac'} strokeWidth="2" />
      <rect data-elevation-edge="true" x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)} fill="transparent" stroke="transparent" strokeWidth="22" onPointerDown={event => begin(event, 'move')} />
      {!disabled && fence && corners.map(c => <g key={c.corner}><line x1={c.ax} y1={c.ay} x2={c.cx} y2={c.cy} stroke="#177aac" /><circle cx={c.cx} cy={c.cy} r="6" fill="#fff" stroke="#177aac" strokeWidth="2" /><circle data-elevation-corner={c.corner} aria-label={`Resize ${c.corner.replace('-', ' ')} corner`} cx={c.cx} cy={c.cy} r="22" fill="transparent" onPointerDown={event => begin(event, c.corner)} /></g>)}
    </svg>
    <p className="spatial-caption" aria-live="polite">{preview?.error || `${shown.width.toFixed(3)} m wide, ${shown.height.toFixed(3)} m high. Bottom ${shown.bottom.toFixed(3)} m above wall base.`}</p>
    {opening.kind !== 'window' && <p className="spatial-caption">Floor-relative threshold: {(wall.baseY + shown.bottom).toFixed(3)} m. Raised openings may not be traversable.</p>}
  </section>;
}
