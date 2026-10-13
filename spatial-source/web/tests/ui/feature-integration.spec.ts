import { expect, test, type Page } from '@playwright/test';
import { fixture } from '../core/fixtures';
import type { StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1050 } });

async function saved(page: Page): Promise<StoredWorkspace> {
  return page.evaluate(async () => {
    const path = '/src/data/store.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore('auxilium-spatial-local-v1');
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  });
}
async function revision(page: Page, n: number) {
  await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${n}`);
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
}
async function panel(page: Page, name: 'Objects' | 'Layout' | 'Details') {
  const nav = page.getByRole('navigation', { name: 'Workspace panels' });
  if (await nav.isVisible()) await nav.getByRole('button', { name, exact: true }).click();
}
async function room(page: Page) {
  await panel(page, 'Objects');
  await page.locator('.spatial-object-list button').filter({ hasText: 'Assessment area' }).first().click();
}
async function point(page: Page, x: number, z: number) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, p) => {
    const q = svg.createSVGPoint(); q.x = p.x; q.y = p.z;
    const screen = q.matrixTransform(svg.getScreenCTM()!); return { x: screen.x, y: screen.y };
  }, { x, z });
}
async function dragPlan(page: Page, a: [number, number], b: [number, number]) {
  await panel(page, 'Layout');
  const from = await point(page, ...a), to = await point(page, ...b);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
}
async function coverage(page: Page, id: string) {
  return page.evaluate(async id => {
    const sp = '/src/data/store.ts', ap = '/src/core/affectedAreas.ts', gp = '/src/core/affectedAreaGeometry.ts';
    const { SpatialWebStore } = await import(sp), { visibleAffectedAreas } = await import(ap), { domainArea } = await import(gp);
    const store = new SpatialWebStore('auxilium-spatial-local-v1');
    try { const [entry] = await store.list(), { document } = await store.open(entry.documentID); return visibleAffectedAreas(document, document.floors[0].id, false).filter((p: { areaID: string }) => p.areaID === id).reduce((n: number, p: { domain: unknown }) => n + domainArea(p.domain), 0); } finally { store.close(); }
  }, id);
}

test('combined opening, ceiling, fixture, hole and observation workflow survives mobile editing and exact backup', async ({ page }, info) => {
  test.setTimeout(150_000);
  page.setDefaultTimeout(12_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const original = fixture(); original.title = 'Combined field workflow'; original.floors[0].elevation = 3;
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'combined-source.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original)) });
  let r = 1; await revision(page, r);
  await page.locator('.spatial-object-list button').filter({ hasText: 'Door 1' }).click();
  await page.getByLabel('Catalog style', { exact: true }).selectOption('door_single'); await revision(page, ++r);
  await page.getByRole('button', { name: 'Flip horizontally', exact: true }).click(); await revision(page, ++r);
  const styled = (await saved(page)).document.floors[0].openings;
  await room(page);
  await page.locator('.spatial-inspector').getByLabel('Absolute ceiling height (m)', { exact: true }).fill('3.2');
  await page.locator('.spatial-inspector').getByRole('button', { name: 'Assign selected ceiling heights', exact: true }).click(); await revision(page, ++r);
  expect((await saved(page)).document.floors[0].rooms[1].ceiling!.height).toBe(2.6);
  await page.getByRole('button', { name: '+ Fixture', exact: true }).click();
  await page.getByLabel('Fixture catalog').selectOption('built-in-shelves');
  await page.getByRole('button', { name: 'Place fixture', exact: true }).click();
  const position = await point(page, .8, 2.9); await page.mouse.click(position.x, position.y); await revision(page, ++r);
  await page.getByLabel('Fixture height (m)').fill('2.8');
  await page.getByRole('button', { name: 'Apply fixture dimensions', exact: true }).click(); await revision(page, ++r);
  await page.getByRole('button', { name: '+ Cutout', exact: true }).click();
  await page.getByLabel('Cutout surface').selectOption(JSON.stringify({ floorID: 'floor-1', kind: 'floor', roomID: 'room-a' }));
  await page.getByLabel('Cutout profile', { exact: true }).selectOption('circle');
  await page.getByRole('button', { name: 'Place cutout', exact: true }).click();
  const hole = await point(page, 2, 2); await page.mouse.click(hole.x, hole.y); await revision(page, ++r);
  await page.getByLabel('Cutout diameter (m)').fill('.6');
  await page.getByRole('button', { name: 'Apply cutout dimensions', exact: true }).click(); await revision(page, ++r);
  for (const [surface, kind] of [['Floor, room-a', 'Record moisture'], ['Ceiling, room-a', 'Record fire damage']] as const) {
    await room(page); await page.getByRole('button', { name: 'Affected area', exact: true }).click();
    await page.getByLabel('Affected surface', { exact: true }).selectOption({ label: surface });
    await page.getByRole('button', { name: kind, exact: true }).click();
    await dragPlan(page, [.3, .3], [3.7, 3.7]); await revision(page, ++r);
  }
  const recorded = (await saved(page)).document, moisture = recorded.affectedAreas!.find(a => a.kind === 'moisture')!;
  const beforeCoverage = await coverage(page, moisture.id);
  await page.screenshot({ path: info.outputPath('combined-plan-desktop.png'), fullPage: true });
  await room(page);
  await page.locator('.spatial-inspector').getByLabel('Absolute ceiling height (m)', { exact: true }).fill('3.5');
  await page.locator('.spatial-inspector').getByRole('button', { name: 'Assign selected ceiling heights', exact: true }).click(); await revision(page, ++r);
  await page.locator('.spatial-object-group').filter({ has: page.getByRole('heading', { name: 'Cutouts', exact: true }) }).getByRole('button').first().click();
  await page.getByLabel('Cutout center u (m)').fill('3');
  await page.getByRole('button', { name: 'Apply cutout dimensions', exact: true }).click(); await revision(page, ++r);
  expect(await coverage(page, moisture.id)).toBeLessThan(beforeCoverage - .1);
  await page.getByRole('button', { name: 'Delete cutout', exact: true }).click(); await revision(page, ++r);
  expect(await coverage(page, moisture.id)).toBeCloseTo(beforeCoverage, 7);
  const removed = (await saved(page)).document;
  expect(removed.affectedAreas![0].recordedSupport).toEqual(moisture.recordedSupport);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await revision(page, ++r);
  expect((await saved(page)).document.floors[0].cutouts).toHaveLength(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await revision(page, ++r);
  expect((await saved(page)).document.floors).toEqual(removed.floors);
  expect((await saved(page)).document.affectedAreas).toEqual(removed.affectedAreas);
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: original.title }).click(); await revision(page, r);
  const archive = await page.evaluate(async () => {
    const dp = '/src/data/index.ts', bp = '/src/data/bytes.ts', zp = '/src/data/zip.ts';
    const data = await import(dp), bytes = await import(bp), { readZIP } = await import(zp), store = new data.SpatialWebStore('auxilium-spatial-local-v1');
    try {
      const [entry] = await store.list(), frozen = await store.freeze(entry.documentID, entry.revision);
      const out = await data.exportRevision(frozen, 'local-document'), received = await data.importDocument(out.bytes, out.filename);
      return { document: received, exact: bytes.stableJSON(received) === bytes.stableJSON(frozen.document), hash: await bytes.sha256(bytes.jsonBytes(received)), frozenHash: frozen.hash, members: Object.keys(readZIP(out.bytes)) };
    } finally { store.close(); }
  });
  expect(archive.exact).toBe(true); expect(archive.hash).toBe(archive.frozenHash);
  expect(archive.document.schemaVersion).toBe('1.5.0'); expect(archive.document.floors[0].openings).toEqual(styled);
  for (const suffix of ['.svg', '.png', '.pdf', '.glb']) expect(archive.members.some(p => p.endsWith(suffix))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 }); await room(page); await panel(page, 'Layout');
  await page.getByRole('button', { name: '3D model', exact: true }).click();
  await expect(page.locator('.spatial-model-canvas canvas[data-rendered=true]')).toBeVisible();
  const heightHandle = page.getByRole('button', { name: 'Drag ceiling height', exact: true }); await expect(heightHandle).toBeVisible();
  const beforeCancel = (await saved(page)).document, box = (await heightHandle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 18, { steps: 8 });
  expect((await saved(page)).document).toEqual(beforeCancel);
  await page.keyboard.press('Escape'); await page.mouse.up(); expect((await saved(page)).document).toEqual(beforeCancel);
  await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit walking', exact: true })).toBeVisible();
  await expect(heightHandle).toBeHidden(); expect((await saved(page)).document.revision).toBe(r);
  const diagnostics = () => page.evaluate(async () => { const p = '/src/ui/rendererDiagnostics.ts'; return (await import(p)).rendererDiagnostics(); });
  await page.waitForTimeout(200); const beforeIdle = await diagnostics(); await page.waitForTimeout(180); const afterIdle = await diagnostics();
  expect(afterIdle.active.map((a: { id: number; renderFrames: number }) => [a.id, a.renderFrames])).toEqual(beforeIdle.active.map((a: { id: number; renderFrames: number }) => [a.id, a.renderFrames]));
  await page.screenshot({ path: info.outputPath('combined-model-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
