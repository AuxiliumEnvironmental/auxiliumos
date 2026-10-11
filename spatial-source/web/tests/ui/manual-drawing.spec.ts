import { expect, test, type Page } from '@playwright/test';
import { freshDocument } from '../../src/ui/geometry';
import type { StoredWorkspace } from '../../src/types';

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
async function move(page: Page, x: number, z: number) { const p = await screen(page, x, z); await page.mouse.move(p.x, p.y); }
async function click(page: Page, x: number, z: number) { const p = await screen(page, x, z); await page.mouse.click(p.x, p.y); }
async function blank(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: '+ New layout', exact: true }).click();
  await page.getByLabel('Layout name').fill('Manual synthetic drawing'); await page.getByRole('button', { name: 'Create layout', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
}
async function revision(page: Page, value: number) { await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${value}`); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); }

test('manual connected wall chain previews snaps and saves once with exact shared IDs, atomic undo and reopen', async ({ page }, testInfo) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  await click(page, 1, 1); await move(page, 4, 1.05);
  await expect(page.locator('[data-drawing-preview=horizontal]')).toBeVisible();
  const line = await page.locator('[data-rubber-band]').getAttribute('points');
  const previewZ = line!.trim().split(' ').map(point => Number(point.split(',')[1]));
  expect(previewZ[0]).toBeCloseTo(1, 6); expect(previewZ[1]).toBe(previewZ[0]);
  await click(page, 4, 1.05); await move(page, 4.07, 4);
  await expect(page.locator('[data-drawing-preview=vertical]')).toBeVisible();
  await click(page, 4.07, 4); await click(page, 1.03, 4); await move(page, 1.04, 1.02);
  await expect(page.locator('[data-drawing-preview=corner]')).toBeVisible();
  await expect(page.locator('[data-drawing-preview] text')).toHaveText('Corner snap');
  await page.screenshot({ path: testInfo.outputPath('desktop-connected-draft.png'), fullPage: true });
  await click(page, 1.04, 1.02);
  expect((await saved(page)).document.floors[0].walls).toHaveLength(0);
  await expect(page.locator('.spatial-save-state')).toContainText('Unfinished drawing');
  await expect(page.locator('.spatial-canvas-note')).toContainText('4 walls in draft');
  await page.keyboard.press('Enter'); await revision(page, 2);
  const result = (await saved(page)).document, floor = result.floors[0];
  expect(floor.walls).toHaveLength(4); expect(floor.nodes).toHaveLength(4);
  for (let i = 0; i < 4; i++) expect(floor.walls[i].nodeIDs[1]).toBe(floor.walls[(i + 1) % 4].nodeIDs[0]);
  expect(floor.walls.every(wall => wall.provenance.origin === 'edited' && wall.heightBasis === 'assumed')).toBe(true);
  for (const [index, expected] of [{ x: 1, z: 1 }, { x: 4, z: 1 }, { x: 4, z: 4 }, { x: 1.03, z: 4 }].entries()) {
    expect(floor.nodes[index].point.x).toBeCloseTo(expected.x, 6); expect(floor.nodes[index].point.z).toBeCloseTo(expected.z, 6);
  }
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3);
  expect((await saved(page)).document.floors[0].walls).toHaveLength(0); expect((await saved(page)).document.floors[0].nodes).toHaveLength(0);
  await page.getByRole('button', { name: /Redo/ }).click(); await revision(page, 4);
  expect((await saved(page)).document.floors[0]).toEqual(floor);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: 'Manual synthetic drawing' }).click(); await revision(page, 4);
  expect((await saved(page)).document.floors[0]).toEqual(floor);
});

test('manual Backspace, Escape and explicit cancellation never create orphan geometry', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  await click(page, 1, 1); await click(page, 4, 1); await click(page, 4, 4);
  await page.keyboard.press('Backspace'); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.keyboard.press('Escape'); await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select objects', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1);
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click(); await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
  const document = (await saved(page)).document; expect(document.revision).toBe(1); expect(document.floors[0].walls).toEqual([]); expect(document.floors[0].nodes).toEqual([]);
});

test('manual invalid area keeps its editable draft until corrected and accepted', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw area', exact: true }).click();
  await click(page, 1, 1); await click(page, 2, 1); await click(page, 4, 1);
  await page.getByRole('button', { name: 'Finish area', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Semantic area must be a simple nonzero polygon');
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(3);
  expect((await saved(page)).document.revision).toBe(1);
  await page.getByRole('button', { name: 'Remove last drawing point', exact: true }).click(); await click(page, 3, 3);
  await page.keyboard.press('Enter'); await revision(page, 2);
  expect((await saved(page)).document.floors[0].areas).toHaveLength(1);
  await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
});

test('manual direct wall and node drags select and correct in one gesture without a prior inspector click', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open example' }).click(); await revision(page, 1);
  const wallStart = await screen(page, 2, 0), wallEnd = await screen(page, 2, -0.4);
  await page.mouse.move(wallStart.x, wallStart.y); await page.mouse.down(); await page.mouse.move(wallEnd.x, wallEnd.y, { steps: 7 });
  await expect(page.locator('.spatial-inspector h2')).toHaveText('Wall 1');
  expect((await saved(page)).document.revision).toBe(1);
  await page.mouse.up(); await revision(page, 2);
  let floor = (await saved(page)).document.floors[0];
  expect(floor.nodes.find(node => node.id === 'n0')!.point.z).toBeCloseTo(-0.4, 6); expect(floor.nodes.find(node => node.id === 'n1')!.point.z).toBeCloseTo(-0.4, 6);
  const nodeStart = await screen(page, 8, 4), nodeEnd = await screen(page, 8.4, 4.2);
  await page.mouse.move(nodeStart.x, nodeStart.y); await page.mouse.down(); await page.mouse.move(nodeEnd.x, nodeEnd.y, { steps: 6 }); await page.mouse.up(); await revision(page, 3);
  floor = (await saved(page)).document.floors[0];
  expect(floor.nodes.find(node => node.id === 'n3')!.point.x).toBeCloseTo(8.4, 6); expect(floor.nodes.find(node => node.id === 'n3')!.point.z).toBeCloseTo(4.2, 6);
  expect(floor.walls.find(wall => wall.id === 'w2')!.nodeIDs).toEqual(['n2', 'n3']); expect(floor.walls.find(wall => wall.id === 'w3')!.nodeIDs).toEqual(['n3', 'n4']);
});

test('manual ambiguous drag never silently chooses the already selected coincident corner', async ({ page }) => {
  const document = freshDocument('Ambiguous direct drag'), floor = document.floors[0];
  floor.nodes = [{ id: 'a', point: { x: 0, z: 0 } }, { id: 'b', point: { x: 3, z: 0 } }, { id: 'c', point: { x: 0, z: 0 } }, { id: 'd', point: { x: 0, z: 3 } }];
  const provenance = { origin: 'synthetic' as const, sourceIDs: [], classificationConfidence: 'unknown' as const };
  floor.walls = [{ id: 'first', nodeIDs: ['a', 'b'], baseY: 0, height: 2.6, heightBasis: 'synthetic', provenance }, { id: 'second', nodeIDs: ['c', 'd'], baseY: 0, height: 2.6, heightBasis: 'synthetic', provenance }];
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'ambiguous.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await page.locator('.spatial-object-list').getByRole('button', { name: '· Corner 1', exact: true }).click();
  const start = await screen(page, 0, 0), initialView = await page.locator('.spatial-plan>svg').getAttribute('viewBox');
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 35, start.y + 28, { steps: 5 }); await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Choose overlapping object' })).toBeVisible();
  expect((await saved(page)).document.floors[0]).toEqual(floor); await expect(page.locator('.spatial-plan>svg')).toHaveAttribute('viewBox', initialView!);
});

test('manual wheel and trackpad zoom remain anchored to the pointer without scrolling the page', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open example' }).click();
  const plan = page.locator('.spatial-plan>svg'), box = (await plan.boundingBox())!;
  const pointer = { x: Math.round(box.x + box.width * .23), y: Math.round(box.y + box.height * .61) };
  const fraction = { x: (pointer.x - box.x) / box.width, y: (pointer.y - box.y) / box.height };
  const atPointer = () => plan.evaluate((svg: SVGSVGElement, anchor) => { const [x, z, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number); return { x: x + width * anchor.x, z: z + height * anchor.y, width }; }, fraction);
  const initial = await atPointer(); await page.mouse.move(pointer.x, pointer.y); await page.mouse.wheel(0, -240);
  await expect.poll(async () => (await atPointer()).width).toBeLessThan(initial.width);
  const enlarged = await atPointer(); expect(enlarged.x).toBeCloseTo(initial.x, 6); expect(enlarged.z).toBeCloseTo(initial.z, 6);
  await page.mouse.wheel(0, 100); await expect.poll(async () => (await atPointer()).width).toBeGreaterThan(enlarged.width);
  const smaller = await atPointer(); expect(smaller.x).toBeCloseTo(initial.x, 6); expect(smaller.z).toBeCloseTo(initial.z, 6);
  expect(await page.evaluate(() => window.scrollY)).toBe(0); expect((await saved(page)).document.revision).toBe(1);
});

test('manual touch cancellation and pinch release do not commit geometry or place stray drawing points', async ({ page, context }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open example' }).click(); await revision(page, 1);
  const cdp = await context.newCDPSession(page), point = await screen(page, 0, 0), initial = (await saved(page)).document;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 9 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 30, y: point.y + 25, id: 9 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await saved(page)).document).toEqual(initial);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.spatial-inspector h2')).toHaveText('Corner 1');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 30, y: point.y + 25, id: 1 }] });
  await expect(page.locator('.spatial-canvas-note')).toHaveText('Release to save this correction');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.spatial-canvas-note')).not.toHaveText('Release to save this correction'); expect((await saved(page)).document).toEqual(initial);
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  const box = (await page.locator('.spatial-plan>svg').boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  const before = await page.locator('.spatial-plan>svg').getAttribute('viewBox');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 50, y, id: 2 }, { x: x + 50, y, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 90, y, id: 2 }, { x: x + 90, y, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: x - 90, y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.spatial-plan>svg')).not.toHaveAttribute('viewBox', before!); await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
  expect((await saved(page)).document).toEqual(initial); await cdp.detach();
});

test('manual backtracking and existing edges are rejected without guessing a wall merge', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  await click(page, 1, 1); await click(page, 4, 1); await click(page, 1, 1);
  await expect(page.getByRole('alert')).toContainText('A wall already follows those corners');
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2);
  const before = (await saved(page)).document.floors[0];
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 4, 1); await click(page, 1, 1);
  await expect(page.getByRole('alert')).toContainText('A wall already follows those corners');
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Finish walls', exact: true })).toBeDisabled();
  expect((await saved(page)).document.floors[0]).toEqual(before);
  await page.keyboard.press('Escape');
});

test('manual chain conflict stays one pending correction and never overwrites the saved draft', async ({ page, context }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  await click(page, 1, 1); await click(page, 4, 1); await click(page, 4, 4);
  const second = await context.newPage(); await second.goto('/'); await second.locator('.spatial-project-card').filter({ hasText: 'Manual synthetic drawing' }).click();
  await second.getByRole('button', { name: 'Manage floors', exact: true }).click(); await second.getByLabel('Current floor name', { exact: true }).fill('Saved elsewhere');
  await second.getByRole('button', { name: 'Save floor', exact: true }).click(); await revision(second, 2);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Unsaved correction'); await expect(page.getByRole('alert')).toContainText('revision-conflict');
  await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Draw wall', exact: true })).toBeDisabled();
  const actual = (await saved(page)).document; expect(actual.revision).toBe(2); expect(actual.floors[0].walls).toHaveLength(0); expect(actual.floors[0].label).toBe('Saved elsewhere');
  await page.getByRole('button', { name: 'Reopen latest saved', exact: true }).click(); await revision(page, 2);
  expect((await saved(page)).document).toEqual(actual); await second.close();
});

test('manual focus loss cancels a drag and fences held contacts until release', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open example' }).click(); await revision(page, 1);
  const initial = (await saved(page)).document, point = await screen(page, 2, 0);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x, point.y - 35, { steps: 4 });
  await expect(page.locator('.spatial-canvas-note')).toHaveText('Release to save this correction');
  // Browser blur notification represents app focus loss; the mouse remains physically held.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.move(point.x + 15, point.y - 55, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('.spatial-canvas-note')).not.toHaveText('Release to save this correction'); expect((await saved(page)).document).toEqual(initial);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x, point.y - 25, { steps: 4 }); await page.mouse.up(); await revision(page, 2);
});

test('manual partial retraces and saved subsegments are rejected but a shared endpoint extension is allowed', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  await click(page, 1, 1); await click(page, 5, 1); await click(page, 3, 1);
  await expect(page.getByRole('alert')).toContainText('A wall already follows those corners'); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2);
  const original = (await saved(page)).document.floors[0];
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 2, 1); await click(page, 4, 1);
  await expect(page.getByRole('alert')).toContainText('A wall already follows those corners'); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(1);
  expect((await saved(page)).document.floors[0]).toEqual(original); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 5, 1); await click(page, 7, 1); await page.keyboard.press('Enter'); await revision(page, 3);
  const extended = (await saved(page)).document.floors[0]; expect(extended.walls).toHaveLength(2); expect(extended.nodes).toHaveLength(3); expect(extended.walls[1].nodeIDs[0]).toBe(original.walls[0].nodeIDs[1]);
});

test('manual unfinished drawing guards views, floors, closing and history until explicit finish or cancel', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1); await page.keyboard.press('Enter'); await revision(page, 2);
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 4, 1); await click(page, 4, 4);
  await expect(page.locator('.spatial-save-state')).toContainText('Unfinished drawing');
  for (const name of ['3D model', 'Back to saved layouts', 'Auxilium Spatial saved layouts', 'Manage floors', 'Revisions', 'Select objects']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'FLOOR', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: /Undo/ })).toBeDisabled(); await expect(page.getByRole('button', { name: /Export/ })).toBeDisabled();
  await page.keyboard.press('Control+z'); expect((await saved(page)).document.revision).toBe(2); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await expect(page.getByRole('button', { name: 'Finish walls', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click(); await revision(page, 2);
  await expect(page.getByRole('button', { name: '3D model', exact: true })).toBeEnabled(); await expect(page.getByRole('combobox', { name: 'FLOOR', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 4, 1); await click(page, 4, 4); await page.keyboard.press('Enter'); await revision(page, 3);
  await expect(page.getByRole('button', { name: '3D model', exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Back to saved layouts', exact: true })).toBeEnabled();
});

test('manual focus reentry accepts a fresh touch after an old terminal event was lost', async ({ page, context }) => {
  await page.addInitScript(() => {
    const suppress = (event: Event) => { if ((window as unknown as { dropPointerEnd?: boolean }).dropPointerEnd) event.stopImmediatePropagation(); };
    window.addEventListener('pointercancel', suppress, true); window.addEventListener('pointerup', suppress, true);
  });
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  const cdp = await context.newCDPSession(page), start = await screen(page, 1, 1), end = await screen(page, 4, 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 5 }] });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  // Drop terminal notifications as can happen while the app is not executing.
  await page.evaluate(() => { (window as unknown as { dropPointerEnd: boolean }).dropPointerEnd = true; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.evaluate(() => { (window as unknown as { dropPointerEnd: boolean }).dropPointerEnd = false; window.dispatchEvent(new Event('focus')); });
  await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 6 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: end.x, y: end.y, id: 7 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2); expect((await saved(page)).document.floors[0].walls).toHaveLength(1); await cdp.detach();
});

test('manual narrow drawing actions have safe reachable targets and finish the same saved transaction', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await blank(page);
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  const box = (await page.locator('.spatial-plan>svg').boundingBox())!;
  await page.mouse.click(box.x + box.width * .3, box.y + box.height * .4); await page.mouse.click(box.x + box.width * .7, box.y + box.height * .4);
  for (const name of ['Finish walls', 'Remove last drawing point', 'Cancel drawing', 'Zoom in']) {
    const button = page.getByRole('button', { name, exact: true });
    expect(await button.evaluate(element => { const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && !!hit && element.contains(hit); })).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-connected-draft.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2); expect((await saved(page)).document.floors[0].walls).toHaveLength(1);
});

test('manual authority loss removes an unfinished draft and leaves the next principal usable', async ({ page }) => {
  await page.goto('/tests/ui/authority.html'); await page.getByRole('button', { name: 'Open example' }).click();
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 0, 0); await click(page, -1, -1);
  await expect(page.locator('.spatial-save-state')).toContainText('Unfinished drawing');
  await page.getByRole('button', { name: 'Revoke synthetic authority' }).click(); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Workspace access is unavailable' })).toBeVisible(); await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch synthetic profile', exact: true }).click(); await page.getByRole('button', { name: 'Open example' }).click();
  await expect(page.getByRole('button', { name: 'Draw wall', exact: true })).toBeEnabled(); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
});

test('manual Space and middle-button pan preserve the connected draft and clear on focus loss', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1);
  const plan = page.locator('.spatial-plan>svg'), draft = page.locator('[data-drawing-draft]>polyline'), originalPoints = await draft.getAttribute('points');
  const box = (await plan.boundingBox())!, x = box.x + box.width * .6, y = box.y + box.height * .55;
  const initialView = await plan.getAttribute('viewBox');
  await page.keyboard.down('Space'); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 70, y + 35, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Space');
  await expect(plan).not.toHaveAttribute('viewBox', initialView!); await expect(draft).toHaveAttribute('points', originalPoints!); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  const middleView = await plan.getAttribute('viewBox');
  await page.mouse.move(x, y); await page.mouse.down({ button: 'middle' }); await page.mouse.move(x - 40, y - 15, { steps: 6 }); await page.mouse.up({ button: 'middle' });
  await expect(plan).not.toHaveAttribute('viewBox', middleView!); await expect(draft).toHaveAttribute('points', originalPoints!); expect((await saved(page)).document.floors[0].walls).toHaveLength(0);
  await page.keyboard.down('Space'); await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await click(page, 4, 4); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(3); await page.keyboard.up('Space');
  expect(await page.evaluate(() => window.scrollY)).toBe(0); await page.keyboard.press('Enter'); await revision(page, 2);
  const floor = (await saved(page)).document.floors[0]; expect(floor.walls).toHaveLength(2); expect(floor.nodes).toHaveLength(3); expect(floor.walls[0].nodeIDs[1]).toBe(floor.walls[1].nodeIDs[0]);
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 3);
  await page.keyboard.down('Space'); await page.keyboard.press('Tab'); await expect(plan).not.toBeFocused(); await page.keyboard.up('Space');
  await click(page, 3, 3); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click(); await revision(page, 2); expect((await saved(page)).document.floors[0]).toEqual(floor);
});
