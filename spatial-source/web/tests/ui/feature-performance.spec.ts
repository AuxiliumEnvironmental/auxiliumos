import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { overlayStressFixture } from './overlayStressFixture';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });
const diagnostics = (page: Page) => page.evaluate(async () => { const path = '/src/ui/rendererDiagnostics.ts'; return (await import(path)).rendererDiagnostics(); });
const percentile = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const timedModel = (page: Page) => page.evaluate(() => new Promise<number>((resolve, reject) => {
  const start = performance.now(), button = [...document.querySelectorAll('button')].find(b => b.textContent === '3D model');
  if (!button) return reject(new Error('Model switch absent'));
  button.click();
  const sample = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('.spatial-model-canvas canvas');
    if (canvas?.dataset.rendered === 'true' && canvas.getClientRects().length) return requestAnimationFrame(() => resolve(performance.now() - start));
    if (performance.now() - start > 30_000) return reject(new Error('First rendered frame timed out'));
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}));

test('actual 2000-observation workload records warm latency, idle rendering and 20 release cycles', async ({ page, browser }, info) => {
  test.setTimeout(300_000);
  const fixture = overlayStressFixture(), floor = fixture.floors[0];
  expect([floor.rooms.length, floor.walls.length, floor.openings.length, fixture.affectedAreas!.length]).toEqual([100, 1000, 500, 2000]);
  const warm: number[] = [], selection: number[] = [], cycles: object[] = [], errors: string[] = [];
  const receipt: Record<string, unknown> = { environment: 'Linux headless Chromium, development build, software WebGL', browser: browser.version(), counts: { rooms: 100, walls: 1000, openings: 500, observations: 2000, floorObservations: 1000, ceilingObservations: 500, wallObservations: 500 }, warmSamplesMS: warm, selectionFeedbackSamplesMS: selection, cycles, pageErrors: errors, limits: ['Synthetic disjoint marks are not an agreed field pilot.', 'Software WebGL and browser timing do not establish physical iPhone frame, thermal, touch or total retained-memory acceptance.', 'Heap samples cover JavaScript heap after explicit garbage collection, not total process or GPU memory.'] };
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/');
    const importStart = Date.now();
    await page.locator('input[type=file]').setInputFiles({ name: 'combined-stress.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await expect(page.locator('.spatial-save-state')).toContainText('Revision 1', { timeout: 30_000 });
    receipt.importAndOpenMS = Date.now() - importStart;
    receipt.coldCreationMS = await timedModel(page);
    const initial = await diagnostics(page); expect(initial.active).toHaveLength(1); receipt.initialRenderer = initial.active[0];
    receipt.gpu = await page.locator('.spatial-model-canvas canvas').evaluate((canvas: HTMLCanvasElement) => { const gl = canvas.getContext('webgl2')!, debug = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR) }; });
    await page.waitForTimeout(250); expect((await diagnostics(page)).active[0].renderFrames).toBe(initial.active[0].renderFrames);
    for (let n = 0; n < 30; n++) {
      await page.getByRole('button', { name: '2D plan', exact: true }).click();
      await expect(page.locator('.spatial-model')).toBeHidden();
      warm.push(await timedModel(page));
      expect((await diagnostics(page)).active[0].id).toBe(initial.active[0].id);
    }
    receipt.warmP95MS = percentile(warm); receipt.warmTargetMS = 500; receipt.warmWithinTarget = percentile(warm) <= 500;
    await page.getByRole('button', { name: '2D plan', exact: true }).click();
    for (let n = 0; n < 30; n++) selection.push(await page.evaluate(n => new Promise<number>((resolve, reject) => {
      const label = `Synthetic room ${n % 2 + 1}`, button = [...document.querySelectorAll<HTMLButtonElement>('.spatial-object-list button')].find(b => b.textContent?.trim() === `▱${label}` || b.textContent?.trim().endsWith(label));
      if (!button) return reject(new Error('Room control absent'));
      const start = performance.now(); button.click();
      const sample = () => { if (document.querySelector('.spatial-inspector h2')?.textContent === label) return requestAnimationFrame(() => resolve(performance.now() - start)); if (performance.now() - start > 10_000) return reject(new Error('Selection feedback timed out')); requestAnimationFrame(sample); }; requestAnimationFrame(sample);
    }), n));
    receipt.selectionP95MS = percentile(selection); receipt.selectionTargetMS = 100; receipt.selectionWithinTarget = percentile(selection) <= 100;
    const cdp = await page.context().newCDPSession(page);
    for (let cycle = 0; cycle < 20; cycle++) {
      if (cycle) { await page.locator('.spatial-project-card').filter({ hasText: fixture.title }).click(); await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${cycle + 1}`, { timeout: 30_000 }); }
      await page.locator('.spatial-object-list button').filter({ hasText: cycle ? `Stress room ${cycle}` : 'Synthetic room 1' }).first().click();
      await page.getByLabel('Room name', { exact: true }).fill(`Stress room ${cycle + 1}`);
      const start = Date.now(); await page.getByRole('button', { name: 'Save name', exact: true }).click();
      await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${cycle + 2}`, { timeout: 30_000 });
      const saveMS = Date.now() - start, switchMS = await timedModel(page), active = await diagnostics(page);
      await page.getByRole('button', { name: 'Auxilium Spatial saved layouts', exact: true }).click();
      await expect(page.locator('.spatial-model')).toHaveCount(0);
      const closed = await diagnostics(page); expect(closed.active).toHaveLength(0);
      expect(closed.released.every((r: { geometries: number; textures: number }) => r.geometries === 0 && r.textures === 0)).toBe(true);
      await cdp.send('HeapProfiler.collectGarbage'); const heap = await cdp.send('Runtime.getHeapUsage');
      cycles.push({ cycle, saveMS, freshRendererMS: switchMS, renderer: active.active[0], heapBytes: heap.usedSize });
    }
    expect(errors).toEqual([]); receipt.complete = true;
  } catch (error) { receipt.complete = false; receipt.failure = String(error); throw error; }
  finally { await writeFile(info.outputPath('combined-overlay-performance.json'), JSON.stringify(receipt, null, 2) + '\n'); }
});
