import { buildScene } from '../core';
import type { FrozenRevision, Point3 } from '../types';
import { concatenate, fail, jsonBytes, MAX_MEMBER } from './bytes';

/** glTF 2.0 binary derivative. Canonical cutout triangles and semantic lines remain distinct. */
export function glbDrawing(frozen: FrozenRevision, floorID: string): Uint8Array {
  const scene = buildScene(frozen.document, floorID);
  if (!scene.faces.length && !scene.edges.length) fail('empty-scene');
  if (scene.faces.reduce((sum, face) => sum + face.triangles.length * 72, scene.edges.length * 24) > MAX_MEMBER) fail('glb-size-limit');
  const parts: Uint8Array[] = [], bufferViews: Record<string, unknown>[] = [], accessors: Record<string, unknown>[] = [], meshes: Record<string, unknown>[] = [], nodes: Record<string, unknown>[] = [];
  let binaryLength = 0;
  function vector(values: number[], bounds = false): number {
    if (!values.length || values.length % 3 || values.some(n => !Number.isFinite(n))) fail('invalid-glb-vectors');
    const f32 = Float32Array.from(values), bytes = new Uint8Array(f32.buffer);
    if (binaryLength + bytes.length > MAX_MEMBER) fail('glb-size-limit');
    const bufferView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: binaryLength, byteLength: bytes.length, target: 34962 }); parts.push(bytes); binaryLength += bytes.length;
    const accessor: Record<string, unknown> = { bufferView, componentType: 5126, count: values.length / 3, type: 'VEC3' };
    if (bounds) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      f32.forEach((value, i) => { min[i % 3] = Math.min(min[i % 3], value); max[i % 3] = Math.max(max[i % 3], value); });
      accessor.min = min; accessor.max = max;
    }
    accessors.push(accessor); return accessors.length - 1;
  }
  function primitive(objectID: string, role: string, representation: string, data: Record<string, unknown>) {
    const extras = { objectID, role, representation }, mesh = meshes.length;
    meshes.push({ primitives: [data], extras }); nodes.push({ mesh, extras });
  }
  const faceGroups = new Map<string, typeof scene.faces>();
  for (const face of scene.faces) { const key = `${face.role}:${face.objectID}`; const group = faceGroups.get(key); if (group) group.push(face); else faceGroups.set(key, [face]); }
  for (const key of [...faceGroups.keys()].sort()) {
    const faces = faceGroups.get(key)!, positions: number[] = [], normals: number[] = [];
    for (const face of faces) for (const triangle of face.triangles) {
      if (triangle.length !== 3 || triangle.some(i => !Number.isInteger(i) || i < 0 || i >= face.vertices.length)) fail('invalid-scene-index');
      const p = triangle.map(i => face.vertices[i]).map(p => [Math.fround(p.x), Math.fround(p.y), Math.fround(p.z)]);
      const a = p[1].map((v, i) => v - p[0][i]), b = p[2].map((v, i) => v - p[0][i]);
      const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], length = Math.hypot(...cross);
      if (!(length > 0) || !Number.isFinite(length)) fail('glb-float32-precision-loss');
      for (const point of p) { positions.push(...point); normals.push(...cross.map(n => n / length)); }
    }
    primitive(faces[0].objectID, faces[0].role, 'faces', { attributes: { POSITION: vector(positions, true), NORMAL: vector(normals) }, mode: 4, material: faces[0].role === 'floor' ? 1 : 0 });
  }
  const groups = new Map<string, typeof scene.edges>();
  for (const edge of scene.edges) { const key = `${edge.role}:${edge.objectID}`; const group = groups.get(key); if (group) group.push(edge); else groups.set(key, [edge]); }
  const pointValues = (p: Point3) => [Math.fround(p.x), Math.fround(p.y), Math.fround(p.z)];
  for (const key of [...groups.keys()].sort()) {
    const edges = groups.get(key)!, positions: number[] = [];
    for (const edge of edges) {
      const a = pointValues(edge.a), b = pointValues(edge.b); if (a.every((v, i) => v === b[i])) fail('glb-float32-precision-loss'); positions.push(...a, ...b);
    }
    primitive(edges[0].objectID, edges[0].role, 'semantic-edges', { attributes: { POSITION: vector(positions, true) }, mode: 1, material: edges[0].role === 'window' ? 3 : 2 });
  }
  const extras = { documentID: frozen.document.documentID, revision: frozen.document.revision, floorID, geometrySchemaVersion: frozen.document.schemaVersion, coordinateSystem: frozen.document.coordinateSystem, measurementStatus: 'unverified', sourceSHA256: frozen.hash };
  const material = (color: number[], alpha = false) => ({ doubleSided: true, alphaMode: alpha ? 'BLEND' : 'OPAQUE', pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 1 } });
  const json = jsonBytes({ asset: { version: '2.0', generator: 'Auxilium Spatial shared workspace', extras }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i), extras }], nodes, meshes, accessors, bufferViews, buffers: [{ byteLength: binaryLength }], materials: [material([0.66, 0.81, 0.91, 0.24], true), material([0.82, 0.90, 0.96, 0.18], true), material([0.025, 0.045, 0.075, 1]), material([0.14, 0.48, 0.75, 1])] });
  const jsonPad = new Uint8Array((4 - json.length % 4) % 4).fill(32), binary = concatenate(parts), header = new Uint8Array(20), footer = new Uint8Array(8);
  const h = new DataView(header.buffer); h.setUint32(0, 0x46546c67, true); h.setUint32(4, 2, true); h.setUint32(8, 28 + json.length + jsonPad.length + binary.length, true); h.setUint32(12, json.length + jsonPad.length, true); h.setUint32(16, 0x4e4f534a, true);
  const f = new DataView(footer.buffer); f.setUint32(0, binary.length, true); f.setUint32(4, 0x004e4942, true);
  const result = concatenate([header, json, jsonPad, footer, binary]); if (result.length > MAX_MEMBER) fail('glb-size-limit'); return result;
}
