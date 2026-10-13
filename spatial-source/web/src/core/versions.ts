import type { SpatialDocument } from '../types';
/** Version ordering is independent of admission: newer schemas still need their strict adapters. */
export function isAtLeastSchemaVersion(actual: string, required: string): boolean {
  const a = actual.split('.').map(Number), b = required.split('.').map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(n => !Number.isSafeInteger(n) || n < 0)) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}
export function maxSchemaVersion(a: SpatialDocument['schemaVersion'], b: SpatialDocument['schemaVersion']): SpatialDocument['schemaVersion'] {
  return isAtLeastSchemaVersion(a, b) ? a : b;
}
