import { expect, test, type Page } from '@playwright/test';
import { freshDocument, syntheticDocument } from '../../src/ui/geometry';
import { beginOpeningDrag, openingDragPreview, openingResizeHandles } from '../../src/ui/openingManipulation';
import { buildScene, wallPath, WalkNavigation } from '../../src/core';
import { pathPoint } from '../../src/core/geometry';
import type { Point2, SpatialDocument, StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });

function fixture(bent = false): SpatialDocument {
  const document = freshDocument(`Direct openings ${bent ? 'bent' : 'straight'} synthetic`), floor = document.floors[0];
  const coordinates = bent ? [[0, 0], [4, 0], [4, 4], [8, 4], [8, 8], [0, 8]] : [[0, 0], [8, 0], [8, 6], [0, 6]];
  floor.nodes = coordinates.map(([x, z], i) => ({ id: `n${i}`, point: { x, z } }));
  const paths = bent ? [['n0', 'n1', 'n2', 'n3'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'n0']] : [['n0', 'n1'], ['n1', 'n2'], ['n2', 'n3'], ['n3', 'n0']];
  const provenance = { origin: 'synthetic' as const, sourceIDs: ['synthetic-source'], classificationConfidence: 'unknown' as const };
  floor.walls = paths.map((nodeIDs, i) => ({ id: `w${i}`, nodeIDs, baseY: 0, height: 2.6, heightBasis: 'synthetic', provenance: structuredClone(provenance) }));
  floor.openings = [{ id: 'opening-main', wallID: 'w0', kind: 'door', offset: bent ? 2 : 1, width: bent ? 3 : 2, bottom: 0, height: 2.1, provenance: structuredClone(provenance) }];
  if (!bent) floor.openings.push({ id: 'opening-other', wallID: 'w0', kind: 'window', offset: 5, width: 1, bottom: .8, height: 1.2, provenance: structuredClone(provenance) });
  floor.rooms = [{ id: 'room-main', label: 'Synthetic room', boundary: floor.walls.map(wall => ({ wallID: wall.id, reversed: false })) }];
  return document;
}
async function saved(page: Page, namespace = 'auxilium-spatial-local-v1'): Promise<StoredWorkspace> {
  return page.evaluate(async namespace => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path);
    const store = new SpatialWebStore(namespace);
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  }, namespace);
}
async function screen(page: Page, point: Point2) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, point) => {
    const p = svg.createSVGPoint(); p.x = point.x; p.y = point.z;
    const result = p.matrixTransform(svg.getScreenCTM()!); return { x: result.x, y: result.y };
  }, point);
}
async function importFixture(page: Page, document = fixture()) {
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'openings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await revision(page, 1); return document;
}
async function revision(page: Page, value: number) { await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${value}`); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); }
async function startMove(page: Page, from: Point2, to: Point2) {
  const a = await screen(page, from), b = await screen(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 });
}
async function resize(page: Page, mode: 'start' | 'end', target: Point2, release = true) {
  const floor = (await saved(page)).document.floors[0], opening = floor.openings[0], path = wallPath(floor, floor.walls.find(wall => wall.id === opening.wallID)!);
  const anchor = pathPoint(path, mode === 'start' ? opening.offset : opening.offset + opening.width);
  const a = await screen(page, anchor), b = await screen(page, target), box = (await page.locator(`[data-opening-handle=${mode}]`).boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + b.x - a.x, center.y + b.y - a.y, { steps: 8 });
  if (release) await page.mouse.up();
}

test('direct opening move preserves grab offset and identity with one undo, reopen and shared 3D selection', async ({ page }, info) => {
  const source = await importFixture(page), original = source.floors[0].openings[0];
  await startMove(page, { x: 1.6, z: 0 }, { x: 3.1, z: 0 });
  await expect(page.locator('[data-opening-object=opening-main]')).toHaveAttribute('data-opening-preview', 'valid');
  expect((await saved(page)).document).toEqual(source);
  await expect(page.locator('.spatial-canvas-note')).toContainText('Release to save the opening');
  await page.screenshot({ path: info.outputPath('desktop-opening-move-preview.png'), fullPage: true });
  await page.mouse.up(); await revision(page, 2);
  const corrected = (await saved(page)).document, opening = corrected.floors[0].openings[0];
  expect(opening.offset).toBeCloseTo(2.5, 6); expect(opening.width).toBe(original.width);
  expect(opening).toMatchObject({ id: original.id, wallID: original.wallID, kind: original.kind, bottom: original.bottom, height: original.height, provenance: { ...original.provenance, origin: 'edited' } });
  expect(corrected.floors[0].walls).toEqual(source.floors[0].walls); expect(corrected.floors[0].rooms).toEqual(source.floors[0].rooms);
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3); expect((await saved(page)).document.floors).toEqual(source.floors);
  await page.getByRole('button', { name: /Redo/ }).click(); await revision(page, 4); expect((await saved(page)).document.floors).toEqual(corrected.floors);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: source.title }).click(); await revision(page, 4);
  await page.locator('.spatial-object-list button').filter({ hasText: 'Door 1' }).click(); await page.getByRole('button', { name: '3D model', exact: true }).click();
  await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible(); await expect(page.locator('.spatial-inspector h2')).toHaveText('Door 1');
  const reopened = (await saved(page)).document, scene = buildScene(reopened, reopened.floors[0].id);
  const jambs = scene.edges.filter(edge => edge.objectID === original.id && edge.a.x === edge.b.x);
  expect(jambs.map(edge => edge.a.x).sort()).toEqual([opening.offset, opening.offset + opening.width]);
});

test('direct straight opening handles resize each end independently while retaining metadata and real cutouts', async ({ page }, info) => {
  const source = await importFixture(page); await page.locator('.spatial-object-list button').filter({ hasText: 'Door 1' }).click();
  await resize(page, 'start', { x: .5, z: 0 }); await revision(page, 2);
  let opening = (await saved(page)).document.floors[0].openings[0]; expect(opening.offset).toBeCloseTo(.5, 6); expect(opening.offset + opening.width).toBeCloseTo(3, 6);
  await resize(page, 'end', { x: 4.25, z: 0 }); await revision(page, 3);
  const result = (await saved(page)).document; opening = result.floors[0].openings[0]; expect(opening.offset).toBeCloseTo(.5, 6); expect(opening.width).toBeCloseTo(3.75, 6);
  expect(opening.provenance.sourceIDs).toEqual(source.floors[0].openings[0].provenance.sourceIDs); expect(opening.kind).toBe('door'); expect(opening.bottom).toBe(0); expect(opening.height).toBe(2.1);
  await page.screenshot({ path: info.outputPath('desktop-opening-resize-handles.png'), fullPage: true });
  const edges = buildScene(result, result.floors[0].id).edges.filter(edge => edge.objectID === opening.id);
  expect(Math.min(...edges.flatMap(edge => [edge.a.x, edge.b.x]))).toBeCloseTo(.5, 6); expect(Math.max(...edges.flatMap(edge => [edge.a.x, edge.b.x]))).toBeCloseTo(4.25, 6);
});

test('direct bent host movement and both resize handles follow full arclength without changing host geometry', async ({ page }) => {
  const source = await importFixture(page, fixture(true));
  await startMove(page, { x: 2.3, z: 0 }, { x: 4, z: 0 });
  const finish = await screen(page, { x: 4, z: 2.3 }); await page.mouse.move(finish.x, finish.y, { steps: 10 }); await page.mouse.up(); await revision(page, 2);
  let opening = (await saved(page)).document.floors[0].openings[0]; expect(opening.offset).toBeCloseTo(6, 6); expect(opening.width).toBe(3);
  const fixedEnd = opening.offset + opening.width;
  await resize(page, 'start', { x: 4, z: 1 }); await revision(page, 3);
  opening = (await saved(page)).document.floors[0].openings[0]; expect(Math.abs(opening.offset - 5)).toBeLessThan(2e-6); expect(opening.offset + opening.width).toBeCloseTo(fixedEnd, 12);
  await resize(page, 'end', { x: 7, z: 4 }); await revision(page, 4);
  const fixedStart = opening.offset;
  const result = (await saved(page)).document; opening = result.floors[0].openings[0]; expect(opening.offset).toBe(fixedStart);
  // Browser pointer coordinates round each endpoint; compare the intended span
  // within two numerical epsilons, while the unchanged endpoint is exact above.
  expect(Math.abs(opening.width - 6)).toBeLessThan(2e-6);
  expect(result.floors[0].walls).toEqual(source.floors[0].walls); expect(result.floors[0].nodes).toEqual(source.floors[0].nodes); expect(result.floors[0].rooms).toEqual(source.floors[0].rooms);
  const edges = buildScene(result, result.floors[0].id).edges.filter(edge => edge.objectID === opening.id);
  const hostPath = wallPath(result.floors[0], result.floors[0].walls[0]);
  for (const point of [pathPoint(hostPath, opening.offset), pathPoint(hostPath, opening.offset + opening.width)]) {
    expect(edges.some(edge => edge.a.x === point.x && edge.a.z === point.z)).toBe(true);
  }
});

test('direct opening overlap and crossing an end reject without revision; valid movement clamps at wall bounds', async ({ page }) => {
  const source = await importFixture(page);
  await startMove(page, { x: 1.6, z: 0 }, { x: 4.6, z: 0 }); await expect(page.locator('[data-opening-object=opening-main]')).toHaveAttribute('data-opening-preview', 'invalid');
  await page.mouse.up(); await expect(page.getByRole('alert')).toContainText('overlaps another opening'); await revision(page, 1); expect((await saved(page)).document).toEqual(source);
  await resize(page, 'end', { x: 5.5, z: 0 }); await expect(page.getByRole('alert')).toContainText('overlaps another opening'); expect((await saved(page)).document).toEqual(source);
  await resize(page, 'start', { x: 3.5, z: 0 }); await expect(page.getByRole('alert')).toContainText('Keep the two opening ends apart'); expect((await saved(page)).document).toEqual(source);
  await startMove(page, { x: 1.6, z: 0 }, { x: -.4, z: 0 }); await page.mouse.up(); await revision(page, 2);
  expect((await saved(page)).document.floors[0].openings[0].offset).toBe(0);
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3); expect((await saved(page)).document.floors).toEqual(source.floors);
});

test('direct opening touch is select-first and resize targets remain separate and at least 44px on a narrow viewport', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const source = await importFixture(page);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await screen(page, { x: 1.6, z: 0 }), end = await screen(page, { x: 2.6, z: 0 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await saved(page)).document).toEqual(source);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-opening-handle]')).toHaveCount(2);
  const boxes = await page.locator('[data-opening-handle]').all(); const centers: Point2[] = [];
  for (const handle of boxes) { const box = (await handle.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(43.99); expect(box.height).toBeGreaterThanOrEqual(43.99); centers.push({ x: box.x + box.width / 2, z: box.y + box.height / 2 }); }
  expect(Math.hypot(centers[1].x - centers[0].x, centers[1].z - centers[0].z)).toBeGreaterThanOrEqual(55.99);
  await page.screenshot({ path: info.outputPath('narrow-opening-handles.png'), fullPage: true });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 3 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 3 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await revision(page, 2);
  expect((await saved(page)).document.floors[0].openings[0].offset).toBeCloseTo(2, 6); await cdp.detach();
});

test('direct opening cancellation, lost capture, blur and camera changes fence stale pointer release', async ({ page }) => {
  const source = await importFixture(page);
  for (const interruption of ['escape', 'blur', 'focus-change', 'lost-capture', 'cancel', 'zoom', 'resize']) {
    await startMove(page, { x: 1.6, z: 0 }, { x: 2.4, z: 0 }); await expect(page.locator('[data-opening-preview]')).toHaveCount(1);
    if (interruption === 'escape') await page.keyboard.press('Escape');
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    if (interruption === 'focus-change') await page.keyboard.press('Tab');
    if (interruption === 'lost-capture') { await page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement) => svg.releasePointerCapture(1)); await page.mouse.move(600, 400); }
    if (interruption === 'cancel') await page.getByRole('button', { name: 'Cancel opening edit', exact: true }).dispatchEvent('click');
    if (interruption === 'zoom') await page.getByRole('button', { name: 'Zoom in', exact: true }).dispatchEvent('click');
    if (interruption === 'resize') await page.setViewportSize({ width: 1400, height: 960 });
    await expect(page.locator('[data-opening-preview]')).toHaveCount(0); await page.mouse.up();
    expect((await saved(page)).document).toEqual(source); await revision(page, 1);
  }
  await startMove(page, { x: 1.6, z: 0 }, { x: 2.4, z: 0 }); await page.mouse.up(); await revision(page, 2);
});

test('direct opening pinch and revoked authority cannot persist a held correction', async ({ page, context }) => {
  const source = await importFixture(page); const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await page.locator('.spatial-object-list button').filter({ hasText: 'Door 1' }).click();
  const start = await screen(page, { x: 1.6, z: 0 }), end = await screen(page, { x: 2.4, z: 0 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
  await expect(page.locator('[data-opening-preview]')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...end, id: 1 }, { x: end.x + 80, y: end.y + 80, id: 2 }] });
  await expect(page.locator('[data-opening-preview]')).toHaveCount(0); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); expect((await saved(page)).document).toEqual(source); await cdp.detach();
  await page.goto('/tests/ui/authority.html'); await page.getByRole('button', { name: 'Open example' }).click(); await revision(page, 1);
  const before = (await saved(page, 'synthetic-authority-browser-test-1')).document;
  await startMove(page, { x: 4, z: 1.3 }, { x: 4, z: 2 }); await expect(page.locator('[data-opening-preview]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Revoke synthetic authority', exact: true }).dispatchEvent('click'); await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Workspace access is unavailable', exact: true })).toBeVisible();
  expect((await saved(page, 'synthetic-authority-browser-test-1')).document).toEqual(before); await expect(page.locator('.spatial-plan')).toHaveCount(0);
});

test('opening projection rejects short hosts, preserves vertical separation and cannot jump between nearby nonadjacent spans', () => {
  const document = fixture(), floor = document.floors[0], opening = floor.openings[0], source = structuredClone(floor);
  const disjoint = { ...opening, bottom: 0, height: .5 };
  const overlapFloor = { ...floor, openings: [disjoint, floor.openings[1]] };
  const allowed = openingDragPreview(overlapFloor, beginOpeningDrag(overlapFloor, disjoint, 'move', { x: 1.5, z: 0 }), { x: 5.5, z: 0 });
  expect(allowed.error).toBeUndefined(); expect(allowed.opening.offset).toBe(5);
  const short = structuredClone(floor); short.nodes[1].point.x = .5;
  expect(() => beginOpeningDrag(short, opening, 'move', { x: 1, z: 0 })).toThrow(/too short/);
  const bent = fixture(true).floors[0]; bent.nodes.slice(0, 4).forEach((node, i) => { node.point = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: .2 }, { x: 0, z: .2 }][i]; });
  bent.openings = [{ ...opening, offset: .5, width: 1 }];
  const drag = beginOpeningDrag(bent, bent.openings[0], 'move', { x: 1, z: 0 });
  let preview = openingDragPreview(bent, drag, { x: 1, z: .2 });
  expect(preview.opening.offset).toBeCloseTo(.5, 6);
  const narrow = { ...opening, width: 1 };
  const adjacentGrab = beginOpeningDrag(floor, narrow, 'move', { x: 2.2, z: .1 });
  expect(openingDragPreview(floor, adjacentGrab, { x: 2.25, z: .1 }).opening.offset).toBeCloseTo(1.05, 10);
  expect(openingDragPreview(floor, adjacentGrab, { x: 2.3, z: .1 }).opening.offset).toBeCloseTo(1.1, 10);
  const atEnd = beginOpeningDrag(floor, opening, 'move', { x: 1.5, z: 0 });
  expect(openingDragPreview({ ...floor, openings: [opening] }, atEnd, { x: 20, z: 0 }).opening.offset).toBe(6);
  const segmented = freshDocument('Segmented host').floors[0];
  segmented.nodes = Array.from({ length: 9 }, (_, i) => ({ id: `segment-${i}`, point: { x: i, z: 0 } }));
  segmented.walls = [{ ...floor.walls[0], nodeIDs: segmented.nodes.map(node => node.id) }];
  segmented.openings = [{ ...opening, offset: .2, width: .5 }];
  const coarse = beginOpeningDrag(segmented, segmented.openings[0], 'move', { x: .3, z: 0 });
  const fine = beginOpeningDrag(segmented, segmented.openings[0], 'move', { x: .3, z: 0 });
  const oneEvent = openingDragPreview(segmented, coarse, { x: 4.3, z: 0 });
  let manyEvents = { opening: segmented.openings[0] };
  for (let i = 1; i <= 20; i++) manyEvents = openingDragPreview(segmented, fine, { x: .3 + 4 * i / 20, z: 0 });
  expect(oneEvent.opening.offset).toBeCloseTo(4.2, 10); expect(manyEvents.opening.offset).toBeCloseTo(oneEvent.opening.offset, 10);
  for (let i = 0; i < 10; i++) preview = openingDragPreview(bent, drag, { x: 1, z: .2 });
  expect(preview.opening.offset).toBeCloseTo(.5, 6);
  const handles = openingResizeHandles(floor, { ...opening, width: .0001 }, .02); expect(Math.hypot(handles[1].center.x - handles[0].center.x, handles[1].center.z - handles[0].center.z) / .02).toBeCloseTo(56, 6);
  expect(floor).toEqual(source);
});

test('explicitly selected narrow opening body moves its opening instead of the nearby host corner', async ({ page }) => {
  const source = fixture(); source.floors[0].openings[0] = { ...source.floors[0].openings[0], offset: .1, width: .2 };
  await importFixture(page, source); await page.locator('.spatial-object-list button').filter({ hasText: 'Door 1' }).click();
  await startMove(page, { x: .15, z: 0 }, { x: .65, z: 0 }); await page.mouse.up(); await revision(page, 2);
  const result = (await saved(page)).document.floors[0];
  expect(result.openings[0].offset).toBeCloseTo(.6, 6); expect(result.openings[0].width).toBe(.2); expect(result.nodes).toEqual(source.floors[0].nodes); expect(result.walls).toEqual(source.floors[0].walls);
});

test('directly moved and resized windows keep their identity and cannot become walking portals', async ({ page }) => {
  const source = syntheticDocument(), floor = source.floors[0];
  floor.openings[0] = { ...floor.openings[0], kind: 'window', bottom: .8, height: 1 };
  await importFixture(page, source);
  await startMove(page, { x: 4, z: 1.3 }, { x: 4, z: 1.8 }); await page.mouse.up(); await revision(page, 2);
  await resize(page, 'end', { x: 4, z: 2.7 }); await revision(page, 3);
  const document = (await saved(page)).document, result = document.floors[0].openings[0];
  expect(result).toMatchObject({ id: 'door-a', kind: 'window', wallID: 'w6', bottom: .8, height: 1, provenance: { ...floor.openings[0].provenance, origin: 'edited' } });
  const navigation = new WalkNavigation(document, floor.id);
  expect(navigation.portals.some(portal => portal.openingID === result.id)).toBe(false);
  expect(navigation.restrictions.find(item => item.openingID === result.id)?.reason).toContain('Windows are not walk portals');
  await page.getByRole('button', { name: '3D model', exact: true }).click(); await expect(page.locator('.spatial-inspector h2')).toHaveText('Window 1');
  await page.getByRole('button', { name: 'Walk through', exact: true }).click(); const canvas = page.locator('.spatial-model-canvas canvas');
  for (let i = 0; i < 18; i++) await canvas.press('w');
  await expect(page.getByRole('combobox', { name: 'Start in', exact: true })).toHaveValue('room-a'); await expect(page.locator('.spatial-model-message')).toContainText('Movement stopped');
});
