import { expect, test, type Page } from '@playwright/test';
import { syntheticDocument } from '../../src/ui/geometry';
import type { StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });
async function saved(page: Page, namespace = 'auxilium-spatial-local-v1'): Promise<StoredWorkspace> {
  return page.evaluate(async namespace => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore(namespace);
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  }, namespace);
}
async function point(page: Page, x: number, z: number) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, point) => {
    const value = svg.createSVGPoint(); value.x = point.x; value.y = point.z; const result = value.matrixTransform(svg.getScreenCTM()!); return { x: result.x, y: result.y };
  }, { x, z });
}
async function tap(page: Page, x: number, z: number) { const target = await point(page, x, z); await page.mouse.click(target.x, target.y); }
async function held(page: Page, from: [number, number], to: [number, number]) {
  const a = await point(page, ...from), b = await point(page, ...to); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 });
}
async function fixture(page: Page, duplicateWall = false) {
  const document = syntheticDocument(); document.title = 'Group gesture synthetic';
  if (duplicateWall) document.floors[0].walls.push({ ...structuredClone(document.floors[0].walls[0]), id: 'coincident-unconnected-wall' });
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-group-gesture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  await page.getByRole('button', { name: 'Select a group', exact: true }).click(); await page.getByRole('combobox', { name: 'Group object type', exact: true }).selectOption({ label: 'Walls' });
  return document;
}
async function allWalls(page: Page) {
  await held(page, [-.3, -.3], [8.3, 4.3]); await page.mouse.up(); await expect(page.locator('.spatial-group-count')).toContainText('7 objects selected');
}

test('invalid shared-wall pointer correction is explicitly unchecked until release rejects it and preserves canonical geometry and group identities', async ({ page }) => {
  const before = await fixture(page); await page.locator('.spatial-object-list').getByRole('button', { name: '╱ Wall 7', exact: true }).click();
  await held(page, [4, 3], [8, 3]); await expect(page.locator('[data-group-preview="unchecked"]')).toBeVisible(); await expect(page.locator('.spatial-canvas-note')).toContainText('Release to validate');
  expect((await saved(page)).document).toEqual(before); await page.mouse.up(); await expect(page.getByRole('alert')).toBeVisible();
  expect((await saved(page)).document).toEqual(before); await expect(page.locator('.spatial-group-count')).toContainText('1 object selected');
  await expect(page.locator('[data-group-preview]')).toHaveCount(0); await expect(page.locator('[data-group-selected="w6"]')).toHaveCount(1);
});

test('group cancel, blur, lost capture and camera changes fence late releases without saving a partial correction', async ({ page }) => {
  const before = await fixture(page); await allWalls(page);
  for (const interruption of ['cancel', 'escape', 'blur', 'lost-capture', 'zoom']) {
    await held(page, [2, 0], [2.5, .4]); await expect(page.locator('[data-group-preview="unchecked"]')).toBeVisible();
    for (const name of ['3D model', 'Manage floors', 'Back to saved layouts']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    if (interruption === 'cancel') await page.getByRole('button', { name: 'Cancel group gesture', exact: true }).dispatchEvent('click');
    if (interruption === 'escape') await page.keyboard.press('Escape');
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    if (interruption === 'lost-capture') { await page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement) => svg.releasePointerCapture(1)); await page.mouse.move(600, 450); }
    if (interruption === 'zoom') await page.getByRole('button', { name: 'Zoom in', exact: true }).dispatchEvent('click');
    await expect(page.locator('[data-group-preview]')).toHaveCount(0); await page.mouse.up(); await page.keyboard.press('Enter');
    expect((await saved(page)).document).toEqual(before); await expect(page.locator('.spatial-group-count')).toContainText('7 objects selected');
  }
  await held(page, [2, 0], [3, .5]); await page.mouse.up(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
});

test('overlapping group targets require a named choice and Shift toggles exact identities without geometry changes', async ({ page }) => {
  const before = await fixture(page, true); await tap(page, 2, 0);
  const chooser = page.getByRole('dialog', { name: 'Choose overlapping object', exact: true }); await expect(chooser).toBeVisible(); await expect(chooser).toContainText('exact object');
  await chooser.getByRole('button', { name: 'Wall 8 wall', exact: true }).click(); await expect(page.locator('[data-group-selected="coincident-unconnected-wall"]')).toHaveCount(1); await expect(page.locator('[data-group-selected="w0"]')).toHaveCount(0);
  await page.keyboard.down('Shift'); await tap(page, 6, 0); await page.keyboard.up('Shift'); await expect(page.locator('.spatial-group-count')).toContainText('2 objects selected');
  await page.keyboard.down('Shift'); await tap(page, 6, 0); await page.keyboard.up('Shift'); await expect(page.locator('.spatial-group-count')).toContainText('1 object selected');
  expect((await saved(page)).document).toEqual(before);
});

