import { expect, test, type Page } from '@playwright/test';
import type { StoredWorkspace } from '../../src/types';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 390, height: 844 } });

type ScreenPoint = { x: number; y: number };
type Probe = { requests: number; callbacks: number; cancels: number; saves: number; pointerID: number; down: ScreenPoint };

async function saved(page: Page): Promise<StoredWorkspace> {
  return page.evaluate(async () => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore('auxilium-spatial-local-v1');
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  });
}
async function point(page: Page, x: number, z: number): Promise<ScreenPoint> {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, value) => {
    const p = svg.createSVGPoint(); p.x = value.x; p.y = value.z;
    const result = p.matrixTransform(svg.getScreenCTM()!); return { x: result.x, y: result.y };
  }, { x, z });
}
async function world(page: Page, screen: ScreenPoint) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement, value) => {
    const p = svg.createSVGPoint(); p.x = value.x; p.y = value.y;
    const result = p.matrixTransform(svg.getScreenCTM()!.inverse()); return { x: result.x, z: result.y };
  }, screen);
}
async function blank(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: '+ New layout', exact: true }).click();
  await page.getByLabel('Layout name').fill('Mobile drawing synthetic'); await page.getByRole('button', { name: 'Create layout', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
}
async function example(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: /Open example/ }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
}
async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const target = window as unknown as { drawingProbe: Probe };
    target.drawingProbe = { requests: 0, callbacks: 0, cancels: 0, saves: 0, pointerID: 0, down: { x: 0, y: 0 } };
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { target.drawingProbe.requests++; return request(time => { target.drawingProbe.callbacks++; callback(time); }); };
    window.cancelAnimationFrame = id => { target.drawingProbe.cancels++; cancel(id); };
    window.addEventListener('pointerdown', event => {
      if ((event.target as Element)?.closest('.spatial-plan>svg')) { target.drawingProbe.pointerID = event.pointerId; target.drawingProbe.down = { x: event.clientX, y: event.clientY }; }
    }, true);
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), apply = SpatialWebStore.prototype.apply;
    SpatialWebStore.prototype.apply = function (...args: unknown[]) { target.drawingProbe.saves++; return apply.apply(this, args); };
  });
}
async function resetFrames(page: Page) {
  await page.evaluate(() => { const probe = (window as unknown as { drawingProbe: Probe }).drawingProbe; probe.requests = 0; probe.callbacks = 0; probe.cancels = 0; });
}
async function probe(page: Page): Promise<Probe> { return page.evaluate(() => (window as unknown as { drawingProbe: Probe }).drawingProbe); }
async function burst(page: Page, from: ScreenPoint, to: ScreenPoint, count = 120, release?: ScreenPoint) {
  // A trusted CDP touchStart owns the capture. A single task containing many
  // move events makes batching observable without relying on hardware timing.
  return page.locator('.spatial-plan>svg').evaluate((svg, input) => {
    const target = window as unknown as { drawingProbe: Probe }, id = target.drawingProbe.pointerID;
    for (let i = 1; i <= input.count; i++) {
      const ratio = i / input.count;
      svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, buttons: 1, altKey: true, clientX: input.from.x + (input.to.x - input.from.x) * ratio, clientY: input.from.y + (input.to.y - input.from.y) * ratio }));
    }
    if (input.release) svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, buttons: 0, altKey: true, clientX: input.release.x, clientY: input.release.y }));
    return { ...target.drawingProbe, captured: (svg as SVGSVGElement).hasPointerCapture(id) };
  }, { from, to, count, release });
}
async function reachable(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { label: element.getAttribute('aria-label') ?? element.textContent, width: rect.width, height: rect.height, onscreen: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, uncovered: !!hit && element.contains(hit) };
  }));
}
async function mapExposure(page: Page) {
  return page.locator('.spatial-plan>svg').evaluate((svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect(), visibleTop = Math.max(0, rect.top), visibleBottom = Math.min(innerHeight, rect.bottom);
    const panels = [...document.querySelectorAll('.spatial-editor>.spatial-object-panel,.spatial-editor>.spatial-details-panel')].filter(element => getComputedStyle(element).display !== 'none').map(element => element.getBoundingClientRect());
    const leftMiddle = rect.left + rect.width * .5, coveringPanels = panels.filter(panel => panel.left <= leftMiddle && panel.right >= leftMiddle);
    const sheetTop = coveringPanels.length ? Math.min(...coveringPanels.map(panel => panel.top)) : visibleBottom;
    const hits = [.26, .42].flatMap(y => [.5, .78].map(x => {
      const hit = document.elementFromPoint(rect.left + rect.width * x, rect.top + rect.height * y); return hit?.closest('.spatial-plan>svg') === svg;
    }));
    return { height: rect.height, visibleHeight: visibleBottom - visibleTop, upperUncoveredHeight: Math.min(visibleBottom, sheetTop) - visibleTop, uncoveredPoints: hits.filter(Boolean).length, viewportHeight: innerHeight };
  });
}

