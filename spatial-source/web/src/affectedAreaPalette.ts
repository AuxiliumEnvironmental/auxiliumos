import type { AffectedKind } from './types';
export const AFFECTED_COLORS = Object.freeze({
  moisture: Object.freeze({ face: '#4FA9E8', fill: '#D7EDFB', line: '#145E96' }),
  fire: Object.freeze({ face: '#EB5757', fill: '#FBDDDD', line: '#B32929' }),
});
export const AFFECTED_OPACITY = 0.24;
export function affectedRole(kind: AffectedKind): string { return `affected-${kind}`; }
export function affectedKind(role: string): AffectedKind | null { return role === 'affected-moisture' ? 'moisture' : role === 'affected-fire' ? 'fire' : null; }
