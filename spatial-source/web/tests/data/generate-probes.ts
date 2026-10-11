import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { exportRevision } from '../../src/data';
import { jsonBytes, sha256 } from '../../src/data/bytes';
import type { FrozenRevision, SpatialDocument } from '../../src/types';

const directory = new URL('./generated/', import.meta.url); await mkdir(directory, { recursive: true });
const document: SpatialDocument = JSON.parse(await readFile(new URL('../../../fixtures/geometry.json', import.meta.url), 'utf8'));
const freeze = async (document: SpatialDocument): Promise<FrozenRevision> => { const bytes = jsonBytes(document); return { document, bytes, hash: await sha256(bytes), createdAt: '2026-10-09T00:00:00Z' }; };
const original = await freeze(document);
const artifacts: Record<string, unknown>[] = [];
for (const format of ['bundle', 'svg', 'pdf', 'glb'] as const) {
  const artifact = await exportRevision(original, format, 'floor-1');
  await writeFile(new URL(artifact.filename, directory), artifact.bytes); artifacts.push({ format, filename: artifact.filename, bytes: artifact.bytes.length, sha256: artifact.hash, sourceSHA256: original.hash });
}
const amended = structuredClone(document); amended.schemaVersion = '1.1.0'; amended.floors[0].rooms[0].label = 'A'.repeat(256);
amended.floors[0].areas = [{ id: 'semantic-zone', label: 'Synthetic test area', polygon: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }], provenance: { origin: 'synthetic', sourceIDs: [], classificationConfidence: 'unknown' } }];
const withAreas = await freeze(amended);
for (const format of ['bundle', 'svg', 'pdf'] as const) {
  const artifact = await exportRevision(withAreas, format, 'floor-1'), filename = `directory-${artifact.filename}`;
  await writeFile(new URL(filename, directory), artifact.bytes); artifacts.push({ format, filename, bytes: artifact.bytes.length, sha256: artifact.hash, sourceSHA256: withAreas.hash });
}
await writeFile(new URL('ARTIFACTS.json', directory), JSON.stringify({ status: 'generated_from_current_typescript_source', syntheticOnly: true, artifacts }, null, 2) + '\n');
console.log(JSON.stringify({ artifacts: artifacts.length, directory: directory.pathname }));