test('touch wall stroke batches a high-rate preview and preserves a newer release endpoint as one editable transaction', async ({ page, context }, info) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); await installProbe(page);
  const initialBox = (await page.locator('.spatial-plan>svg').boundingBox())!;
  const cdp = await context.newCDPSession(page), start = await point(page, 1.2, 1.1), preview = await point(page, 4.0, 1.6), final = await point(page, 4.83, 1.91);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  const actualStart = await world(page, (await probe(page)).down); await resetFrames(page);
  const first = await burst(page, start, preview);
  expect(first.requests).toBe(1); expect(first.callbacks).toBe(0); expect(first.saves).toBe(0); expect(first.captured).toBe(true);
  await expect(page.locator('[data-rubber-band]')).toBeVisible();
  const previewBox = (await page.locator('.spatial-plan>svg').boundingBox())!;
  await info.attach('stroke-layout', { body: JSON.stringify({ initialBox, previewBox }), contentType: 'application/json' });
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(previewBox[key], `map ${key} remains stable during stroke`).toBeCloseTo(initialBox[key], 1);
  expect((await saved(page)).document.revision).toBe(1); expect((await saved(page)).document.floors[0].walls).toHaveLength(0);
  const actualFinal = await world(page, final); await resetFrames(page);
  const second = await burst(page, preview, await point(page, 4.3, 1.7), 80, final);
  expect(second.requests).toBe(1); expect(second.callbacks).toBe(0); expect(second.cancels).toBe(1); expect(second.saves).toBe(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  const endpoints = await page.locator('[data-drawing-draft] circle').evaluateAll(elements => elements.map(element => ({ x: Number(element.getAttribute('cx')), z: Number(element.getAttribute('cy')) })));
  expect(endpoints[0].x).toBeCloseTo(actualStart.x, 6); expect(endpoints[0].z).toBeCloseTo(actualStart.z, 6);
  expect(endpoints[1].x).toBeCloseTo(actualFinal.x, 6); expect(endpoints[1].z).toBeCloseTo(actualFinal.z, 6);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  const floor = (await saved(page)).document.floors[0]; expect(floor.walls).toHaveLength(1); expect(floor.nodes).toHaveLength(2); expect((await probe(page)).saves).toBe(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 3'); expect((await saved(page)).document.floors[0].walls).toHaveLength(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 4'); expect((await saved(page)).document.floors[0]).toEqual(floor);
  await info.attach('touch-burst', { body: JSON.stringify({ first, second, endpoints, actualStart, actualFinal, limitation: 'Synthetic Chromium event batching, not physical iPhone latency.' }), contentType: 'application/json' });
  await cdp.detach();
});

test('touch room preview cancellation fences pending frames and late release without a stray draft or save', async ({ page, context }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click(); await installProbe(page);
  const before = (await saved(page)).document, cdp = await context.newCDPSession(page), start = await point(page, 1, 1), end = await point(page, 4.5, 3.2);
  for (const interruption of ['cancel', 'blur']) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 3 }] }); await resetFrames(page);
    const sample = await burst(page, start, end); expect(sample.requests).toBe(1); expect(sample.saves).toBe(0);
    if (interruption === 'cancel') await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    else { await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); }
    await expect(page.locator('[data-room-preview]')).toHaveCount(0); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(0);
    expect((await saved(page)).document).toEqual(before);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 4 }] });
  await burst(page, start, end, 120, end); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  expect((await saved(page)).document.floors[0].rooms).toHaveLength(1); expect((await probe(page)).saves).toBe(1); await cdp.detach();
});

