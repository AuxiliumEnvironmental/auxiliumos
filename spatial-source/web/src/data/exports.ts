import { buildScene } from '../core';
import type { ExportArtifact, ExportFormat, Floor, FrozenRevision } from '../types';
import { clone, fail, jsonBytes, MAX_MEMBER, sha256 } from './bytes';
import { drawings, pdfDrawing, pngDrawing, svgDrawing, svgFloorOverview } from './drawing';
import { glbDrawing } from './glb';
import { validateFrozen } from './store';
import { writeZIP } from './zip';

export async function exportRevision(frozen: FrozenRevision, format: ExportFormat, floorID?: string): Promise<ExportArtifact> {
  frozen = clone(frozen);
  await validateFrozen(frozen);
  const document = frozen.document, stem = `${document.documentID}-r${document.revision}`;
  const selected = floorID ? document.floors.filter(f => f.id === floorID) : document.floors;
  if (!selected.length) fail('floor-not-found');
  const single = (): Floor => { if (selected.length !== 1) fail('choose-floor-or-local-document'); return selected[0]; };
  let bytes: Uint8Array, mimeType: string, filename: string;
  switch (format) {
    case 'geometry': bytes = frozen.bytes.slice(); mimeType = 'application/json'; filename = `${stem}.geometry.json`; break;
    case 'scene': { const floor = single(); bytes = jsonBytes(buildScene(document, floor.id)); mimeType = 'application/json'; filename = `${stem}-${floor.id}.scene.json`; break; }
    case 'svg': case 'png': {
      const floor = single(), pages = drawings(frozen, floor);
      const render = (index: number) => format === 'svg' ? Promise.resolve(svgDrawing(frozen, floor, index, pages)) : pngDrawing(frozen, floor, index, pages);
      const type = format === 'svg' ? 'image/svg+xml' : 'image/png';
      if (pages.length === 1) { bytes = await render(0); mimeType = type; filename = `${stem}-${floor.id}.${format}`; }
      else {
        const files: Record<string, Uint8Array> = {}, records: Record<string, unknown>[] = [];
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          const path = `floorplan-${pageIndex.toString().padStart(4, '0')}.${format}`, data = await render(pageIndex);
          files[path] = data; records.push({ path, mimeType: type, sha256: await sha256(data), bytes: data.length, pageIndex });
        }
        files['manifest.json'] = jsonBytes({ profileVersion: 'auxilium-spatial-drawing-pages/1.0.0', documentID: document.documentID, floorID: floor.id, revision: document.revision, measurementStatus: 'unverified', format, pageCount: pages.length, files: records });
        bytes = writeZIP(files); mimeType = 'application/zip'; filename = `${stem}-${floor.id}.${format}-pages.zip`;
      }
      break;
    }
    case 'pdf': bytes = await pdfDrawing(frozen, selected); mimeType = 'application/pdf'; filename = `${stem}${floorID ? `-${floorID}` : '-all-floors'}.pdf`; break;
    case 'glb': { const floor = single(); bytes = glbDrawing(frozen, floor.id); mimeType = 'model/gltf-binary'; filename = `${stem}-${floor.id}.glb`; break; }
    case 'bundle': {
      const floor = single();
      // The v1 wire profile is single-floor. Never discard other floors inside its geometry.
      if (document.floors.length !== 1) fail('single-floor-exchange-only-use-local-document');
      const files: Record<string, Uint8Array> = { 'geometry.json': frozen.bytes.slice(), 'scene.json': jsonBytes(buildScene(document, floor.id)), 'floorplan.svg': svgFloorOverview(frozen, floor) };
      files['manifest.json'] = jsonBytes({ formatVersion: '1.0.0', documentID: document.documentID, revision: document.revision, measurementStatus: 'unverified', contentClass: 'spatial-draft', files: await Promise.all(Object.keys(files).sort().map(async path => ({ path, sha256: await sha256(files[path]), bytes: files[path].length }))) });
      bytes = writeZIP(files); mimeType = 'application/zip'; filename = `${stem}.exchange.zip`; break;
    }
    case 'local-document': {
      // Always complete: a selected-floor UI must not silently narrow a document recovery archive.
      const files: Record<string, Uint8Array> = { 'geometry.json': frozen.bytes.slice() };
      const records: Record<string, unknown>[] = [{ path: 'geometry.json', mimeType: 'application/json', sha256: await sha256(files['geometry.json']), bytes: files['geometry.json'].length }];
      const floorPages = document.floors.map(floor => drawings(frozen, floor));
      if (floorPages.reduce((n, pages) => n + pages.length * 2 + 3, 1) > 4095) fail('local-document-file-limit');
      const add = async (path: string, data: Uint8Array, type: string, id: string, pageIndex?: number) => { files[path] = data; records.push({ path, mimeType: type, sha256: await sha256(data), bytes: data.length, floorID: id, ...(pageIndex === undefined ? {} : { pageIndex }) }); };
      for (let index = 0; index < document.floors.length; index++) {
        const floor = document.floors[index], base = `floors/${index.toString().padStart(4, '0')}/`;
        await add(`${base}scene.json`, jsonBytes(buildScene(document, floor.id)), 'application/json', floor.id);
        for (let pageIndex = 0; pageIndex < floorPages[index].length; pageIndex++) {
          const page = pageIndex.toString().padStart(4, '0');
          await add(`${base}floorplan-${page}.svg`, svgDrawing(frozen, floor, pageIndex, floorPages[index]), 'image/svg+xml', floor.id, pageIndex);
          await add(`${base}floorplan-${page}.png`, await pngDrawing(frozen, floor, pageIndex, floorPages[index]), 'image/png', floor.id, pageIndex);
        }
        await add(`${base}floorplan.pdf`, await pdfDrawing(frozen, [floor]), 'application/pdf', floor.id);
        if (floor.walls.length || floor.rooms.length) await add(`${base}model.glb`, glbDrawing(frozen, floor.id), 'model/gltf-binary', floor.id);
      }
      files['manifest.json'] = jsonBytes({ profileVersion: 'auxilium-spatial-local-document/1.0.0', documentID: document.documentID, revision: document.revision, measurementStatus: 'unverified', coordinateSystem: document.coordinateSystem, floors: document.floors.map((floor, index) => ({ floorID: floor.id, label: floor.label, elevation: floor.elevation, index, pageCount: floorPages[index].length, representationStatus: floor.walls.length || floor.rooms.length ? 'geometry' : 'empty' })), files: records });
      bytes = writeZIP(files); mimeType = 'application/zip'; filename = `${stem}.spatial.zip`; break;
    }
    default: return fail('unsupported-export-format');
  }
  if (mimeType !== 'application/zip' && bytes.length > MAX_MEMBER) fail('export-size-limit');
  return { bytes, mimeType, filename, revision: document.revision, hash: await sha256(bytes) };
}
