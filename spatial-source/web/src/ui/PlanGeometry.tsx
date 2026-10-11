import { memo, useMemo } from 'react';
import { FloorGeometryIndex } from '../core/geometry';
import type { Floor, Point2, Selection } from '../types';
import { openingPath } from './geometry';
import type { OpeningPreview } from './openingManipulation';

type Props = { floor: Floor; selection: Selection | null; groupSelection: Selection[]; units: number; fills: boolean; openingPreview: OpeningPreview | null };
const path = (points: Point2[]) => points.map(point => `${point.x},${point.z}`).join(' ');

/** Saved geometry stays out of cursor-only React updates. One index serves all
 * paths, instead of rebuilding node maps for each wall, room and opening. */
export const PlanGeometry = memo(function PlanGeometry({ floor, selection, groupSelection, units, fills, openingPreview }: Props) {
  const index = useMemo(() => new FloorGeometryIndex(floor), [floor]);
  const walls = useMemo(() => new Map(floor.walls.map(wall => [wall.id, wall])), [floor]);
  const group = useMemo(() => new Set(groupSelection.filter(item => item.floorID === floor.id).map(item => `${item.kind}:${item.objectID}`)), [groupSelection, floor.id]);
  const inGroup = (kind: Selection['kind'], id: string) => group.has(`${kind}:${id}`);
  const selected = (kind: Selection['kind'], id: string) => inGroup(kind, id) || selection?.kind === kind && selection.objectID === id;
  return <g data-plan-geometry="true">
      {floor.rooms.map(room => { let boundary: Point2[]; try { boundary = index.boundary(room); } catch { return null; } const center = boundary.reduce((p, n) => ({ x: p.x + n.x / boundary.length, z: p.z + n.z / boundary.length }), { x: 0, z: 0 }); return <g key={room.id}><polygon data-group-selected={inGroup('room', room.id) ? room.id : undefined} points={path(boundary)} fill={selected('room', room.id) ? '#cde4f5' : fills ? '#edf4f7' : '#fff'} stroke="none" /><text x={center.x} y={center.z} textAnchor="middle" dominantBaseline="middle" fontSize={units * 14} fill="#485765">{room.label}</text></g>; })}
      {(floor.areas ?? []).map(area => <polygon key={area.id} data-group-selected={inGroup('area', area.id) ? area.id : undefined} points={path(area.polygon)} fill={selected('area', area.id) ? '#8dbbf566' : '#b7d4ed35'} stroke="#789cb7" strokeWidth={units * 1.5} strokeDasharray={`${units * 5} ${units * 4}`} />)}
      {floor.walls.map(wall => <polyline key={wall.id} data-group-selected={inGroup('wall', wall.id) ? wall.id : undefined} points={path(index.path(wall))} fill="none" stroke={selected('wall', wall.id) ? '#177aac' : wall.provenance.origin === 'inferred' ? '#b46b25' : '#283b4a'} strokeWidth={units * (selected('wall', wall.id) ? 5 : 3)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={wall.provenance.origin === 'inferred' ? `${units * 7} ${units * 5}` : undefined} />)}
      {floor.openings.map(opening => { const wall = walls.get(opening.wallID)!; const wallPoints = index.path(wall); const cutout = openingPath(wallPoints, opening.offset, opening.width), a = cutout[0], b = cutout[cutout.length-1]; const active = selected('opening', opening.id), invalid = openingPreview?.opening.id === opening.id && !!openingPreview.error; return <g key={opening.id} data-group-selected={inGroup('opening', opening.id) ? opening.id : undefined} data-opening-object={opening.id} data-opening-preview={openingPreview?.opening.id === opening.id ? invalid ? 'invalid' : 'valid' : undefined}><polyline points={path(cutout)} fill="none" stroke="#f8fafb" strokeWidth={units * 7} /><polyline points={path(cutout)} fill="none" stroke={invalid ? '#a25738' : active ? '#126b9c' : opening.kind === 'window' ? '#70a8c6' : '#7095a6'} strokeWidth={units * (active ? 4 : 2)} strokeDasharray={opening.kind === 'window' ? undefined : `${units * 3} ${units * 3}`} />{opening.kind === 'door' && cutout.length === 2 && <path d={`M ${a.x} ${a.z} Q ${a.x + (b.z-a.z)} ${a.z - (b.x-a.x)} ${b.x} ${b.z}`} fill="none" stroke="#7095a6" strokeWidth={units * 1} />}</g>; })}
      {floor.nodes.map(node => <circle key={node.id} data-group-selected={inGroup('node', node.id) ? node.id : undefined} cx={node.point.x} cy={node.point.z} r={units * (selected('node', node.id) ? 7 : 3)} fill={selected('node', node.id) ? '#177aac' : '#fff'} stroke={selected('node', node.id) ? '#fff' : '#304759'} strokeWidth={units * 1.5} />)}
  </g>;
});