test('adding a second finger abandons an unsaved wall stroke and leaves drawing and view controls usable', async ({ page, context }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  const cdp = await context.newCDPSession(page), start = await point(page, 1, 1), end = await point(page, 4, 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
  await expect(page.locator('[data-rubber-band]')).toBeVisible();
  const box = (await page.locator('.spatial-plan>svg').boundingBox())!, second = { x: box.x + box.width * .82, y: box.y + box.height * .28 }, before = await page.locator('.spatial-plan>svg').getAttribute('viewBox');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...end, id: 1 }, { ...second, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end.x - 25, y: end.y + 20, id: 1 }, { x: second.x + 20, y: second.y - 15, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.spatial-plan>svg')).not.toHaveAttribute('viewBox', before!); await expect(page.locator('[data-drawing-draft]')).toHaveCount(0); await expect(page.locator('[data-rubber-band]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '3D model', exact: true })).toBeEnabled();
  expect((await saved(page)).document.revision).toBe(1); expect((await saved(page)).document.floors[0].nodes).toHaveLength(0); await cdp.detach();
});

test('selected touch corner uses the terminal coordinate and one save while a pending preview cannot resurrect after release', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await example(page); await installProbe(page);
  const before = (await saved(page)).document, start = await point(page, 8, 4), terminal = await point(page, 8.43, 4.29), cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 5 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.spatial-inspector h2')).toHaveText('Corner 4');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 6 }] }); const actualStart = await world(page, (await probe(page)).down), actualFinal = await world(page, terminal); await resetFrames(page);
  const sample = await burst(page, start, await point(page, 8.2, 4.1), 160, terminal); expect(sample.requests).toBe(1); expect(sample.callbacks).toBe(0); expect(sample.cancels).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  const after = (await saved(page)).document, original = before.floors[0].nodes.find(node => node.id === 'n3')!, changed = after.floors[0].nodes.find(node => node.id === 'n3')!;
  expect(changed.point.x).toBeCloseTo(original.point.x + actualFinal.x - actualStart.x, 6); expect(changed.point.z).toBeCloseTo(original.point.z + actualFinal.z - actualStart.z, 6);
  for (const node of before.floors[0].nodes.filter(node => node.id !== 'n3')) expect(after.floors[0].nodes.find(item => item.id === node.id)).toEqual(node);
  expect((await probe(page)).saves).toBe(1); await expect(page.locator('.spatial-canvas-note')).not.toHaveText('Release to save this correction');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 3'); expect((await saved(page)).document.floors).toEqual(before.floors); await cdp.detach();
});

