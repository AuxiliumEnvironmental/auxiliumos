import { useEffect, useId, useRef, useState } from 'react';
import type { CeilingTarget, EditCommand, EditFence, SpatialDocument } from '../types';
import { prepareCeilingEdit, previewCeilingHeights, resolvedCeilingHeight } from '../core/ceilings';
import { ceilingFenceMatches } from './ceilingManipulation';

interface Props {
  document: SpatialDocument;
  target: CeilingTarget;
  fence: EditFence;
  disabled?: boolean;
  onEdit: (commands: EditCommand[], fence: EditFence) => void;
  onTargetsChange?: (targets: CeilingTarget[]) => void;
}
const same = (a: CeilingTarget, b: CeilingTarget) => a.floorID === b.floorID && a.roomID === b.roomID;
export function CeilingHeightControls({ document, target, fence, disabled = false, onEdit, onTargetsChange }: Props) {
  const floor = document.floors.find(f => f.id === target.floorID), room = floor?.rooms.find(r => r.id === target.roomID);
  const height = floor && room ? resolvedCeilingHeight(floor, room) : null;
  const [structure, setStructure] = useState(false), [targets, setTargets] = useState<CeilingTarget[]>([target]);
  const [mode, setMode] = useState<'absolute' | 'delta'>('absolute'), [value, setValue] = useState(height === null ? '' : String(height));
  const [error, setError] = useState('');
  const draftFence = useRef(fence), callback = useRef(onTargetsChange); callback.current = onTargetsChange;
  const inputID = useId();
  useEffect(() => {
    setStructure(false); setTargets([target]); setMode('absolute'); setValue(height === null ? '' : String(height)); setError(''); draftFence.current = { ...fence }; callback.current?.([target]);
  }, [document.documentID, document.revision, target.floorID, target.roomID, fence.contextKey, fence.generation]);
  if (!floor || !room) return null;
  const selected = structure ? targets : [target];
  const members = selected.map(t => { const f = document.floors.find(f => f.id === t.floorID), r = f?.rooms.find(r => r.id === t.roomID); return { ...t, label: `${f?.label ?? t.floorID} / ${r?.label ?? t.roomID}`, height: f && r ? resolvedCeilingHeight(f, r) : null }; });
  const unknown = members.filter(m => m.height === null);
  const changeTargets = (next: CeilingTarget[]) => { setTargets(next); setError(''); callback.current?.(next); };
  const submit = () => {
    try {
      if (disabled || !ceilingFenceMatches(draftFence.current, fence)) throw new Error('The workspace changed. Re-enter the height in the current revision.');
      if (!value.trim()) throw new Error('Enter an exact height in meters.');
      const numeric = Number(value), preview = previewCeilingHeights(prepareCeilingEdit(document, selected), mode, numeric);
      if (!preview.changed) { setError('This height is already saved.'); return; }
      setError(''); onEdit([{ type: 'setCeilingHeights', targets: selected.map(t => ({ ...t })), mode, value: numeric }], { ...draftFence.current });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section className="spatial-ceiling-controls" aria-label="Ceiling height controls">
    <h3>Ceiling height</h3>
    <p className="spatial-caption">{height === null ? 'No established planar ceiling. Enter an absolute starting height before dragging.' : `${height.toLocaleString(undefined, { maximumFractionDigits: 4 })} m above this floor. ${room.ceiling?.heightBasis === 'edited' ? 'Edited' : 'Inferred or source-derived'}; unverified.`}</p>
    <fieldset disabled={disabled}>
      <div className="spatial-button-pair"><button type="button" aria-pressed={!structure} onClick={() => { setStructure(false); setMode('absolute'); setValue(height === null ? '' : String(height)); changeTargets([target]); }}>This room</button><button type="button" aria-pressed={structure} onClick={() => { setStructure(true); setMode('delta'); setValue('0'); changeTargets(targets.length ? targets : [target]); }}>Structure room set</button></div>
      {structure && <><p className="spatial-caption">Choose the exact rooms and levels. A common change preserves their height differences; floor elevations never move.</p><div className="spatial-ceiling-room-set" aria-label="Rooms included in height edit">{document.floors.map(f => <div key={f.id}><strong>{f.label}</strong>{f.rooms.map(r => { const t = { floorID: f.id, roomID: r.id }, checked = targets.some(m => same(m, t)), h = resolvedCeilingHeight(f, r); return <label key={r.id} className="spatial-check"><input type="checkbox" checked={checked} disabled={!checked && targets.length >= 1000} onChange={event => changeTargets(event.target.checked ? [...targets, t] : targets.filter(m => !same(m, t)))} />{r.label}: {h === null ? 'height unknown' : `${h.toLocaleString(undefined, { maximumFractionDigits: 4 })} m`}</label>; })}</div>)}</div><p className="spatial-caption">{selected.length} rooms selected: {members.map(m => m.label).join('; ') || 'none'}.</p></>}
      <label>Height action<select aria-label="Height action" value={mode} onChange={event => { const next = event.target.value as 'absolute' | 'delta'; setMode(next); setValue(next === 'delta' ? '0' : height === null ? '' : String(height)); setError(''); }}><option value="absolute">Assign absolute height / initialize</option><option value="delta">Apply a common height change</option></select></label>
      {unknown.length > 0 && <p className="spatial-caption">Common-change drag is unavailable until these rooms are initialized: {unknown.map(m => m.label).join('; ')}.</p>}
      <label htmlFor={inputID}>{mode === 'absolute' ? 'Absolute ceiling height (m)' : 'Change selected heights by (m)'}</label><input id={inputID} type="number" inputMode="decimal" step="any" value={value} onChange={event => { setValue(event.target.value); draftFence.current = { ...fence }; }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} />
      <button className="spatial-full-button" type="button" disabled={!selected.length || (mode === 'delta' && unknown.length > 0)} onClick={submit}>{mode === 'absolute' ? 'Assign selected ceiling heights' : 'Apply common height change'}</button>
    </fieldset>
    {error && <p role="alert" className="spatial-error-text">{error}</p>}
    <p className="spatial-caption">Openings and floors stay fixed. Required wall extensions are included in the same undo step. Lower ceilings do not shorten taller partitions.</p>
  </section>;
}
