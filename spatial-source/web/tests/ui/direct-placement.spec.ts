import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticDocument, freshDocument } from '../../src/ui/geometry';
import { previewOpeningPlacement } from '../../src/ui/openingPlacement';
import { applyCommands, buildScene, pathPoint, wallPath, WalkNavigation } from '../../src/core';
import type { OpeningKind, Point2, StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });

function fixture() {
  const document = syntheticDocument(); document.title = 'Direct placement synthetic';
  document.floors[0].openings = document.floors[0].openings.filter(opening => opening.id !== 'door-a');
  return document;
}
function bentFixture() {
  const document = freshDocument('Bent placement synthetic'), floor = document.floors[0];
  floor.nodes = [[0, 0], [4, 0], [4, 4], [8, 4], [8, 8], [0, 8]].map(([x, z], index) => ({ id: `n${index}`, point: { x, z } }));
  floor.walls = [['n0', 'n1', 'n2', 'n3'], ['n3', 'n4'], ['n4', 'n5'], ['n5', 'n0']].map((nodeIDs, index) => ({ id: `w${index}`, nodeIDs, baseY: 0, height: 2.6, heightBasis: 'synthetic', provenance: { origin: 'synthetic' as const, sourceIDs: ['synthetic'], classificationConfidence: 'unknown' as const } }));
  floor.rooms = [{ id: 'bent-room', label: 'Bent room', boundary: floor.walls.map(wall => ({ wallID: wall.id, reversed: false })) }];
  return document;
}
async function saved(page: Page, namespace = 'auxilium-spatial-local-v1'): Promise<StoredWorkspace> {
  return page.evaluate(async namespace => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore(namespace);
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  }, namespace);
}
async function screen(page: Page, point: Point2) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, point) => {
    const p = svg.createSVGPoint(); p.x = point.x; p.y = point.z;
    const screen = p.matrixTransform(svg.getScreenCTM()!); return { x: screen.x, y: screen.y };
  }, point);
}
async function click(page: Page, point: Point2) { const target = await screen(page, point); await page.mouse.click(target.x, target.y); }
async function revision(page: Page, value: number) { await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${value}`); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); }
async function imported(page: Page, document = fixture()) {
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'placement.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await revision(page, 1); return document;
}
async function tool(page: Page, kind: OpeningKind = 'door') {
  await page.getByRole('button', { name: 'Place opening', exact: true }).click();
  await page.getByRole('combobox', { name: 'New opening type', exact: true }).selectOption(kind);
}
async function start(page: Page, from: Point2, to: Point2) {
  const a = await screen(page, from), b = await screen(page, to);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 });
}

test('direct door placement creates one saved cutout with undo, redo, reopen, exact export and a working room portal', async ({ page }, info) => {
  const source = await imported(page); await tool(page);
  await start(page, { x: 4, z: 1 }, { x: 4, z: 2 });
  await expect(page.locator('[data-opening-placement]')).toHaveAttribute('data-opening-placement', 'valid');
  await expect(page.getByRole('button', { name: 'Finish opening', exact: true })).toBeDisabled();
  expect((await saved(page)).document).toEqual(source);
  await page.mouse.up(); await expect(page.getByRole('button', { name: 'Finish opening', exact: true })).toBeEnabled();
  const draftID = await page.locator('[data-opening-placement]').getAttribute('data-placement-id');
  await page.getByRole('combobox', { name: 'New opening type', exact: true }).selectOption('passage');
  await click(page, { x: 4, z: 1.8 }); await click(page, { x: 4, z: 2 });
  await page.getByRole('combobox', { name: 'New opening type', exact: true }).selectOption('door');
  await expect(page.locator('[data-opening-placement]')).toHaveAttribute('data-placement-id', draftID!); expect((await saved(page)).document).toEqual(source);
  await page.screenshot({ path: info.outputPath('desktop-door-placement.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish opening', exact: true }).click(); await revision(page, 2);
  const result = (await saved(page)).document, floor = result.floors[0], created = floor.openings.at(-1)!;
  expect(created).toMatchObject({ id: draftID, kind: 'door', wallID: 'w6', width: .9, bottom: 0, height: 2.1, provenance: { origin: 'edited', sourceIDs: [], classificationConfidence: 'unknown' } });
  expect(created.offset).toBeCloseTo(1.55, 6); expect(floor.walls).toEqual(source.floors[0].walls); expect(floor.nodes).toEqual(source.floors[0].nodes); expect(floor.rooms).toEqual(source.floors[0].rooms);
  await expect(page.locator('.spatial-inspector h2')).toHaveText('Door 3');
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3); expect((await saved(page)).document.floors).toEqual(source.floors);
  await page.getByRole('button', { name: /Redo/ }).click(); await revision(page, 4); expect((await saved(page)).document.floors).toEqual(result.floors);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: source.title }).click(); await revision(page, 4);
  const reopened = (await saved(page)).document;
  await page.getByRole('button', { name: /Export/ }).click(); await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('geometry');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
  const downloaded = await download, exportPath = info.outputPath(downloaded.suggestedFilename()); await downloaded.saveAs(exportPath);
  expect(JSON.parse(await readFile(exportPath, 'utf8'))).toEqual(reopened);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.spatial-object-list button').filter({ hasText: 'Door 3' }).click(); await page.getByRole('button', { name: '3D model', exact: true }).click();
  await expect(page.locator('.spatial-inspector h2')).toHaveText('Door 3'); await expect(page.locator('canvas[data-rendered=true]')).toBeVisible();
  const scene = buildScene(reopened, floor.id), hostPath = wallPath(floor, floor.walls.find(wall => wall.id === created.wallID)!);
  for (const end of [created.offset, created.offset + created.width]) { const point = pathPoint(hostPath, end); expect(scene.edges.some(edge => edge.objectID === created.id && edge.a.x === point.x && edge.a.z === point.z)).toBe(true); }
  const navigation = new WalkNavigation(reopened, floor.id); expect(navigation.portals.some(portal => portal.openingID === created.id)).toBe(true);
  await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  const canvas = page.locator('.spatial-model-canvas canvas'); for (let index = 0; index < 14; index++) await canvas.press('w');
  await expect(page.getByRole('combobox', { name: 'Start in', exact: true })).toHaveValue('room-b');
  await page.screenshot({ path: info.outputPath('desktop-created-door-walk.png'), fullPage: true });
  await page.getByRole('button', { name: 'Exit walking', exact: true }).click(); expect((await saved(page)).document).toEqual(reopened);
});

test('narrow touch places a window with safe controls and preserves non-portal behavior in 3D', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const source = await imported(page); await tool(page, 'window');
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const point = await screen(page, { x: 4, z: 2 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  await expect(page.getByRole('button', { name: 'Finish opening', exact: true })).toBeDisabled();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-opening-placement]')).toHaveAttribute('data-opening-placement', 'valid'); expect((await saved(page)).document).toEqual(source);
  for (const control of [page.getByRole('combobox', { name: 'New opening type', exact: true }), page.getByRole('button', { name: 'Finish opening', exact: true }), page.getByRole('button', { name: 'Cancel opening', exact: true })]) {
    const box = (await control.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390); expect(box.y + box.height).toBeLessThanOrEqual(844);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('narrow-touch-window-placement.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish opening', exact: true }).click(); await revision(page, 2); await cdp.detach();
  const result = (await saved(page)).document, floor = result.floors[0], opening = floor.openings.at(-1)!;
  expect(opening).toMatchObject({ kind: 'window', wallID: 'w6', bottom: .9, height: 1.2 });
  const navigation = new WalkNavigation(result, floor.id);
  expect(navigation.portals.some(portal => portal.openingID === opening.id)).toBe(false);
  expect(navigation.move(navigation.place({ x: 2, z: 2 }), { x: 6, z: 2 })).toMatchObject({ reachedTarget: false, stop: 'wall', crossedPortalIDs: [] });
  await page.getByRole('button', { name: '3D model', exact: true }).click(); await expect(page.locator('canvas[data-rendered=true]')).toBeVisible();
  await page.getByRole('button', { name: 'Walk through', exact: true }).click(); const canvas = page.locator('.spatial-model-canvas canvas');
  // With no accepted portal, this square room initially faces its first corner.
  // Turn toward the new shared-wall window, then attempt to cross its center.
  for (let index = 0; index < 20; index++) await canvas.press('ArrowRight');
  for (let index = 0; index < 30; index++) await canvas.press('w');
  await expect(page.getByRole('combobox', { name: 'Start in', exact: true })).toHaveValue('room-a'); await expect(page.locator('.spatial-model-message')).toContainText('Movement stopped');
  expect((await saved(page)).document).toEqual(result);
});

test('passage placement on a bent host preserves arclength, canonical vertices and bend navigation restriction', async ({ page }) => {
  const source = await imported(page, bentFixture()); await tool(page, 'passage'); await click(page, { x: 4, z: .2 });
  await expect(page.locator('[data-opening-placement]')).toHaveAttribute('data-opening-placement', 'valid');
  await page.keyboard.press('Enter'); await revision(page, 2);
  const document = (await saved(page)).document, floor = document.floors[0], opening = floor.openings[0];
  expect(opening.kind).toBe('passage'); expect(opening.wallID).toBe('w0'); expect(opening.offset).toBeCloseTo(3.75, 6); expect(opening.width).toBe(.9);
  expect(floor.walls).toEqual(source.floors[0].walls); expect(floor.nodes).toEqual(source.floors[0].nodes); expect(floor.rooms).toEqual(source.floors[0].rooms);
  const edges = buildScene(document, floor.id).edges.filter(edge => edge.objectID === opening.id);
  expect(edges.some(edge => edge.a.x === 4 && edge.a.z === 0 || edge.b.x === 4 && edge.b.z === 0)).toBe(true);
  expect(new WalkNavigation(document, floor.id).portals.some(portal => portal.openingID === opening.id)).toBe(false);
});

test('overlap, wall-end and low-wall previews reject without mutation and recover to a valid placement', async ({ page }) => {
  const source = fixture(), floor = source.floors[0]; floor.walls[0].height = .8;
  await imported(page, source); await tool(page);
  await click(page, { x: 2, z: 4 }); await expect(page.locator('.spatial-canvas-note')).toContainText('overlaps another opening');
  await expect(page.getByRole('button', { name: 'Finish opening', exact: true })).toBeDisabled(); await page.keyboard.press('Enter'); expect((await saved(page)).document).toEqual(source);
  await click(page, { x: 2, z: 0 }); await expect(page.locator('.spatial-canvas-note')).toContainText('too low');
  await expect(page.locator('[data-opening-placement]')).toHaveAttribute('data-opening-placement', 'invalid'); expect((await saved(page)).document).toEqual(source);
  await click(page, { x: 4, z: .1 });
  const chooser = page.getByRole('dialog', { name: 'Choose overlapping object', exact: true });
  if (await chooser.isVisible()) await chooser.getByRole('button', { name: 'Wall 7 wall', exact: true }).click();
  await expect(page.locator('.spatial-canvas-note')).toContainText('farther from the wall ends'); await page.keyboard.press('Enter'); expect((await saved(page)).document).toEqual(source);
  await click(page, { x: 4, z: 2 }); await page.getByRole('button', { name: 'Finish opening', exact: true }).click(); await revision(page, 2);
  expect((await saved(page)).document.floors[0].openings).toHaveLength(source.floors[0].openings.length + 1);
});

test('overlapping wall targets require an explicit host choice and never infer connected rooms', async ({ page }) => {
  const source = fixture(), floor = source.floors[0]; floor.walls.push({ ...structuredClone(floor.walls[6]), id: 'separate-wall' });
  await imported(page, source); await tool(page); await click(page, { x: 4, z: 2 });
  const dialog = page.getByRole('dialog', { name: 'Choose overlapping object', exact: true }); await expect(dialog).toBeVisible(); await expect(dialog).toContainText('Choose the wall that owns this opening');
  expect((await saved(page)).document).toEqual(source); await expect(page.locator('[data-opening-placement]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Wall 8 wall', exact: true }).click();
  await expect(page.locator('[data-opening-placement]')).toHaveAttribute('data-placement-wall', 'separate-wall');
  await page.getByRole('button', { name: 'Finish opening', exact: true }).click(); await revision(page, 2);
  const result = (await saved(page)).document, created = result.floors[0].openings.at(-1)!;
  expect(created.wallID).toBe('separate-wall'); expect(result.floors[0].walls).toEqual(floor.walls); expect(result.floors[0].rooms).toEqual(floor.rooms);
  const navigation = new WalkNavigation(result, floor.id); expect(navigation.portals.some(portal => portal.openingID === created.id)).toBe(false); expect(navigation.restrictions.find(item => item.openingID === created.id)?.reason).toContain('does not connect two explicitly modeled rooms');
});

test('cancel, blur, Escape, lost capture and camera changes fence a held placement and its late release', async ({ page }) => {
  const source = await imported(page);
  for (const interruption of ['cancel', 'blur', 'escape', 'lost-capture', 'zoom', 'resize']) {
    if (await page.getByRole('button', { name: 'Place opening', exact: true }).getAttribute('aria-pressed') !== 'true') await tool(page);
    await start(page, { x: 4, z: 1 }, { x: 4, z: 2 }); await expect(page.locator('[data-opening-placement]')).toHaveCount(1);
    await page.keyboard.press('Enter'); expect((await saved(page)).document).toEqual(source);
    if (interruption === 'cancel') await page.getByRole('button', { name: 'Cancel opening', exact: true }).dispatchEvent('click');
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    if (interruption === 'escape') await page.keyboard.press('Escape');
    if (interruption === 'lost-capture') { await page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement) => svg.releasePointerCapture(1)); await page.mouse.move(600, 400); }
    if (interruption === 'zoom') await page.getByRole('button', { name: 'Zoom in', exact: true }).dispatchEvent('click');
    if (interruption === 'resize') await page.setViewportSize({ width: 1400, height: 960 });
    await expect(page.locator('[data-opening-placement]')).toHaveCount(0); await page.mouse.up(); await page.keyboard.press('Enter');
    await expect(page.locator('[data-opening-placement]')).toHaveCount(0); await revision(page, 1); expect((await saved(page)).document).toEqual(source);
  }
  await click(page, { x: 4, z: 2 }); await page.getByRole('button', { name: 'Finish opening', exact: true }).click(); await revision(page, 2);
});

test('touch pinch, authority loss and floor selection cannot commit an abandoned opening', async ({ page, context }) => {
  const source = fixture(); source.floors.push({ ...structuredClone(source.floors[0]), id: 'second-floor', label: 'Upper floor', elevation: 3 });
  await imported(page, source); await tool(page); const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const point = await screen(page, { x: 4, z: 2 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] }); await expect(page.locator('[data-opening-placement]')).toHaveCount(1);
  await expect(page.locator('.spatial-floor-picker select')).toBeDisabled();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }, { x: point.x + 60, y: point.y + 60, id: 2 }] }); await expect(page.locator('[data-opening-placement]')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('.spatial-floor-picker select').selectOption('second-floor'); await page.keyboard.press('Enter'); await revision(page, 1); expect((await saved(page)).document).toEqual(source); await cdp.detach();
  await page.goto('/tests/ui/authority.html'); await page.getByRole('button', { name: 'Open example' }).click(); await revision(page, 1);
  const before = (await saved(page, 'synthetic-authority-browser-test-1')).document; await tool(page); await click(page, { x: 4, z: 2.6 });
  await expect(page.locator('[data-opening-placement]')).toHaveAttribute('data-opening-placement', 'valid');
  await page.getByRole('button', { name: 'Revoke synthetic authority', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: 'Finish opening', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace access is unavailable', exact: true })).toBeVisible();
  expect((await saved(page, 'synthetic-authority-browser-test-1')).document).toEqual(before);
});

test('revision conflict keeps one explicit pending cutout without overwriting another saved revision', async ({ page, context }) => {
  const source = await imported(page);
  const other = await context.newPage(); await other.goto('/'); await other.locator('.spatial-project-card').filter({ hasText: source.title }).click();
  await revision(other, 1); // Open before this tab owns an unfinished recovery checkpoint.
  await tool(page); await click(page, { x: 4, z: 2 });
  const draftID = await page.locator('[data-opening-placement]').getAttribute('data-placement-id');
  await other.getByRole('button', { name: 'Manage floors', exact: true }).click(); await other.getByLabel('Current floor name', { exact: true }).fill('Retained second-tab floor');
  await other.getByRole('button', { name: 'Save floor', exact: true }).click(); await revision(other, 2);
  await page.getByRole('button', { name: 'Finish opening', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Unsaved correction'); await expect(page.getByRole('alert')).toContainText('revision-conflict');
  await expect(page.locator('[data-opening-placement]')).toHaveCount(0); await expect(page.locator(`[data-opening-object="${draftID}"]`)).toHaveCount(1);
  const actual = (await saved(page)).document; expect(actual.revision).toBe(2); expect(actual.floors[0].label).toBe('Retained second-tab floor'); expect(actual.floors[0].openings).toEqual(source.floors[0].openings);
  await page.getByRole('button', { name: 'Reopen latest saved', exact: true }).click(); await revision(page, 2); await expect(page.locator(`[data-opening-object="${draftID}"]`)).toHaveCount(0);
  expect((await saved(page)).document).toEqual(actual); await other.close();
});

test('placement helper uses full path length and rejects nonfinite, overlapping and out-of-bounds starter shapes without mutation', () => {
  const source = fixture(), floor = source.floors[0], original = structuredClone(floor);
  expect(() => previewOpeningPlacement(floor, 'missing', 'door', { x: 4, z: 2 }, 'new')).toThrow(/existing wall/);
  expect(() => previewOpeningPlacement(floor, 'w6', 'door', { x: NaN, z: 2 }, 'new')).toThrow(/existing wall/);
  expect(previewOpeningPlacement(floor, 'w6', 'door', { x: 4, z: 0 }, 'new').error).toContain('wall ends');
  expect(previewOpeningPlacement(floor, 'w4', 'window', { x: 2, z: 4 }, 'new').error).toContain('overlaps');
  const candidate = previewOpeningPlacement(floor, 'w6', 'passage', { x: 4, z: 2 }, 'new'); expect(candidate.error).toBeUndefined();
  const accepted = applyCommands(source, [{ type: 'addOpening', floorID: floor.id, opening: candidate.opening }], 1).document;
  const navigation = new WalkNavigation(accepted, floor.id); expect(navigation.move(navigation.place({ x: 2, z: 2 }), { x: 6, z: 2 })).toMatchObject({ reachedTarget: true, crossedPortalIDs: ['new'], position: { roomID: 'room-b' } });
  const bent = bentFixture().floors[0], placed = previewOpeningPlacement(bent, 'w0', 'window', { x: 6, z: 4 }, 'bend-new'); expect(placed.opening.offset).toBeCloseTo(9.55, 10);
  const long = structuredClone(floor); long.nodes[0].point.x = -10000; long.nodes[1].point.x = 10000;
  expect(previewOpeningPlacement(long, 'w0', 'door', { x: 8000, z: 0 }, 'far-opening').error).toContain('supported opening range');
  expect(floor).toEqual(original);
});
