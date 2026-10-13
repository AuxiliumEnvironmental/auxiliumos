import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, provenance } from '../core/fixtures';
import { applyCommands } from '../../src/core/editor';
import { affectedPlanPrimitives, visibleAffectedAreas } from '../../src/core/affectedAreas';
import { domainArea, rectangle } from '../../src/core/affectedAreaGeometry';
import { affectedPlanGeometry } from '../../src/ui/affectedPlanGeometry';
import type { Cutout, SurfaceRef } from '../../src/types';

const floorID = 'floor-1', surface: SurfaceRef = { floorID, kind: 'floor', roomID: 'room-a' };
const hole: Cutout = { id: 'cache-hole', kind: 'cutout', surface, profile: { shape: 'rectangle', center: { u: 1, v: 1 }, width: .4, height: .4, rotation: 0 }, provenance: provenance() };

test('plan cache follows snapshot identity for pending edits, undo and independent same-revision documents', () => {
  const document = applyCommands(fixture(), [{ type: 'recordAffectedArea', areaID: 'observation', kind: 'moisture', surface, footprint: rectangle(.2, .2, 3.7, 2.5) }], 1).document;
  const bytes = JSON.stringify(document), initial = affectedPlanGeometry(document, document.floors[0]);
  assert.equal(affectedPlanGeometry(document, document.floors[0]), initial);
  const edited = applyCommands(document, [{ type: 'setCutout', floorID, cutout: hole }], document.revision).document;
  // A pending view can differ before its durable revision advances. Document ID
  // and revision alone are therefore never an adequate UI cache key.
  const pending = { ...edited, revision: document.revision };
  const next = affectedPlanGeometry(pending, pending.floors[0]);
  assert.notDeepEqual(next, initial);
  assert.deepEqual(next, affectedPlanPrimitives(pending, floorID));
  assert.equal(affectedPlanGeometry(document, document.floors[0]), initial);
  assert.equal(JSON.stringify(document), bytes);
  assert.deepEqual(edited.affectedAreas![0].recordedSupport, document.affectedAreas![0].recordedSupport);
});

test('host memo is operation-scoped and dual marks never cross wall sides', () => {
  const positive: SurfaceRef = { floorID, kind: 'wall', wallID: 'w0', side: 'positive' }, negative: SurfaceRef = { ...positive, side: 'negative' };
  const document = applyCommands(fixture(), [
    { type: 'recordAffectedArea', areaID: 'positive', kind: 'moisture', surface: positive, footprint: rectangle(.2, .2, 3.7, 2.5) },
    { type: 'recordAffectedArea', areaID: 'negative', kind: 'fire', surface: negative, footprint: rectangle(.2, .2, 3.7, 2.5) },
  ], 1).document;
  const original = visibleAffectedAreas(document, floorID);
  assert.deepEqual(original, visibleAffectedAreas(document, floorID, false));
  const coverage = () => visibleAffectedAreas(document, floorID).reduce((sum, piece) => sum + domainArea(piece.domain), 0);
  const before = coverage();
  document.floors[0].cutouts = [{ ...hole, surface: positive }];
  assert.ok(Math.abs(coverage() - (before - .32)) < 1e-7);
  document.floors[0].cutouts = [];
  assert.deepEqual(visibleAffectedAreas(document, floorID), original);
});