test('mobile Objects and Details remain below a visible interactive map with compact top actions in portrait and landscape', async ({ page }, info) => {
  await example(page);
  const allocations: unknown[] = [];
  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size); await page.getByRole('button', { name: 'Layout', exact: true }).click(); await page.evaluate(() => window.scrollTo(0, 0));
    const exposure = await mapExposure(page); allocations.push({ size, panel: 'Layout', ...exposure }); expect(exposure.visibleHeight).toBeGreaterThan(size.height * (size.height > size.width ? .55 : .45));
    const actions = await reachable(page, '.spatial-document-actions button'); expect(actions).toHaveLength(5);
    for (const action of actions) { expect(action.width, String(action.label)).toBeGreaterThanOrEqual(44); expect(action.height, String(action.label)).toBeGreaterThanOrEqual(44); expect(action.onscreen, String(action.label)).toBe(true); }
    for (const panel of ['Objects', 'Details']) {
      await page.getByRole('button', { name: panel, exact: true }).click(); await expect(page.locator('.spatial-plan>svg')).toBeVisible();
      const open = await mapExposure(page); allocations.push({ size, panel, ...open }); expect(open.visibleHeight).toBeGreaterThan(size.height * .4); expect(open.upperUncoveredHeight).toBeGreaterThan(size.height > size.width ? 180 : 60); expect(open.uncoveredPoints).toBeGreaterThanOrEqual(size.height > size.width ? 3 : 2);
      await expect(page.getByRole('button', { name: 'Back to map', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Back to map', exact: true }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await info.attach('map-allocation', { body: JSON.stringify(allocations), contentType: 'application/json' });
});

test('mobile drawing palette moves by finger and keyboard within the map without moving canonical geometry', async ({ page, context }) => {
  await example(page); const before = (await saved(page)).document;
  const palette = page.locator('.spatial-palette'), handle = page.getByRole('button', { name: 'Move drawing tools', exact: true }), original = (await palette.boundingBox())!;
  expect(original.x).toBeLessThan(25); const handleBox = (await handle.boundingBox())!, cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2, id: 7 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 350, y: 640, id: 7 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const moved = (await palette.boundingBox())!, map = (await page.locator('.spatial-plan').boundingBox())!;
  expect(moved.x).toBeGreaterThan(original.x + 100); expect(moved.y).toBeGreaterThan(original.y);
  expect(moved.x).toBeGreaterThanOrEqual(map.x); expect(moved.x + moved.width).toBeLessThanOrEqual(map.x + map.width); expect(moved.y).toBeGreaterThanOrEqual(map.y); expect(moved.y + moved.height).toBeLessThanOrEqual(map.y + map.height);
  await handle.focus(); await page.keyboard.press('ArrowLeft'); expect((await palette.boundingBox())!.x).toBeLessThan(moved.x);
  await page.keyboard.press('Enter'); expect((await palette.boundingBox())!.x).toBeCloseTo(original.x, 1);
  for (const control of await reachable(page, '.spatial-palette button')) { expect(control.width, String(control.label)).toBeGreaterThanOrEqual(44); expect(control.height, String(control.label)).toBeGreaterThanOrEqual(44); expect(control.onscreen, String(control.label)).toBe(true); expect(control.uncovered, String(control.label)).toBe(true); }
  expect((await saved(page)).document).toEqual(before); await cdp.detach();
});

test('200% mobile text keeps the map visible during a room correction and leaves all drawing tools reachable', async ({ page }) => {
  await example(page); await page.getByRole('button', { name: 'Text size', exact: true }).click(); await page.getByRole('button', { name: '200% text', exact: true }).click();
  await expect(page.locator('.spatial-workspace')).toHaveAttribute('data-large-text', 'true');
  await page.getByRole('button', { name: 'Objects', exact: true }).click(); await page.locator('.spatial-object-list button').filter({ hasText: 'Living room' }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click(); const input = page.getByLabel('Room name', { exact: true });
  expect(await input.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(24);
  await input.fill('Readable mobile correction'); await page.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 2');
  expect((await mapExposure(page)).uncoveredPoints).toBeGreaterThanOrEqual(3); await page.getByRole('button', { name: 'Back to map', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const palette = page.locator('.spatial-palette');
  for (const button of await palette.getByRole('button').all()) { await button.scrollIntoViewIfNeeded(); const rect = (await button.boundingBox())!; expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44); await expect(button).toBeVisible(); }
  expect((await saved(page)).document.floors[0].rooms[0].label).toBe('Readable mobile correction');
});

test('mobile 3D starts with collapsed options and expanding controls retains a visible model', async ({ page }) => {
  await example(page); await page.getByRole('button', { name: '3D model', exact: true }).click();
  const canvas = page.locator('.spatial-model-canvas canvas[data-rendered=true]'); await expect(canvas).toBeVisible();
  await expect(page.getByLabel('Display ceilings', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'View controls', exact: true }).click(); await expect(page.getByLabel('Display ceilings', { exact: true })).toBeVisible();
  const model = (await page.locator('.spatial-model').boundingBox())!, options = (await page.locator('.spatial-model-options').boundingBox())!;
  expect(options.height).toBeLessThan(model.height * .7); await page.getByLabel('Display ceilings', { exact: true }).check();
  await page.getByRole('button', { name: 'Hide controls', exact: true }).click(); await expect(page.getByLabel('Display ceilings', { exact: true })).not.toBeVisible();
  await expect(canvas).toBeVisible(); expect((await saved(page)).document.revision).toBe(1);
});
