import { stressFixture } from './stressFixture';
import { establishCeilingSchema } from '../../src/core/ceilings';
import { recordAffectedArea } from '../../src/core/affectedAreas';
import { requireValidDocument } from '../../src/core/validation';
import type { SurfacePolygon, SurfaceRef } from '../../src/types';

/** Synthetic capacity probe using the real observation constructor and strict admission. */
export function overlayStressFixture() {
  const document = stressFixture();
  document.title = 'Synthetic combined rendering stress';
  establishCeilingSchema(document);
  document.schemaVersion = '1.5.0';
  document.affectedAreas = [];
  const floor = document.floors[0];
  for (let r = 0; r < 100; r++) {
    const x = (r % 10) * 10, z = Math.floor(r / 10) * 10, room = floor.rooms[r];
    for (let n = 0; n < 20; n++) {
      const surface: SurfaceRef = n < 10
        ? { floorID: floor.id, kind: 'floor', roomID: room.id }
        : n < 15
          ? { floorID: floor.id, kind: 'ceiling', roomID: room.id, ceilingID: room.ceiling!.id }
          : { floorID: floor.id, kind: 'wall', wallID: `w-${r}-6`, side: 'positive' };
      const u = n >= 15 ? .12 + (n - 15) * .48 : x + .5 + (n % 5) * 1.4;
      const v = n >= 15 ? .7 : z + .5 + Math.floor((n % 10) / 5) * 2;
      const width = n >= 15 ? .3 : 1, height = n >= 15 ? .4 : 1;
      const footprint: SurfacePolygon = { outer: [{ u, v }, { u: u + width, v }, { u: u + width, v: v + height }, { u, v: v + height }], holes: [] };
      document.affectedAreas.push(recordAffectedArea(document, `stress-area-${r}-${n}`, n % 2 ? 'fire' : 'moisture', surface, footprint));
    }
  }
  return requireValidDocument(document);
}
