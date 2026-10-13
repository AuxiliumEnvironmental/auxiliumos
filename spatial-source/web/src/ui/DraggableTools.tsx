import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/** A movable display preference. It never changes the drawing or its commands. */
export function DraggableTools({ children }: { children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null), palette = useRef<HTMLDivElement>(null);
  const instructions = useId();
  const [position, setPosition] = useState({ x: 0, y: 24 });
  const positionRef = useRef(position); positionRef.current = position;
  const drag = useRef<{ id: number; x: number; y: number; origin: typeof position } | null>(null);
  const frame = useRef<number | null>(null), queued = useRef<typeof position | null>(null);
  function cancelFrame() { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; queued.current = null; }
  function move(next: typeof position) {
    const bounds = stage.current, tools = palette.current;
    if (!bounds || !tools || !bounds.clientWidth) return;
    const value = { x: Math.max(0, Math.min(next.x, bounds.clientWidth - tools.offsetWidth)), y: Math.max(0, Math.min(next.y, bounds.clientHeight - tools.offsetHeight)) };
    positionRef.current = value; setPosition(value);
  }
  useEffect(() => {
    const observer = new ResizeObserver(() => move(positionRef.current));
    if (stage.current) observer.observe(stage.current);
    if (palette.current) observer.observe(palette.current);
    const cancel = () => { cancelFrame(); drag.current = null; };
    window.addEventListener('blur', cancel);
    return () => { cancel(); observer.disconnect(); window.removeEventListener('blur', cancel); };
  }, []);
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 64 : 24, p = positionRef.current;
    const delta = event.key === 'ArrowLeft' ? { x: -step, y: 0 } : event.key === 'ArrowRight' ? { x: step, y: 0 } : event.key === 'ArrowUp' ? { x: 0, y: -step } : event.key === 'ArrowDown' ? { x: 0, y: step } : null;
    if (delta) { event.preventDefault(); move({ x: p.x + delta.x, y: p.y + delta.y }); }
    else if (event.key === 'Home' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); move({ x: 0, y: 24 }); }
    else if (event.key === 'Escape') { cancelFrame(); if (drag.current) move(drag.current.origin); drag.current = null; }
  }
  return <div ref={stage} className="spatial-tools-stage">
    <div ref={palette} className="spatial-palette" data-position={`${Math.round(position.x)},${Math.round(position.y)}`} style={{ '--palette-x': `${position.x}px`, '--palette-y': `${position.y}px` } as React.CSSProperties}>
      <button className="spatial-palette-handle" aria-label="Move drawing tools" aria-describedby={instructions} title="Drag to move tools. Arrow keys move; Enter resets." onKeyDown={key}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); cancelFrame(); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: { ...positionRef.current } }; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus({ preventScroll: true }); }}
        onPointerMove={event => { const g = drag.current; if (!g || g.id !== event.pointerId) return; queued.current = { x: g.origin.x + event.clientX - g.x, y: g.origin.y + event.clientY - g.y }; if (frame.current !== null) return; frame.current = requestAnimationFrame(() => { frame.current = null; const next = queued.current; queued.current = null; if (next && drag.current) move(next); }); }}
        onPointerUp={event => { const g = drag.current; if (!g || g.id !== event.pointerId) return; cancelFrame(); move({ x: g.origin.x + event.clientX - g.x, y: g.origin.y + event.clientY - g.y }); drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { cancelFrame(); if (drag.current) move(drag.current.origin); drag.current = null; }}
        onLostPointerCapture={() => { cancelFrame(); drag.current = null; }}><span aria-hidden="true">⠿</span></button>
      <span id={instructions} className="spatial-hidden-input">Drag the handle to move the tool palette. Arrow keys move it; Enter or Home returns it to the left.</span>
      {children}
    </div>
  </div>;
}