test('narrow touch group box then drag makes one correction, while pinch cancels only its transient gesture', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const before = await fixture(page);
  // Zoom is a real user operation, keeping the enclosing rectangle clear of controls.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const a = await point(page, -.3, -.3), b = await point(page, 8.3, 4.3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.spatial-group-count')).toContainText('7 objects selected');
  const from = await point(page, 2, 0), to = await point(page, 3, .5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 2 }] }); await expect(page.locator('[data-group-preview="unchecked"]')).toBeVisible();
  const contacts = await page.locator('.spatial-plan>svg').evaluate((svg, first) => {
    const box = svg.getBoundingClientRect(), original = { x: first.x + 30, y: first.y + 50 };
    const describe = (point: { x: number; y: number }) => { const target = document.elementFromPoint(point.x, point.y); return { point, tag: target?.tagName, label: target?.getAttribute('aria-label'), inSVG: target?.closest('.spatial-plan>svg') === svg }; };
    const second = { x: box.left + box.width * .8, y: box.top + box.height * .2 };
    return { original: describe(original), second: describe(second) };
  }, to);
  await info.attach('pinch-contact-hit-targets', { body: JSON.stringify(contacts, null, 2), contentType: 'application/json' });
  expect(contacts.second.inSVG).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...to, id: 2 }, { ...contacts.second.point, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await expect(page.locator('[data-group-preview]')).toHaveCount(0); expect((await saved(page)).document).toEqual(before);
  const retryFrom = await point(page, 2, 0), retryTo = await point(page, 3, .5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...retryFrom, id: 4 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...retryTo, id: 4 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2'); const moved = (await saved(page)).document;
  for (const node of moved.floors[0].nodes) { const original = before.floors[0].nodes.find(item => item.id === node.id)!; expect(node.point.x).toBeCloseTo(original.point.x + 1, 5); expect(node.point.z).toBeCloseTo(original.point.z + .5, 5); }
  await page.screenshot({ path: info.outputPath('narrow-touch-group-saved.png'), fullPage: true });
  await page.getByRole('button', { name: /Undo/ }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 3'); expect((await saved(page)).document.floors).toEqual(before.floors); await cdp.detach();
});

test('authority replacement during a held group move cannot commit or expose a previous profile selection', async ({ page }) => {
  await page.goto('/tests/ui/authority.html'); await page.getByRole('button', { name: /^Open example/ }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
  const before = (await saved(page, 'synthetic-authority-browser-test-1')).document;
  await page.getByRole('button', { name: 'Select a group', exact: true }).click(); await page.getByRole('combobox', { name: 'Group object type', exact: true }).selectOption({ label: 'Walls' }); await allWalls(page);
  await held(page, [2, 0], [3, .5]); await expect(page.locator('[data-group-preview="unchecked"]')).toBeVisible();
  await page.getByRole('button', { name: 'Switch synthetic profile', exact: true }).dispatchEvent('click'); await page.mouse.up();
  await expect(page.locator('[data-group-preview]')).toHaveCount(0); await expect(page.locator('.spatial-group-count')).toHaveCount(0); await expect(page.locator('.spatial-project-card')).toHaveCount(0);
  expect((await saved(page, 'synthetic-authority-browser-test-1')).document).toEqual(before);
});

test('Shift selection in Select mode moves the selected group instead of only the wall under the pointer', async ({ page }) => {
  const before = await fixture(page); await page.getByRole('button', { name: 'Select objects', exact: true }).click();
  // The opening on Wall 2 occupies x=5.5..6.4: tap a clear span so this
  // Select-mode test intentionally selects two host walls, not a passage.
  await tap(page, 2, 0); await page.keyboard.down('Shift'); await tap(page, 7.3, 0); await page.keyboard.up('Shift');
  await expect(page.locator('.spatial-group-count')).toContainText('2 objects selected'); await expect(page.getByRole('button', { name: 'Select objects', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await held(page, [2, 0], [2.5, 0]); await expect(page.locator('[data-group-preview="unchecked"]')).toBeVisible(); await page.mouse.up(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  const floor = (await saved(page)).document.floors[0];
  const delta = floor.nodes.find(item => item.id === 'n0')!.point.x - before.floors[0].nodes.find(item => item.id === 'n0')!.point.x;
  // Client/SVG coordinate conversion rounds subpixel mouse coordinates. Check
  // that intended delta at its input precision, then require every shared node
  // to receive that exact same delta once.
  expect(delta).toBeCloseTo(.5, 6);
  for (const id of ['n0', 'n1', 'n2']) expect(floor.nodes.find(item => item.id === id)!.point.x).toBe(before.floors[0].nodes.find(item => item.id === id)!.point.x + delta);
  for (const id of ['n3', 'n4', 'n5']) expect(floor.nodes.find(item => item.id === id)).toEqual(before.floors[0].nodes.find(item => item.id === id));
});

test('a deferred group save owns its pending correction despite Escape and additional late pointer input', async ({ page }) => {
  const before = await fixture(page); await allWalls(page);
  await page.evaluate(async () => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), original = SpatialWebStore.prototype.apply;
    const target = window as unknown as { releaseGroupSave: () => void }, held = new Promise<void>(resolve => { target.releaseGroupSave = resolve; });
    SpatialWebStore.prototype.apply = async function (...args: unknown[]) { await held; return original.apply(this, args); };
  });
  await held(page, [2, 0], [3, .5]); await page.mouse.up(); await expect(page.locator('.spatial-save-state')).toContainText('Working');
  await page.locator('.spatial-plan>svg').focus(); await page.keyboard.press('Escape'); await tap(page, 2, 0);
  expect((await saved(page)).document).toEqual(before); await expect(page.getByRole('button', { name: /Undo/ })).toBeDisabled();
  await page.evaluate(() => { (window as unknown as { releaseGroupSave: () => void }).releaseGroupSave(); });
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2'); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
  const completed = (await saved(page)).document; for (const node of completed.floors[0].nodes) { const original = before.floors[0].nodes.find(item => item.id === node.id)!; expect(node.point.x).toBeCloseTo(original.point.x + 1, 6); expect(node.point.z).toBeCloseTo(original.point.z + .5, 6); }
  await page.getByRole('button', { name: /Undo/ }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 3'); expect((await saved(page)).document.floors).toEqual(before.floors);
});
