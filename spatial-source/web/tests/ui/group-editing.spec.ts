import { expect, test, type Page } from '@playwright/test';
import { syntheticDocument } from '../../src/ui/geometry';
import type { StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });
const title = 'Synthetic connected group correction';
async function saved(page: Page): Promise<StoredWorkspace> {
  return page.evaluate(async () => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore('auxilium-spatial-local-v1');
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  });
}
async function fixture(page: Page) {
  const document = syntheticDocument(); document.title = title;
  await page.goto('/'); await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-group.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }); await revision(page, 1);
  return document;
}
async function revision(page: Page, value: number) { await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${value}`); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); }
async function screen(page: Page, x: number, z: number) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, point) => {
    const p = svg.createSVGPoint(); p.x = point.x; p.y = point.z; const screen = p.matrixTransform(svg.getScreenCTM()!); return { x: screen.x, y: screen.y };
  }, { x, z });
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await screen(page, ...from), b = await screen(page, ...to);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 });
}
async function group(page: Page) { await page.getByRole('button', { name: 'Select a group', exact: true }).click(); }
async function allWalls(page: Page) {
  await group(page); await page.getByRole('combobox', { name: 'Group object type', exact: true }).selectOption({ label: 'Walls' });
  await drag(page, [-0.4, -0.4], [8.4, 4.4]); await expect(page.locator('[data-group-marquee]')).toBeVisible(); await page.mouse.up();
  await expect(page.locator('.spatial-group-count')).toContainText('7 objects selected');
}

test('marquee and pointer group movement save one correction, move shared corners once and retain both-renderer selection', async ({ page }, info) => {
  const before = await fixture(page); await allWalls(page);
  await drag(page, [2, 0], [3, .5]); await expect(page.locator('[data-group-preview="unchecked"]')).toBeVisible(); await expect(page.locator('.spatial-plan')).toContainText('Release to validate');
  expect((await saved(page)).document).toEqual(before); await page.mouse.up(); await revision(page, 2);
  const result = (await saved(page)).document, oldFloor = before.floors[0], floor = result.floors[0];
  expect(floor.nodes.map(item => item.id)).toEqual(oldFloor.nodes.map(item => item.id));
  for (const node of floor.nodes) { const prior = oldFloor.nodes.find(item => item.id === node.id)!; expect(node.point.x).toBeCloseTo(prior.point.x + 1, 5); expect(node.point.z).toBeCloseTo(prior.point.z + .5, 5); }
  expect(floor.rooms).toEqual(oldFloor.rooms); expect(floor.openings).toEqual(oldFloor.openings); expect(floor.walls.map(item => [item.id, item.nodeIDs])).toEqual(oldFloor.walls.map(item => [item.id, item.nodeIDs]));
  await expect(page.locator('.spatial-group-count')).toContainText('7 objects selected');
  await page.screenshot({ path: info.outputPath('group-plan-saved.png'), fullPage: true });
  await page.getByRole('button', { name: '3D model', exact: true }).click(); const canvas = page.locator('.spatial-model-canvas canvas'); await expect(canvas).toHaveAttribute('data-rendered', 'true');
  await expect(canvas).toHaveAttribute('data-selected-ids', JSON.stringify(floor.walls.map(item => item.id).sort())); await page.screenshot({ path: info.outputPath('group-model-selected.png'), fullPage: true });
  await page.getByRole('button', { name: /Undo/ }).click(); await revision(page, 3); expect((await saved(page)).document.floors).toEqual(before.floors); await expect(canvas).toHaveAttribute('data-selected-ids', JSON.stringify(floor.walls.map(item => item.id).sort()));
  await page.getByRole('button', { name: /Redo/ }).click(); await revision(page, 4); expect((await saved(page)).document.floors).toEqual(result.floors);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: title }).click(); await revision(page, 4); expect((await saved(page)).document.floors).toEqual(result.floors);
});

test('keyboard group adjustment exposes shared neighbors and moves a shared corner exactly once', async ({ page }) => {
  const before = await fixture(page); await group(page);
  await page.locator('.spatial-object-list').getByRole('button', { name: '╱ Wall 1', exact: true }).click();
  await page.locator('.spatial-object-list').getByRole('button', { name: '╱ Wall 2', exact: true }).click();
  await expect(page.locator('.spatial-group-count')).toContainText('2 objects selected');
  await page.getByLabel('Horizontal group shift', { exact: true }).fill('0.5');
  await expect(page.locator('.spatial-inspector')).toContainText('2 rooms');
  await page.getByRole('button', { name: 'Apply group move', exact: true }).click(); await revision(page, 2);
  const floor = (await saved(page)).document.floors[0];
  for (const id of ['n0', 'n1', 'n2']) expect(floor.nodes.find(item => item.id === id)!.point.x).toBe(before.floors[0].nodes.find(item => item.id === id)!.point.x + .5);
  for (const id of ['n3', 'n4', 'n5']) expect(floor.nodes.find(item => item.id === id)).toEqual(before.floors[0].nodes.find(item => item.id === id));
  await expect(page.locator('.spatial-group-count')).toContainText('2 objects selected');
  await page.getByRole('button', { name: 'Clear group selection', exact: true }).click(); await expect(page.locator('.spatial-group-count')).toHaveCount(0);
});

test('unsupported opening-only and invalid whole-group adjustments do not mutate any saved geometry', async ({ page }) => {
  const before = await fixture(page); await group(page);
  await page.locator('.spatial-object-list').getByRole('button', { name: '⌑ Door 1', exact: true }).click(); await page.getByLabel('Horizontal group shift', { exact: true }).fill('1');
  await expect(page.locator('.spatial-inspector')).toContainText('Select the whole host wall'); await expect(page.getByRole('button', { name: 'Apply group move', exact: true })).toBeDisabled();
  expect((await saved(page)).document).toEqual(before);
  await page.getByRole('button', { name: 'Clear group selection', exact: true }).click(); await allWalls(page); await page.getByLabel('Horizontal group shift', { exact: true }).fill('10000');
  await expect(page.getByRole('button', { name: 'Apply group move', exact: true })).toBeDisabled(); expect((await saved(page)).document).toEqual(before);
  await page.getByLabel('Horizontal group shift', { exact: true }).fill('1'); await page.getByRole('button', { name: 'Apply group move', exact: true }).click(); await revision(page, 2);
});

test('additive group controls and narrow keyboard adjustment remain reachable and operate on the real saved geometry', async ({ page }, info) => {
  const before = await fixture(page); await group(page); await page.getByRole('combobox', { name: 'Group object type', exact: true }).selectOption({ label: 'Walls' });
  await drag(page, [-.4, -.4], [4.4, .3]); await page.mouse.up(); await expect(page.locator('.spatial-group-count')).toContainText('1 object selected');
  await page.getByRole('button', { name: 'Add to group', exact: true }).click(); await drag(page, [4.4, -.4], [8.4, 4.4]); await page.mouse.up();
  await expect(page.locator('.spatial-group-count')).toContainText('2 objects selected');
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Text size', exact: true }).click(); await page.getByRole('button', { name: '200% text', exact: true }).click(); await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('.spatial-mobile-tabs')).toHaveCSS('position', 'static');
  await page.getByLabel('Vertical group shift', { exact: true }).fill('0.25');
  for (const name of ['Apply group move', 'Clear group selection']) { await page.getByRole('button', { name, exact: true }).scrollIntoViewIfNeeded(); const bounds = (await page.getByRole('button', { name, exact: true }).boundingBox())!; expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); await page.screenshot({ path: info.outputPath('group-narrow-keyboard.png'), fullPage: true });
  await page.getByRole('button', { name: 'Apply group move', exact: true }).click(); await revision(page, 2); expect((await saved(page)).document.floors).not.toEqual(before.floors);
});

test('selection is cleared across floors and host profiles without leaking stale group identities', async ({ page }) => {
  await fixture(page); await allWalls(page); await page.getByRole('button', { name: 'Manage floors', exact: true }).click(); await page.getByLabel('New floor name', { exact: true }).fill('Upper synthetic floor'); await page.getByRole('button', { name: '+ Add empty floor', exact: true }).click(); await revision(page, 2);
  await page.locator('.spatial-floor-picker select').selectOption({ label: 'Upper synthetic floor' }); await expect(page.locator('.spatial-group-count')).toHaveCount(0);
  await page.goto('/tests/ui/authority.html'); await page.getByRole('button', { name: /Open example/ }).click(); await allWalls(page);
  await page.getByRole('button', { name: 'Switch synthetic profile', exact: true }).click(); await expect(page.locator('.spatial-group-count')).toHaveCount(0); await expect(page.locator('.spatial-project-card')).toHaveCount(0);
});

test('concurrent group correction retains one pending revision and cannot overwrite a newer saved layout', async ({ page, context }) => {
  await fixture(page); const other = await context.newPage(); await other.goto('/'); await other.locator('.spatial-project-card').filter({ hasText: title }).click(); await revision(other, 1);
  await allWalls(page); await page.getByLabel('Horizontal group shift', { exact: true }).fill('1');
  await other.getByRole('button', { name: 'Manage floors', exact: true }).click(); await other.getByLabel('Current floor name', { exact: true }).fill('Latest other-tab floor'); await other.getByRole('button', { name: 'Save floor', exact: true }).click(); await revision(other, 2);
  const latest = (await saved(other)).document; await page.getByRole('button', { name: 'Apply group move', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Unsaved correction'); await expect(page.getByRole('alert')).toContainText('revision-conflict'); expect((await saved(page)).document).toEqual(latest);
  await page.getByRole('button', { name: 'Reopen latest saved', exact: true }).click(); await revision(page, 2); expect((await saved(page)).document).toEqual(latest); await expect(page.locator('.spatial-group-count')).toHaveCount(0); await other.close();
});
