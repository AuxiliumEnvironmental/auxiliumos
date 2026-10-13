import { expect, test, type Page } from '@playwright/test';
import { syntheticDocument } from '../../src/ui/geometry';
import type { DrawingRecoveryRead } from '../../src/data/drawingRecovery';
import type { StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({ page }) => { page.on('dialog', dialog => void dialog.accept()); });
const title = 'Synthetic unfinished drawing recovery';
async function blank(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: '+ New layout', exact: true }).click();
  await page.getByLabel('Layout name').fill(title); await page.getByRole('button', { name: 'Create layout', exact: true }).click();
  await revision(page, 1);
}
async function revision(page: Page, value: number) { await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${value}`); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); }
async function click(page: Page, x: number, z: number) {
  const point = await screen(page, x, z);
  await page.mouse.click(point.x, point.y);
}
async function screen(page: Page, x: number, z: number) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, point) => {
    const p = svg.createSVGPoint(); p.x = point.x; p.y = point.z; const screen = p.matrixTransform(svg.getScreenCTM()!); return { x: screen.x, y: screen.y };
  }, { x, z });
}
async function state(page: Page, namespace = 'auxilium-spatial-local-v1'): Promise<{ saved: StoredWorkspace; recovery: DrawingRecoveryRead }> {
  return page.evaluate(async namespace => {
    const dataPath = '/src/data/index.ts', recoveryPath = '/src/data/drawingRecovery.ts';
    const { SpatialWebStore } = await import(dataPath), { DrawingRecoveryStore } = await import(recoveryPath), store = new SpatialWebStore(namespace);
    try { const [entry] = await store.list(), saved = await store.open(entry.documentID); return { saved, recovery: await new DrawingRecoveryStore(store, { assertAccess: async () => {}, isCurrent: () => true }).read(saved.document) }; }
    finally { store.close(); }
  }, namespace);
}
async function recoverySaved(page: Page) { await expect(page.locator('.spatial-save-state')).toContainText('recovery saved'); }
async function reopen(page: Page) { await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: title }).click(); }

for (const tool of ['wall', 'area', 'room', 'opening'] as const) {
  test(`${tool} completed samples reopen only after explicit Resume and Finish consumes the checkpoint atomically`, async ({ page }, info) => {
    if (tool === 'opening') {
      const document = syntheticDocument(); document.title = title; document.floors[0].openings = document.floors[0].openings.filter(item => item.id !== 'door-a');
      await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }); await revision(page, 1);
    } else await blank(page);
    const baseline = (await state(page)).saved.document;
    await page.getByRole('button', { name: tool === 'room' ? 'Draw rectangular room' : tool === 'opening' ? 'Place opening' : `Draw ${tool}`, exact: true }).click();
    if (tool === 'opening') await click(page, 4, 2);
    else { await click(page, 1, 1); await click(page, 4, tool === 'room' ? 4 : 1); if (tool === 'area') await click(page, 4, 4); }
    await recoverySaved(page);
    const before = await state(page); expect(before.saved.document).toEqual(baseline); expect(before.recovery.state).toBe('ready');
    if (before.recovery.state === 'none') throw new Error('Expected recovery');
    const record = before.recovery.record;
    await reopen(page); await expect(page.getByRole('dialog', { name: 'Recover unfinished drawing', exact: true })).toBeVisible();
    await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
    expect((await state(page)).saved.document).toEqual(baseline);
    await page.getByRole('button', { name: 'Resume drawing', exact: true }).click(); await recoverySaved(page);
    if (tool !== 'opening') await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(tool === 'area' ? 3 : 2);
    expect((await state(page)).recovery).toMatchObject({ state: 'ready', record: { token: record.token, payload: record.payload } });
    if (tool === 'room') await page.screenshot({ path: info.outputPath('resumed-room.png'), fullPage: true });
    await page.getByRole('button', { name: tool === 'wall' ? 'Finish walls' : `Finish ${tool}`, exact: true }).click(); await revision(page, 2);
    const complete = await state(page); expect(complete.recovery.state).toBe('none'); expect(complete.saved.canUndo).toBe(true);
    const floor = complete.saved.document.floors[0];
    if (tool === 'wall') { expect(floor.walls).toHaveLength(1); if (record.payload.tool === 'wall') expect(floor.nodes.map(item => item.id)).toEqual(record.payload.points.map(item => item.nodeID)); }
    if (tool === 'area') expect(floor.areas).toHaveLength(1);
    if (tool === 'room') { expect(floor.rooms).toHaveLength(1); expect(floor.walls).toHaveLength(4); }
    if (tool === 'opening' && record.payload.tool === 'opening') { const openingID = record.payload.opening.id; expect(floor.openings.some(item => item.id === openingID)).toBe(true); }
    await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3); expect((await state(page)).saved.document.floors).toEqual(baseline.floors);
    await page.getByRole('button', { name: /Redo/ }).click(); await revision(page, 4); expect((await state(page)).saved.document.floors).toEqual(complete.saved.document.floors);
    await reopen(page); await revision(page, 4); await expect(page.getByRole('dialog', { name: 'Recover unfinished drawing', exact: true })).toHaveCount(0);
  });
}

test('explicit Back-to-empty, Cancel and Discard remove only the acknowledged recovery record', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await recoverySaved(page);
  await page.getByRole('button', { name: 'Remove last drawing point', exact: true }).click(); await revision(page, 1); expect((await state(page)).recovery.state).toBe('none');
  await click(page, 1, 1); await click(page, 4, 1); await recoverySaved(page); await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click(); await revision(page, 1); expect((await state(page)).recovery.state).toBe('none');
  await click(page, 1, 1); await recoverySaved(page); await reopen(page); await page.getByRole('button', { name: 'Discard unfinished drawing', exact: true }).click(); await revision(page, 1);
  expect((await state(page)).recovery.state).toBe('none'); expect((await state(page)).saved.document.floors[0].walls).toEqual([]);
});

test('stale recovery offers no Resume and never rebases onto geometry saved by another tab', async ({ page, context }) => {
  await blank(page); const other = await context.newPage(); await other.goto('/'); await other.locator('.spatial-project-card').filter({ hasText: title }).click(); await revision(other, 1);
  await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 4); await recoverySaved(page);
  await other.getByRole('button', { name: 'Manage floors', exact: true }).click(); await other.getByLabel('Current floor name', { exact: true }).fill('Saved in another tab'); await other.getByRole('button', { name: 'Save floor', exact: true }).click(); await revision(other, 2);
  const latest = (await state(page)).saved.document;
  await reopen(page); await expect(page.getByRole('dialog', { name: 'Recover unfinished drawing', exact: true })).toContainText('cannot be resumed onto a different revision');
  await expect(page.getByRole('button', { name: 'Resume drawing', exact: true })).toHaveCount(0); expect((await state(page)).saved.document).toEqual(latest);
  await page.getByRole('button', { name: 'Keep for later', exact: true }).click(); await expect(page.locator('.spatial-project-card')).toBeVisible(); expect((await state(page)).recovery.state).toBe('stale');
  await page.locator('.spatial-project-card').filter({ hasText: title }).click(); await page.getByRole('button', { name: 'Discard unfinished drawing', exact: true }).click(); await revision(page, 2);
  expect((await state(page)).saved.document).toEqual(latest); expect((await state(page)).recovery.state).toBe('none'); await other.close();
});

test('two already-open tabs cannot replace each other\'s unfinished drawing', async ({ page, context }) => {
  await blank(page); const other = await context.newPage(); other.on('dialog', dialog => void dialog.accept()); await other.goto('/'); await other.locator('.spatial-project-card').filter({ hasText: title }).click(); await revision(other, 1);
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1); await recoverySaved(page); const before = (await state(page)).recovery;
  await other.getByRole('button', { name: 'Draw area', exact: true }).click(); await click(other, 2, 2); await expect(other.locator('.spatial-message-error')).toContainText('drawing-recovery-conflict');
  expect((await state(page)).recovery).toEqual(before); expect((await state(page)).saved.document.revision).toBe(1);
  await other.getByRole('button', { name: 'Reopen latest saved', exact: true }).click(); await expect(other.getByRole('dialog', { name: 'Recover unfinished drawing', exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Keep for later', exact: true }).click();
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2); expect((await state(page)).recovery.state).toBe('none'); await other.close();
});

test('quota failure is visible, Finish cannot bypass recovery, and Retry commits only after acknowledgement', async ({ page }) => {
  await blank(page);
  await page.evaluate(() => {
    const target = window as unknown as { failRecovery: boolean }; target.failRecovery = true;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) { if (this.name === 'drawingRecovery' && target.failRecovery) throw new DOMException('Synthetic recovery quota failure', 'QuotaExceededError'); return key === undefined ? original.call(this, value) : original.call(this, value, key); };
  });
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1);
  await expect(page.locator('.spatial-save-state')).toContainText('recovery not saved'); await expect(page.getByRole('button', { name: 'Retry recovery save', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); expect((await state(page)).saved.document.revision).toBe(1); expect((await state(page)).recovery.state).toBe('none');
  await page.evaluate(() => { (window as unknown as { failRecovery: boolean }).failRecovery = false; });
  await page.getByRole('button', { name: 'Retry recovery save', exact: true }).click(); await recoverySaved(page);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2); expect((await state(page)).recovery.state).toBe('none');
});

test('Finish cannot apply old commands while deleting a newer sample that arrived during the acknowledgement wait', async ({ page }) => {
  await blank(page);
  await page.evaluate(async () => {
    const path = '/src/data/drawingRecovery.ts', { DrawingRecoveryStore } = await import(path), original = DrawingRecoveryStore.prototype.save;
    let first = true; const target = window as unknown as { releaseRecovery: () => void };
    const held = new Promise<void>(resolve => { target.releaseRecovery = resolve; });
    DrawingRecoveryStore.prototype.save = async function (...args: unknown[]) { if (first) { first = false; await held; } return original.apply(this, args); };
  });
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finish walls', exact: true })).toBeDisabled();
  await click(page, 4, 4); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.evaluate(() => { (window as unknown as { releaseRecovery: () => void }).releaseRecovery(); });
  await revision(page, 2); const finished = await state(page); expect(finished.saved.document.floors[0].walls).toHaveLength(1); expect(finished.saved.document.floors[0].nodes).toHaveLength(2); expect(finished.recovery.state).toBe('none');
});

test('a later queued acknowledgement clears an earlier transient write failure and permits the exact Finish', async ({ page }) => {
  await blank(page);
  await page.evaluate(async () => {
    const path = '/src/data/drawingRecovery.ts', { DrawingRecoveryStore } = await import(path), original = DrawingRecoveryStore.prototype.save;
    let first = true; const target = window as unknown as { releaseRecovery: () => void };
    const held = new Promise<void>(resolve => { target.releaseRecovery = resolve; });
    DrawingRecoveryStore.prototype.save = async function (...args: unknown[]) { if (first) { first = false; await held; throw new DOMException('Synthetic first write failed', 'QuotaExceededError'); } return original.apply(this, args); };
  });
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1);
  await page.evaluate(() => { (window as unknown as { releaseRecovery: () => void }).releaseRecovery(); }); await recoverySaved(page);
  expect((await state(page)).recovery).toMatchObject({ state: 'ready', record: { payload: { tool: 'wall', points: [{}, {}] } } });
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2); expect((await state(page)).recovery.state).toBe('none');
});

test('Escape cannot erase the recovery token owned by a failed geometry save, and exact Retry stays atomic', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await click(page, 4, 1); await recoverySaved(page);
  const checkpoint = (await state(page)).recovery;
  await page.evaluate(() => {
    const target = window as unknown as { failGeometry: boolean }; target.failGeometry = true;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) { if (this.name === 'drafts' && target.failGeometry) throw new DOMException('Synthetic geometry write failure', 'QuotaExceededError'); return key === undefined ? original.call(this, value) : original.call(this, value, key); };
  });
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Unsaved correction'); await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await page.locator('.spatial-plan>svg').focus(); await page.keyboard.press('Escape');
  expect((await state(page)).recovery).toEqual(checkpoint); expect((await state(page)).saved.document.revision).toBe(1);
  await page.evaluate(() => { (window as unknown as { failGeometry: boolean }).failGeometry = false; });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click(); await revision(page, 2);
  const complete = await state(page); expect(complete.recovery.state).toBe('none'); expect(complete.saved.document.floors[0].walls).toHaveLength(1);
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3); expect((await state(page)).saved.document.floors[0].walls).toEqual([]);
});

test('revoked host authority cannot save a deferred sample or expose it in a replacement profile', async ({ page }) => {
  await page.goto('/tests/ui/authority.html'); await page.getByRole('button', { name: '+ New layout', exact: true }).click(); await page.getByLabel('Layout name').fill(title); await page.getByRole('button', { name: 'Create layout', exact: true }).click(); await revision(page, 1);
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await click(page, 1, 1); await recoverySaved(page);
  const old = await state(page, 'synthetic-authority-browser-test-1');
  await page.getByRole('button', { name: 'Defer next authority check', exact: true }).click(); await click(page, 4, 1);
  await expect(page.getByRole('button', { name: 'Resolve deferred authority', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Revoke synthetic authority', exact: true }).click(); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('heading', { name: 'Workspace access is unavailable', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch synthetic profile', exact: true }).click(); await page.getByRole('button', { name: 'Resolve deferred authority', exact: true }).click();
  await expect(page.locator('.spatial-project-card')).toHaveCount(0); await expect(page.locator('[data-drawing-draft]')).toHaveCount(0);
  expect(await state(page, 'synthetic-authority-browser-test-1')).toEqual(old);
});

test('an interrupted room gesture retains only completed corner samples for recovery', async ({ page }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click(); await click(page, 1, 1); await recoverySaved(page);
  const checkpoint = (await state(page)).recovery, from = await screen(page, 4, 4), to = await screen(page, 5, 5);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 });
  expect((await state(page)).recovery).toEqual(checkpoint); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
  await expect(page.locator('[data-room-draft] circle')).toHaveCount(1); expect((await state(page)).recovery).toEqual(checkpoint);
  await reopen(page); await page.getByRole('button', { name: 'Resume drawing', exact: true }).click(); await expect(page.locator('[data-room-draft] circle')).toHaveCount(1);
  await click(page, 4, 4); await recoverySaved(page); await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2); expect((await state(page)).recovery.state).toBe('none');
});

test('an interrupted opening gesture restores the exact acknowledged placement without checkpointing hover samples', async ({ page }) => {
  const document = syntheticDocument(); document.title = title; document.floors[0].openings = document.floors[0].openings.filter(item => item.id !== 'door-a');
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-opening-interruption.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }); await revision(page, 1);
  await page.getByRole('button', { name: 'Place opening', exact: true }).click(); await click(page, 4, 2); await recoverySaved(page);
  const checkpoint = (await state(page)).recovery; if (checkpoint.state === 'none' || checkpoint.record.payload.tool !== 'opening') throw new Error('Expected opening checkpoint');
  const opening = checkpoint.record.payload.opening, from = await screen(page, 4, 3), to = await screen(page, 4, 2.7);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 }); expect((await state(page)).recovery).toEqual(checkpoint);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up(); expect((await state(page)).recovery).toEqual(checkpoint);
  await reopen(page); await page.getByRole('button', { name: 'Resume drawing', exact: true }).click(); await page.getByRole('button', { name: 'Finish opening', exact: true }).click(); await revision(page, 2);
  const finished = await state(page); expect(finished.saved.document.floors[0].openings.find(item => item.id === opening.id)).toEqual(opening); expect(finished.recovery.state).toBe('none');
});
