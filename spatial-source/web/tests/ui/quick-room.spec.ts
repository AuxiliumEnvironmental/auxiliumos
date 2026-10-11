import { expect, test, type Page } from '@playwright/test';
import { freshDocument } from '../../src/ui/geometry';
import { rectangleRoomCommands } from '../../src/ui/roomDrawing';
import { applyCommands, buildScene, pathPoint, roomBoundary, wallPath, WalkNavigation } from '../../src/core';
import type { SpatialDocument, StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });

async function saved(page: Page): Promise<StoredWorkspace> {
  return page.evaluate(async () => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path);
    const store = new SpatialWebStore('auxilium-spatial-local-v1');
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  });
}
async function screen(page: Page, x: number, z: number) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, point) => {
    const p = svg.createSVGPoint(); p.x = point.x; p.y = point.z;
    const result = p.matrixTransform(svg.getScreenCTM()!); return { x: result.x, y: result.y };
  }, { x, z });
}
async function click(page: Page, x: number, z: number) { const p = await screen(page, x, z); await page.mouse.click(p.x, p.y); }
async function blank(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: '+ New layout', exact: true }).click();
  await page.getByLabel('Layout name').fill('Quick room synthetic drawing'); await page.getByRole('button', { name: 'Create layout', exact: true }).click();
  await revision(page, 1); await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click();
}
async function revision(page: Page, value: number) { await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${value}`); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); }

test('quick room drag makes canonical walls and room atomically, with undo, redo, reopen and the same 3D boundary', async ({ page }, testInfo) => {
  await blank(page); const start = await screen(page, 1, 1), end = await screen(page, 5, 4);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 });
  await expect(page.locator('[data-room-preview]')).toBeVisible(); await expect(page.locator('[data-room-preview]')).toHaveAttribute('fill', 'none');
  await expect(page.locator('.spatial-save-state')).toContainText('Unfinished drawing');
  expect((await saved(page)).document.floors[0].rooms).toEqual([]);
  await page.mouse.up(); await expect(page.locator('[data-room-draft] circle')).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('desktop-room-draft.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2);
  const result = (await saved(page)).document, floor = result.floors[0], room = floor.rooms[0];
  expect(floor.walls).toHaveLength(4); expect(floor.nodes).toHaveLength(4); expect(floor.rooms).toHaveLength(1);
  expect(room.label).toBe('Room 1'); expect(room.boundary.map(ref => ref.wallID)).toEqual(floor.walls.map(wall => wall.id));
  expect(new Set([...floor.nodes, ...floor.walls, ...floor.rooms].map(item => item.id)).size).toBe(9);
  for (let i = 0; i < 4; i++) expect(floor.walls[i].nodeIDs[1]).toBe(floor.walls[(i + 1) % 4].nodeIDs[0]);
  expect(floor.walls.every(wall => wall.provenance.origin === 'edited' && wall.provenance.sourceIDs.length === 0 && wall.heightBasis === 'assumed')).toBe(true);
  await expect(page.getByLabel('Room name', { exact: true })).toHaveValue('Room 1');
  const boundary = roomBoundary(floor, room), scene = buildScene(result, floor.id), floorFace = scene.faces.find(face => face.role === 'floor')!;
  expect(floorFace.objectID).toBe(room.id); expect(floorFace.vertices.map(({ x, z }) => ({ x, z }))).toEqual(boundary);
  expect(scene.faces.filter(face => face.role === 'wall').map(face => face.objectID)).toEqual(floor.walls.map(wall => wall.id));
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3);
  expect((await saved(page)).document.floors[0]).toMatchObject({ walls: [], nodes: [], rooms: [] });
  await page.getByRole('button', { name: /Redo/ }).click(); await revision(page, 4); expect((await saved(page)).document.floors[0]).toEqual(floor);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: 'Quick room synthetic drawing' }).click(); await revision(page, 4);
  expect((await saved(page)).document.floors[0]).toEqual(floor);
  await page.locator('.spatial-object-list').getByRole('button', { name: '▱ Room 1', exact: true }).click();
  await page.getByRole('button', { name: '3D model', exact: true }).click(); await expect(page.locator('.spatial-model-canvas canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Walk through', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Start in', exact: true })).toHaveValue(room.id);
  await expect(page.getByLabel('Room name', { exact: true })).toHaveValue('Room 1');
  await page.screenshot({ path: testInfo.outputPath('desktop-created-room-3d.png'), fullPage: true });
  expect((await saved(page)).document.floors[0]).toEqual(floor);
});

test('quick room two-tap touch interaction fits a narrow viewport and keeps safe action targets', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await blank(page);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const canvas = page.locator('.spatial-plan>svg'), box = (await canvas.boundingBox())!;
  for (const point of [{ x: box.x + box.width * .2, y: box.y + box.height * .35 }, { x: box.x + box.width * .7, y: box.y + box.height * .6 }]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await expect(page.locator('[data-room-draft] circle')).toHaveCount(2);
  for (const name of ['Finish room', 'Remove last drawing point', 'Cancel drawing', 'Zoom in', 'Zoom out']) {
    const button = page.getByRole('button', { name, exact: true }); const bounds = (await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('narrow-touch-room-draft.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2);
  expect((await saved(page)).document.floors[0].rooms).toHaveLength(1); await cdp.detach();
});

test('quick room validation keeps the draft editable and correction saves only one revision', async ({ page }) => {
  await blank(page); await click(page, 1, 1); await click(page, 4, 1);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Choose opposite corners with space between them in both directions');
  await expect(page.locator('[data-room-draft] circle')).toHaveCount(2);
  expect((await saved(page)).document).toMatchObject({ revision: 1, floors: [{ rooms: [], walls: [], nodes: [] }] });
  await click(page, 4, 4); await page.keyboard.press('Enter'); await revision(page, 2);
  expect((await saved(page)).document.floors[0].rooms).toHaveLength(1); await expect(page.locator('[data-room-draft]')).toHaveCount(0);
});

test('quick room contact rejection preserves existing wall and opening while allowing an explicit new rectangle', async ({ page }) => {
  const document = freshDocument('Room contact synthetic fixture'), floor = document.floors[0];
  floor.nodes = [{ id: 'existing-a', point: { x: 2, z: 2 } }, { id: 'existing-b', point: { x: 4, z: 2 } }];
  const provenance = { origin: 'synthetic' as const, sourceIDs: ['synthetic-only'], classificationConfidence: 'unknown' as const };
  floor.walls = [{ id: 'existing-wall', nodeIDs: ['existing-a', 'existing-b'], baseY: 0, height: 2.6, heightBasis: 'synthetic', provenance }];
  floor.openings = [{ id: 'existing-door', wallID: 'existing-wall', kind: 'door', offset: .5, width: 1, bottom: 0, height: 2, provenance }];
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'contact.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }); await revision(page, 1);
  await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click(); await click(page, 1, 1); await click(page, 3, 3);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('touches or crosses an existing wall');
  expect((await saved(page)).document).toEqual(document); await expect(page.locator('[data-room-draft] circle')).toHaveCount(2);
  await click(page, 1.5, 1.5); await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2);
  const savedFloor = (await saved(page)).document.floors[0];
  expect(savedFloor.openings).toEqual(floor.openings); expect(savedFloor.walls[0]).toEqual(floor.walls[0]); expect(savedFloor.nodes.slice(0, 2)).toEqual(floor.nodes);
  expect(savedFloor.rooms).toHaveLength(1); expect(savedFloor.walls).toHaveLength(5);
});

test('quick room geometry rejects interior crossing and nested rooms while explicit boundary contacts reuse topology', () => {
  const document = freshDocument('Synthetic rectangle contacts');
  const base = rectangleRoomCommands(document.floors[0], { x: 2, z: 2 }, { x: 6, z: 6 });
  const occupied = applyCommands(document, base.commands, 1).document, floor = occupied.floors[0], before = structuredClone(floor);
  for (const [a, b] of [
    [{ x: 0, z: 0 }, { x: 4, z: 4 }], // Boundary crossing.
    [{ x: 3, z: 3 }, { x: 5, z: 5 }], // New room inside existing room.
    [{ x: 1, z: 1 }, { x: 7, z: 7 }], // New room encloses existing room.
  ]) expect(() => rectangleRoomCommands(floor, a, b)).toThrow(/existing/);
  for (const [a, b] of [
    [{ x: 2, z: 0 }, { x: 6, z: 2 }], // Exact shared wall.
    [{ x: 3, z: 0 }, { x: 5, z: 2 }], // Partial shared span and two T junctions.
    [{ x: 0, z: 0 }, { x: 2, z: 2 }], // One explicit shared corner.
  ]) {
    const result = applyCommands(occupied, rectangleRoomCommands(floor, a, b).commands, occupied.revision).document;
    expect(result.floors[0].rooms).toHaveLength(2); expect(new WalkNavigation(result, floor.id).portals).toHaveLength(0);
    for (const node of floor.nodes) expect(result.floors[0].nodes.find(item => item.id === node.id)).toEqual(node);
  }
  const openWallFloor = structuredClone(floor); openWallFloor.rooms = []; openWallFloor.walls = [floor.walls[0]]; openWallFloor.nodes = floor.nodes.slice(0, 2);
  expect(() => rectangleRoomCommands(openWallFloor, { x: 1, z: 1 }, { x: 7, z: 3 })).toThrow(/existing/);
  expect(rectangleRoomCommands(openWallFloor, { x: 4, z: 0 }, { x: 5, z: 2 }).commands.some(command => command.type === 'splitWall')).toBe(true);
  openWallFloor.openings = [{ id: 'kept-opening', wallID: floor.walls[0].id, kind: 'door', offset: 1.5, width: 1, bottom: 0, height: 2, provenance: { origin: 'synthetic', sourceIDs: [], classificationConfidence: 'unknown' } }];
  expect(() => rectangleRoomCommands(openWallFloor, { x: 4, z: 0 }, { x: 5, z: 2 })).toThrow(/opening/i);
  const free = rectangleRoomCommands(floor, { x: 11, z: 4 }, { x: 8, z: 1 });
  const result = applyCommands(occupied, free.commands, 2).document;
  expect(result.floors[0].rooms.map(room => room.label)).toEqual(['Room 1', 'Room 2']);
  expect(roomBoundary(result.floors[0], result.floors[0].rooms[1])).toEqual([{ x: 8, z: 1 }, { x: 11, z: 1 }, { x: 11, z: 4 }, { x: 8, z: 4 }]);
  expect(floor).toEqual(before);
});

test('quick room pointer cancellation and pinch abandon only the active gesture and never save phantom geometry', async ({ page, context }) => {
  await blank(page); const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await screen(page, 1, 1), end = await screen(page, 5, 4);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
  await expect(page.locator('[data-room-preview]')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('[data-room-draft]')).toHaveCount(0); await revision(page, 1);
  await click(page, 1, 1); await expect(page.locator('[data-room-draft] circle')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('[data-room-draft] circle')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 3 }, { ...end, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...start, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-room-draft] circle')).toHaveCount(1); expect((await saved(page)).document.floors[0].walls).toEqual([]);
  await click(page, 5, 4); await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2); await cdp.detach();
});

test('quick room Back, cancellation and draft guards do not lose or silently save the room', async ({ page }) => {
  await blank(page); await click(page, 1, 1); await click(page, 4, 4);
  for (const name of ['3D model', 'Back to saved layouts', 'Manage floors', 'Revisions', 'Select objects', 'Draw wall']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove last drawing point', exact: true }).click(); await expect(page.locator('[data-room-draft] circle')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click(); await revision(page, 1); await expect(page.locator('[data-room-draft]')).toHaveCount(0);
  await click(page, 1, 1); await click(page, 4, 4); await page.keyboard.press('Escape'); await revision(page, 1);
  await expect(page.getByRole('button', { name: 'Select objects', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await saved(page)).document.floors[0]).toMatchObject({ walls: [], nodes: [], rooms: [] });
});

test('quick room revision conflict retains one complete pending room and preserves the separately saved layout', async ({ page, context }) => {
  await blank(page);
  const second = await context.newPage(); await second.goto('/'); await second.locator('.spatial-project-card').filter({ hasText: 'Quick room synthetic drawing' }).click();
  await revision(second, 1); // Open before the other tab owns an unfinished recovery checkpoint.
  await click(page, 1, 1); await click(page, 4, 4);
  await second.getByRole('button', { name: 'Manage floors', exact: true }).click(); await second.getByLabel('Current floor name', { exact: true }).fill('Saved in another tab');
  await second.getByRole('button', { name: 'Save floor', exact: true }).click(); await revision(second, 2);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Unsaved correction'); await expect(page.getByRole('alert')).toContainText('revision-conflict');
  await expect(page.locator('[data-room-draft]')).toHaveCount(0); await expect(page.locator('.spatial-plan text')).toContainText(['Room 1']);
  const actual = (await saved(page)).document; expect(actual.revision).toBe(2); expect(actual.floors[0]).toMatchObject({ label: 'Saved in another tab', walls: [], nodes: [], rooms: [] });
  await page.getByRole('button', { name: 'Reopen latest saved', exact: true }).click(); await revision(page, 2); expect((await saved(page)).document).toEqual(actual);
  await second.close();
});

test('quick room Finish stays disabled and Enter cannot save stale corners during a held touch adjustment', async ({ page, context }) => {
  await blank(page); await click(page, 1, 1); await click(page, 4, 4);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await screen(page, 3, 3), end = await screen(page, 6, 5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
  await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeDisabled();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Finish room', exact: true }).dispatchEvent('click');
  expect((await saved(page)).document).toMatchObject({ revision: 1, floors: [{ walls: [], rooms: [], nodes: [] }] });
  await expect(page.locator('[data-room-draft] circle')).toHaveCount(2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2);
  const points = (await saved(page)).document.floors[0].nodes.map(node => node.point);
  expect(Math.max(...points.map(point => point.x))).toBeCloseTo(6, 6); expect(Math.max(...points.map(point => point.z))).toBeCloseTo(5, 6);
  await cdp.detach();
});

test('quick room visible Cancel fences a held contact so its late release cannot recreate the cancelled room', async ({ page, context }) => {
  await blank(page); await click(page, 1, 1); await click(page, 4, 4);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await screen(page, 3, 3), end = await screen(page, 6, 5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
  // A separate control activation while the original touch is still held.
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click();
  await expect(page.locator('[data-room-draft]')).toHaveCount(0); await revision(page, 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-room-draft]')).toHaveCount(0); await revision(page, 1);
  await click(page, 1, 1); await click(page, 4, 4); await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2);
  expect((await saved(page)).document.floors[0].rooms).toHaveLength(1); await cdp.detach();
});

test('quick room visible Back and Backspace cancel held adjustments before removing the prior corner', async ({ page, context }) => {
  await blank(page); await click(page, 1, 1); await click(page, 4, 4);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await screen(page, 3, 3), end = await screen(page, 6, 5);
  for (const action of ['button', 'keyboard']) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
    if (action === 'button') await page.getByRole('button', { name: 'Remove last drawing point', exact: true }).click();
    else await page.keyboard.press('Backspace');
    await expect(page.locator('[data-room-draft] circle')).toHaveCount(1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('[data-room-draft] circle')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeDisabled();
    expect((await saved(page)).document).toMatchObject({ revision: 1, floors: [{ walls: [], rooms: [], nodes: [] }] });
    await click(page, 4, 4);
  }
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2); await cdp.detach();
});

function adjoiningSource(withWindow = false): SpatialDocument {
  const blank = freshDocument('Connected room gesture synthetic');
  const source = applyCommands(blank, rectangleRoomCommands(blank.floors[0], { x: 0, z: 0 }, { x: 4, z: 4 }).commands, 1).document;
  if (withWindow) source.floors[0].openings.push({ id: 'retained-window', wallID: source.floors[0].walls[1].id, kind: 'window', offset: 1.6, width: .6, bottom: .9, height: 1.2, provenance: { origin: 'synthetic', sourceIDs: ['synthetic-window'], classificationConfidence: 'unknown' } });
  return source;
}
async function importAdjoining(page: Page, source = adjoiningSource()) {
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'adjoining.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }); await revision(page, source.revision);
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  for (let attempt = 0; attempt < 4; attempt++) { const point = await screen(page, 7, 4), box = (await page.locator('.spatial-plan>svg').boundingBox())!; if (point.x <= box.x + box.width - 24 && point.y <= box.y + box.height - 24) break; await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); }
  await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click(); return source;
}
function openingWorld(document: SpatialDocument) {
  const floor = document.floors[0];
  return floor.openings.map(opening => { const path = wallPath(floor, floor.walls.find(wall => wall.id === opening.wallID)!); return { ...opening, wallID: undefined, offset: undefined, start: pathPoint(path, opening.offset), end: pathPoint(path, opening.offset + opening.width) }; });
}

test('adjoining room drag visibly snaps and aligns the full shared wall, with one undo and no portal until explicit door placement', async ({ page }, info) => {
  const source = await importAdjoining(page), start = await screen(page, 4.05, .04), end = await screen(page, 7, 3.94);
  await page.mouse.move(start.x, start.y); await expect(page.locator('[data-room-snap]')).toHaveAttribute('data-room-snap', 'corner');
  await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(page.locator('[data-room-snap]')).toHaveAttribute('data-room-snap', 'alignment'); await expect(page.locator('[data-room-snap-guide]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeDisabled(); expect((await saved(page)).document).toEqual(source);
  await page.screenshot({ path: info.outputPath('desktop-shared-boundary-snap.png'), fullPage: true });
  await page.mouse.up(); await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 3);
  const joined = (await saved(page)).document, floor = joined.floors[0], first = floor.rooms[0], second = floor.rooms[1], host = source.floors[0].walls[1];
  expect(floor.walls).toHaveLength(7); expect(floor.nodes).toHaveLength(6); expect(floor.walls.slice(0, 4)).toEqual(source.floors[0].walls); expect(floor.nodes.slice(0, 4)).toEqual(source.floors[0].nodes);
  const shared = second.boundary.find(ref => ref.wallID === host.id)!; expect(shared).toBeTruthy(); expect(shared.reversed).not.toBe(first.boundary.find(ref => ref.wallID === host.id)!.reversed);
  const corners = roomBoundary(floor, second); expect(Math.min(...corners.map(point => point.z))).toBe(0); expect(Math.max(...corners.map(point => point.z))).toBe(4); expect(Math.min(...corners.map(point => point.x))).toBe(4);
  const scene = buildScene(joined, floor.id); expect(scene.faces.find(face => face.role === 'floor' && face.objectID === second.id)?.vertices.map(({ x, z }) => ({ x, z }))).toEqual(corners);
  const closed = new WalkNavigation(joined, floor.id); expect(closed.portals).toHaveLength(0); expect(closed.move(closed.place({ x: 2, z: 2 }), { x: 6, z: 2 })).toMatchObject({ reachedTarget: false, stop: 'wall' });
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 4); expect((await saved(page)).document.floors).toEqual(source.floors);
  await page.getByRole('button', { name: /Redo/ }).click(); await revision(page, 5); expect((await saved(page)).document.floors).toEqual(joined.floors);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: source.title }).click(); await revision(page, 5);
  await page.getByRole('button', { name: 'Place opening', exact: true }).click(); await click(page, 4, 2); await page.getByRole('button', { name: 'Finish opening', exact: true }).click(); await revision(page, 6);
  const opened = (await saved(page)).document, opening = opened.floors[0].openings[0]; expect(opening.wallID).toBe(host.id); expect(new WalkNavigation(opened, floor.id).portals.map(portal => portal.openingID === opening.id)).toContain(true);
  await page.getByRole('button', { name: '3D model', exact: true }).click(); await expect(page.locator('canvas[data-rendered=true]')).toBeVisible();
  await page.getByRole('combobox', { name: 'Start in', exact: true }).selectOption(first.id); await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  const canvas = page.locator('.spatial-model-canvas canvas'); for (let i = 0; i < 14; i++) await canvas.press('w');
  await expect(page.getByRole('combobox', { name: 'Start in', exact: true })).toHaveValue(second.id); expect((await saved(page)).document).toEqual(opened);
});

test('narrow touch partial boundary snapping preserves existing window world geometry and exposes safe Free placement control', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const source = await importAdjoining(page, adjoiningSource(true));
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const first = await screen(page, 4.06, 1), second = await screen(page, 7, 3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...first, id: 1 }] });
  await expect(page.locator('[data-room-snap]')).toHaveAttribute('data-room-snap', 'boundary');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await expect(page.locator('[data-room-draft] circle')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...second, id: 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeEnabled();
  for (const name of ['Finish room', 'Snap room corners and boundaries', 'Cancel drawing']) { const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390); }
  await page.screenshot({ path: info.outputPath('narrow-partial-boundary-draft.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 3);
  const result = (await saved(page)).document, floor = result.floors[0]; expect(floor.rooms).toHaveLength(2); expect(floor.walls).toHaveLength(9); expect(floor.rooms[0].boundary).toHaveLength(6);
  const originalOpening = openingWorld(source)[0], retained = openingWorld(result)[0];
  expect(retained).toMatchObject({ id: originalOpening.id, kind: originalOpening.kind, width: originalOpening.width, bottom: originalOpening.bottom, height: originalOpening.height, provenance: originalOpening.provenance });
  expect(retained.start.x).toBe(originalOpening.start.x); expect(retained.start.z).toBeCloseTo(originalOpening.start.z, 12); expect(retained.end.z).toBeCloseTo(originalOpening.end.z, 12);
  expect(new WalkNavigation(result, floor.id).portals).toHaveLength(0); expect((await saved(page)).receipt?.mappings.find(mapping => mapping.sourceID === source.floors[0].walls[1].id)?.resultingIDs).toHaveLength(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); await cdp.detach();
});

test('ambiguous room snap targets fail closed and explicit Alt free placement does not merge nearby identities', async ({ page }) => {
  const source = adjoiningSource(); source.floors[0].nodes.push({ id: 'separate-coincident-corner', point: { x: 4, z: 0 } });
  await importAdjoining(page, source); await click(page, 4.05, .03);
  await expect(page.getByRole('alert')).toContainText('Several boundary targets are close'); await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeDisabled(); await expect(page.locator('[data-room-draft] circle')).toHaveCount(0); expect((await saved(page)).document).toEqual(source);
  await page.keyboard.down('Alt'); await click(page, 4.15, .1); await page.keyboard.up('Alt'); await click(page, 6.5, 2.5);
  const completed = await page.locator('[data-room-draft] circle').evaluateAll(nodes => nodes.map(node => [node.getAttribute('cx'), node.getAttribute('cy')]));
  await click(page, 4.02, .02); await expect(page.getByRole('alert')).toContainText('Several boundary targets are close');
  expect(await page.locator('[data-room-draft] circle').evaluateAll(nodes => nodes.map(node => [node.getAttribute('cx'), node.getAttribute('cy')]))).toEqual(completed);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 3);
  const floor = (await saved(page)).document.floors[0]; expect(floor.rooms).toHaveLength(2); expect(floor.walls).toHaveLength(8); expect(floor.nodes.slice(0, source.floors[0].nodes.length)).toEqual(source.floors[0].nodes);
  expect(Math.min(...roomBoundary(floor, floor.rooms[1]).map(point => point.x))).toBeCloseTo(4.15, 6);
});

test('room snap toggle and blur fence held boundary gestures without saving or resurrecting contact geometry', async ({ page, context }) => {
  const source = await importAdjoining(page); const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  for (const interruption of ['toggle', 'blur']) {
    const a = await screen(page, 4.05, .04), b = await screen(page, 7, 3.95);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
    await expect(page.locator('[data-room-preview]')).toHaveCount(1);
    if (interruption === 'toggle') await page.getByRole('button', { name: 'Snap room corners and boundaries', exact: true }).click();
    else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await expect(page.locator('[data-room-draft]')).toHaveCount(0); expect((await saved(page)).document).toEqual(source);
  }
  await expect(page.getByRole('button', { name: 'Snap room corners and boundaries', exact: true })).toHaveAttribute('aria-pressed', 'false'); await cdp.detach();
});

test('room snap and draft action text scales to 200 percent while controls fit a narrow viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await blank(page);
  const wordButtons = ['Snap room corners and boundaries', 'Finish room'];
  const baseFontSizes = await Promise.all(wordButtons.map(name => page.getByRole('button', { name, exact: true }).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))));
  await page.getByRole('button', { name: 'Text size', exact: true }).click(); await page.getByRole('button', { name: '200% text', exact: true }).click();
  await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-large-text', 'true');
  const toggle = page.getByRole('button', { name: 'Snap room corners and boundaries', exact: true });
  for (const enabled of [true, false]) {
    await expect(toggle).toHaveAttribute('aria-pressed', String(enabled));
    for (const name of ['Snap room corners and boundaries', 'Finish room', 'Remove last drawing point', 'Cancel drawing', 'Zoom in', 'Zoom out', 'Fit']) {
      const button = page.getByRole('button', { name, exact: true }), box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    for (let i = 0; i < wordButtons.length; i++) expect(await page.getByRole('button', { name: wordButtons[i], exact: true }).evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(baseFontSizes[i] * 2, 8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    if (enabled) await toggle.click();
  }
  await expect(page.locator('.spatial-canvas-note')).toContainText('Free placement'); await page.screenshot({ path: info.outputPath('narrow-200-percent-room-controls.png'), fullPage: true });
  expect((await saved(page)).document.floors[0].rooms).toEqual([]);
});
