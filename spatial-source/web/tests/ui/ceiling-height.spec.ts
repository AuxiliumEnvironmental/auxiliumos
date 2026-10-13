import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { syntheticDocument } from '../../src/ui/geometry';
import { applyCommands, requireValidDocument } from '../../src/core';
import type { SpatialDocument, StoredWorkspace } from '../../src/types';

// Run this file explicitly with a temporary config that retains the existing
// server/launch settings and includes ceiling-height.spec.ts. The shared config
// is master-owned; this feature does not change its testMatch or dependencies.
test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });
const namespace = 'auxilium-spatial-local-v1';
function fixture(levels = false): SpatialDocument {
  let document = syntheticDocument();
  document.title = 'F03 asymmetric ceiling synthetic fixture';
  const floor = document.floors[0]; floor.id = 'ground'; floor.elevation = 7.25;
  for (const wall of floor.walls) wall.baseY = .2;
  document = applyCommands(document, [
    { type: 'setCeilingHeights', targets: [{ floorID: floor.id, roomID: 'room-a' }], mode: 'absolute', value: 3.2 },
    { type: 'setCeilingHeights', targets: [{ floorID: floor.id, roomID: 'room-b' }], mode: 'absolute', value: 3.8 },
  ], document.revision).document;
  if (levels) { const upper = structuredClone(document.floors[0]); upper.id = 'upper'; upper.label = 'Upper level'; upper.elevation = 14; upper.rooms[1].ceiling = null; document.floors.push(upper); }
  document.revision = 1; delete document.parentRevision;
  return requireValidDocument(document);
}
async function saved(page: Page, scope = namespace): Promise<StoredWorkspace> {
  return page.evaluate(async scope => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore(scope);
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  }, scope);
}
async function revision(page: Page, number: number) {
  await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${number}`);
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
}
async function selectModel(page: Page) {
  const panels = page.getByRole('navigation', { name: 'Workspace panels' });
  if (await panels.isVisible()) await panels.getByRole('button', { name: 'Objects', exact: true }).click();
  await page.locator('.spatial-object-list button').filter({ hasText: 'Living room' }).click();
  if (await panels.isVisible()) await panels.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.getByRole('button', { name: '3D model', exact: true }).click();
  await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible();
}
async function load(page: Page, document = fixture()) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'ceilings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await revision(page, 1); await selectModel(page); return document;
}
async function settings(page: Page) {
  const button = page.getByRole('button', { name: 'View controls', exact: true });
  if (await button.isVisible()) await button.click();
}
async function center(page: Page) {
  const handle = page.getByRole('button', { name: 'Drag ceiling height', exact: true });
  await expect(handle).toBeVisible(); const box = (await handle.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function shot(page: Page, filename: 'ceiling-height-mobile.png' | 'ceiling-structure-desktop.png') {
  const dir = new URL('../../../../docs/11-launch/spatial-feature-program/coordination/handoffs/F03/', import.meta.url);
  await mkdir(fileURLToPath(dir), { recursive: true }); await page.screenshot({ path: fileURLToPath(new URL(filename, dir)), fullPage: true });
}

test('F03 mobile hidden-ceiling touch, exact numeric agreement, cancellation and navigation-only walk', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const source = await load(page);
  await settings(page); await expect(page.getByLabel('Display ceilings', { exact: true })).not.toBeChecked();
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await center(page), end = { x: start.x, y: start.y - 30 };
  const diagnostics = () => page.evaluate(async () => { const path = '/src/ui/rendererDiagnostics.ts'; return (await import(path)).rendererDiagnostics(); });
  const beforeRenderer = (await diagnostics()).active[0].id;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 17 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 17 }] });
  await expect(page.locator('.spatial-model-message')).toContainText('Release to save once');
  expect((await saved(page)).document).toEqual(source); expect((await diagnostics()).active[0].id).toBe(beforeRenderer);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await revision(page, 2);
  const changed = (await saved(page)).document, floor = changed.floors[0];
  expect(floor.rooms[0].ceiling!.height).toBeGreaterThan(source.floors[0].rooms[0].ceiling!.height);
  expect(floor.rooms[1]).toEqual(source.floors[0].rooms[1]); expect(floor.nodes).toEqual(source.floors[0].nodes);
  expect(floor.openings).toEqual(source.floors[0].openings); expect(floor.elevation).toBe(7.25);
  await expect(page.getByLabel('Display ceilings', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await revision(page, 3);
  const controls = page.locator('.spatial-ceiling-model-panel'); await controls.locator('summary').click();
  await controls.getByLabel('Absolute ceiling height (m)', { exact: true }).fill(String(floor.rooms[0].ceiling!.height));
  await controls.getByRole('button', { name: 'Assign selected ceiling heights', exact: true }).click(); await revision(page, 4);
  expect((await saved(page)).document.floors).toEqual(changed.floors); await shot(page, 'ceiling-height-mobile.png');
  await controls.locator('summary').click();
  const cancelStart = await center(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...cancelStart, id: 18 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cancelStart.x, y: cancelStart.y - 20, id: 18 }] });
  await page.keyboard.press('Escape'); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await revision(page, 4);
  expect((await saved(page)).document.floors).toEqual(changed.floors);
  await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Drag ceiling height', exact: true })).toBeHidden();
  await expect(page.locator('.spatial-ceiling-model-panel')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Exit walking', exact: true }).click(); await revision(page, 4); await cdp.detach();
});

test('F03 explicit structure set initializes named unknown member, one undo, reopen and complete archive', async ({ page }) => {
  const source = await load(page, fixture(true)), controls = page.locator('.spatial-ceiling-model-panel');
  await controls.locator('summary').click(); await controls.getByRole('button', { name: 'Structure room set', exact: true }).click();
  const upper = controls.locator('.spatial-ceiling-room-set > div').filter({ has: page.locator('strong', { hasText: 'Upper level' }) });
  await upper.getByRole('checkbox', { name: /Studio:/ }).check();
  await expect(controls.getByRole('button', { name: 'Apply common height change', exact: true })).toBeDisabled();
  await expect(controls).toContainText('Upper level / Studio');
  await controls.getByLabel('Height action', { exact: true }).selectOption('absolute');
  await controls.getByLabel('Absolute ceiling height (m)', { exact: true }).fill('3.6');
  await shot(page, 'ceiling-structure-desktop.png');
  await controls.getByRole('button', { name: 'Assign selected ceiling heights', exact: true }).click(); await revision(page, 2);
  const changed = (await saved(page)).document;
  expect(changed.floors[0].rooms[0].ceiling!.height).toBe(3.6); expect(changed.floors[1].rooms[1].ceiling!.height).toBe(3.6);
  expect(changed.floors[0].rooms[1]).toEqual(source.floors[0].rooms[1]); expect(changed.floors[1].rooms[0]).toEqual(source.floors[1].rooms[0]);
  expect(changed.floors.map(f => f.elevation)).toEqual(source.floors.map(f => f.elevation));
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await revision(page, 3); expect((await saved(page)).document.floors).toEqual(source.floors);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await revision(page, 4); expect((await saved(page)).document.floors).toEqual(changed.floors);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: source.title }).click(); await revision(page, 4);
  const imported = await page.evaluate(async scope => {
    const path = '/src/data/index.ts', { SpatialWebStore, exportRevision, importDocument } = await import(path), store = new SpatialWebStore(scope);
    try { const [entry] = await store.list(), frozen = await store.freeze(entry.documentID, entry.revision), artifact = await exportRevision(frozen, 'local-document'); return await importDocument(artifact.bytes, artifact.filename); } finally { store.close(); }
  }, namespace);
  expect(imported.schemaVersion).toBe('1.3.0'); expect(imported.floors).toEqual(changed.floors);
});

test('F03 coalesced preview and interrupted/stale release cannot overwrite durable geometry', async ({ page }) => {
  const source = await load(page), start = await center(page);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  const result = await page.evaluate(async ({ x, y }) => {
    const path = '/src/ui/rendererDiagnostics.ts', { rendererDiagnostics } = await import(path), handle = document.querySelector('.spatial-ceiling-drag-handle')!;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); const before = rendererDiagnostics().active[0];
    for (let i = 1; i <= 120; i++) handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: x, clientY: y - i / 6 }));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); const after = rendererDiagnostics().active[0];
    return { before, after };
  }, start);
  expect(result.after.id).toBe(result.before.id); expect(result.after.renderFrames - result.before.renderFrames).toBeLessThanOrEqual(2);
  expect((await saved(page)).document).toEqual(source);
  await page.keyboard.press('Escape'); await page.mouse.up(); await revision(page, 1);
  for (const interruption of ['blur', 'cutaway', 'resize']) {
    await settings(page); await page.getByLabel('Cutaway', { exact: true }).uncheck(); const p = await center(page);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x, p.y - 20);
    if (interruption === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    if (interruption === 'cutaway') await page.getByLabel('Cutaway', { exact: true }).evaluate((input: HTMLInputElement) => input.click());
    if (interruption === 'resize') await page.setViewportSize({ width: 1420, height: 980 });
    await page.mouse.up(); expect((await saved(page)).document).toEqual(source);
  }
  await page.getByLabel('Cutaway', { exact: true }).uncheck(); const stale = await center(page);
  await page.mouse.move(stale.x, stale.y); await page.mouse.down(); await page.mouse.move(stale.x, stale.y - 20);
  const external = await page.evaluate(async scope => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore(scope);
    try { const [entry] = await store.list(); return (await store.apply(entry.documentID, entry.revision, [{ type: 'renameRoom', floorID: 'ground', roomID: 'room-b', label: 'Newer external revision' }])).document; } finally { store.close(); }
  }, namespace);
  await page.mouse.up(); await expect(page.locator('.spatial-message-error')).toBeVisible();
  expect((await saved(page)).document).toEqual(external);
});

test('F03 revocation before release preserves the source and closes the authorized view', async ({ page }) => {
  await page.goto('/tests/ui/authority.html'); await page.getByRole('button', { name: /Open example/ }).click(); await revision(page, 1); await selectModel(page);
  const scope = 'synthetic-authority-browser-test-1', before = (await saved(page, scope)).document, p = await center(page);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x, p.y - 20);
  await page.getByRole('button', { name: 'Revoke synthetic authority', exact: true }).dispatchEvent('click'); await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Workspace access is unavailable', exact: true })).toBeVisible();
  expect((await saved(page, scope)).document).toEqual(before);
});
