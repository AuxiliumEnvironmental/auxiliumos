import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { applyCommands, pathPoint, roomBoundary, validateDocument, wallPath, WalkNavigation } from '../../src/core';
import type { Point2, SpatialDocument, StoredWorkspace } from '../../src/types';
import { freshDocument } from '../../src/ui/geometry';
import { rectangleRoomCommands } from '../../src/ui/roomDrawing';

test.use({ baseURL: process.env.SPATIAL_TEST_URL ?? 'http://127.0.0.1:4175', viewport: { width: 1440, height: 1000 } });

type ScreenPoint = { x: number; y: number };
type Probe = { requests: number; callbacks: number; cancels: number; saves: number; pointerID: number; down: ScreenPoint };
const canvas = (page: Page) => page.locator('.spatial-plan>svg');

async function saved(page: Page): Promise<StoredWorkspace> {
  return page.evaluate(async () => {
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), store = new SpatialWebStore('auxilium-spatial-local-v1');
    try { const [entry] = await store.list(); return await store.open(entry.documentID); } finally { store.close(); }
  });
}
async function revision(page: Page, number: number) {
  await expect(page.locator('.spatial-save-state')).toContainText(`Revision ${number}`);
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
}
async function screen(page: Page, point: Point2): Promise<ScreenPoint> {
  return canvas(page).evaluate((svg: SVGSVGElement, value) => {
    const p = svg.createSVGPoint(); p.x = value.x; p.y = value.z;
    const result = p.matrixTransform(svg.getScreenCTM()!); return { x: result.x, y: result.y };
  }, point);
}
async function world(page: Page, point: ScreenPoint): Promise<Point2> {
  return canvas(page).evaluate((svg: SVGSVGElement, value) => {
    // SVGMatrix and SVGAnimatedRect round the viewBox to float32. The public
    // attribute retains its exact decimal coordinates, independent of React.
    const [x, z, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number), rect = svg.getBoundingClientRect();
    return { x: x + (value.x - rect.left) * width / rect.width, z: z + (value.y - rect.top) * height / rect.height };
  }, point);
}
async function blank(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: '+ New layout', exact: true }).click();
  await page.getByLabel('Layout name').fill('Precision gesture synthetic'); await page.getByRole('button', { name: 'Create layout', exact: true }).click(); await revision(page, 1);
}
async function draft(page: Page): Promise<Point2[]> {
  return page.locator('[data-drawing-draft] circle').evaluateAll(items => items.map(item => ({ x: Number(item.getAttribute('cx')), z: Number(item.getAttribute('cy')) })));
}
function pointEqual(actual: Point2, expected: Point2, precision = 5) {
  expect(actual.x).toBeCloseTo(expected.x, precision); expect(actual.z).toBeCloseTo(expected.z, precision);
}
async function tap(cdp: CDPSession, point: ScreenPoint, id = 1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function touchDrag(cdp: CDPSession, start: ScreenPoint, end: ScreenPoint, id = 1) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function mouseDrag(page: Page, start: ScreenPoint, end: ScreenPoint) {
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
}
async function installProbe(page: Page) {
  await page.evaluate(async () => {
    const target = window as unknown as { precisionProbe: Probe };
    target.precisionProbe = { requests: 0, callbacks: 0, cancels: 0, saves: 0, pointerID: 0, down: { x: 0, y: 0 } };
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { target.precisionProbe.requests++; return request(time => { target.precisionProbe.callbacks++; callback(time); }); };
    window.cancelAnimationFrame = id => { target.precisionProbe.cancels++; cancel(id); };
    window.addEventListener('pointerdown', event => {
      if ((event.target as Element)?.closest('.spatial-plan>svg')) { target.precisionProbe.pointerID = event.pointerId; target.precisionProbe.down = { x: event.clientX, y: event.clientY }; }
    }, true);
    const path = '/src/data/index.ts', { SpatialWebStore } = await import(path), apply = SpatialWebStore.prototype.apply;
    SpatialWebStore.prototype.apply = function (...args: unknown[]) { target.precisionProbe.saves++; return apply.apply(this, args); };
  });
}
async function probe(page: Page): Promise<Probe> { return page.evaluate(() => (window as unknown as { precisionProbe: Probe }).precisionProbe); }
async function resetFrames(page: Page) {
  await page.evaluate(() => { const value = (window as unknown as { precisionProbe: Probe }).precisionProbe; value.requests = 0; value.callbacks = 0; value.cancels = 0; });
}
async function burst(page: Page, from: ScreenPoint, to: ScreenPoint, release?: ScreenPoint) {
  // The real CDP contact owns pointer capture; a synchronous event burst makes
  // frame batching and an unpainted final release observable without timing guesses.
  return canvas(page).evaluate((svg, input) => {
    const target = window as unknown as { precisionProbe: Probe }, id = target.precisionProbe.pointerID;
    for (let i = 1; i <= 120; i++) svg.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, buttons: 1,
      clientX: input.from.x + (input.to.x - input.from.x) * i / 120,
      clientY: input.from.y + (input.to.y - input.from.y) * i / 120,
    }));
    if (input.release) svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, buttons: 0, clientX: input.release.x, clientY: input.release.y }));
    return { ...target.precisionProbe };
  }, { from, to, release });
}
function adjoiningSource(): SpatialDocument {
  const initial = freshDocument('Precision adjoining synthetic');
  const result = applyCommands(initial, rectangleRoomCommands(initial.floors[0], { x: 0, z: 0 }, { x: 4, z: 4 }).commands, 1).document;
  result.floors[0].openings.push({ id: 'kept-window', wallID: result.floors[0].walls[1].id, kind: 'window', offset: 1.6, width: .6, bottom: .9, height: 1.2, provenance: { origin: 'synthetic', sourceIDs: ['synthetic-window'], classificationConfidence: 'unknown' } });
  return result;
}
async function imported(page: Page) {
  const source = adjoiningSource(); await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'precision-source.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }); await revision(page, source.revision);
  const dismiss = page.getByRole('button', { name: 'Dismiss message', exact: true }); if (await dismiss.count()) await dismiss.click();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); return source;
}
function openingWorld(document: SpatialDocument) {
  const floor = document.floors[0]; return floor.openings.map(opening => {
    const path = wallPath(floor, floor.walls.find(wall => wall.id === opening.wallID)!);
    return { ...opening, wallID: undefined, offset: undefined, start: pathPoint(path, opening.offset), end: pathPoint(path, opening.offset + opening.width) };
  });
}
function openingsEqual(actual: SpatialDocument, expected: SpatialDocument) {
  const a = openingWorld(actual), b = openingWorld(expected); expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i++) {
    expect({ ...a[i], start: undefined, end: undefined }).toEqual({ ...b[i], start: undefined, end: undefined });
    pointEqual(a[i].start, b[i].start, 12); pointEqual(a[i].end, b[i].end, 12);
  }
}

test('one mobile finger drag keeps continuous room coordinates, batches its preview, and saves only the exact terminal rectangle', async ({ page, context }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await blank(page); await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click(); await installProbe(page);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await screen(page, { x: 1.237, z: 1.419 }), interim = await screen(page, { x: 4.307, z: 4.118 }), release = await screen(page, { x: 5.1837, z: 4.7139 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  const actualStart = await world(page, (await probe(page)).down), actualRelease = await world(page, release); await resetFrames(page);
  const initial = await burst(page, start, interim); expect(initial.requests).toBe(1); expect(initial.callbacks).toBe(0); expect(initial.saves).toBe(0);
  await expect(page.locator('[data-room-preview]')).toBeVisible(); await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeDisabled(); expect((await saved(page)).document.floors[0].rooms).toEqual([]);
  await resetFrames(page); const terminal = await burst(page, interim, await screen(page, { x: 4.8, z: 4.4 }), release);
  expect(terminal.requests).toBe(1); expect(terminal.callbacks).toBe(0); expect(terminal.cancels).toBe(1); expect(terminal.saves).toBe(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await expect(page.locator('[data-room-draft] circle')).toHaveCount(2);
  const corners = await draft(page); pointEqual(corners[0], actualStart, 6); pointEqual(corners[1], actualRelease, 6);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2);
  const floor = (await saved(page)).document.floors[0]; expect(floor.rooms).toHaveLength(1); expect(floor.walls).toHaveLength(4); expect((await probe(page)).saves).toBe(1);
  const boundary = roomBoundary(floor, floor.rooms[0]); pointEqual(boundary[0], actualStart, 6); pointEqual(boundary[2], actualRelease, 6);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await revision(page, 3); expect((await saved(page)).document.floors[0].rooms).toEqual([]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await revision(page, 4); expect((await saved(page)).document.floors[0]).toEqual(floor);
  await info.attach('terminal-room-precision', { body: JSON.stringify({ initial, terminal, actualStart, actualRelease, corners, limitation: 'Chromium synthetic event batching and coordinates; not physical iPhone latency.' }), contentType: 'application/json' }); await cdp.detach();
});

test('two taps still form a room and either opposite draft corner drags independently before one finish', async ({ page, context }, info) => {
  await blank(page); await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click();
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const first = { x: 1.27, z: 1.33 }, second = { x: 4.83, z: 4.19 };
  await tap(cdp, await screen(page, first)); await tap(cdp, await screen(page, second)); await expect(page.locator('[data-room-draft] circle')).toHaveCount(2);
  const before = await draft(page), resizedFirst = { x: .4317, z: .7139 }, resizedSecond = { x: 6.1841, z: 3.2173 };
  const firstHandle = await screen(page, before[0]), firstEnd = await screen(page, resizedFirst);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: firstHandle.x + 8, y: firstHandle.y + 6, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: firstEnd.x + 8, y: firstEnd.y + 6, id: 2 }] });
  await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeDisabled(); await page.keyboard.press('Enter'); expect((await saved(page)).document.revision).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); const firstResize = await draft(page); pointEqual(firstResize[0], resizedFirst); pointEqual(firstResize[1], before[1], 6);
  const secondHandle = await screen(page, firstResize[1]), secondEnd = await screen(page, resizedSecond);
  await touchDrag(cdp, { x: secondHandle.x + 7, y: secondHandle.y - 5 }, { x: secondEnd.x + 7, y: secondEnd.y - 5 }, 3); const secondResize = await draft(page); pointEqual(secondResize[0], firstResize[0], 6); pointEqual(secondResize[1], resizedSecond);
  const fineStart = await screen(page, secondResize[1]), fineEnd = { x: fineStart.x + 3, y: fineStart.y }, fineCorner = await world(page, fineEnd);
  await page.evaluate(() => {
    const target = window as unknown as { fineEvents: Array<Record<string, unknown>> }; target.fineEvents = [];
    for (const kind of ['pointerdown', 'pointermove', 'pointerup']) window.addEventListener(kind, event => { const e = event as PointerEvent; target.fineEvents.push({ kind, x: e.clientX, y: e.clientY, type: e.pointerType, target: (e.target as Element)?.tagName, inSVG: !!(e.target as Element)?.closest('.spatial-plan>svg') }); }, true);
  });
  await touchDrag(cdp, fineStart, fineEnd, 4);
  await info.attach('three-pixel-input', { body: JSON.stringify({ fineStart, fineEnd, fineCorner, draft: await draft(page), events: await page.evaluate(() => (window as unknown as { fineEvents: unknown[] }).fineEvents) }), contentType: 'application/json' });
  pointEqual((await draft(page))[1], fineCorner, 5);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2);
  const floor = (await saved(page)).document.floors[0], boundary = roomBoundary(floor, floor.rooms[0]); pointEqual(boundary[0], resizedFirst); pointEqual(boundary[2], fineCorner); expect(floor.walls).toHaveLength(4); await cdp.detach();
});

test('single mouse and touch wall drags both work and the second stroke reuses an easily snapped corner identity', async ({ page, context }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  const a = { x: 1.1973, z: 1.4137 }, b = { x: 4.8319, z: 2.1931 };
  await mouseDrag(page, await screen(page, a), await screen(page, b)); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  const mousePoints = await draft(page); pointEqual(mousePoints[0], a); pointEqual(mousePoints[1], b); expect((await saved(page)).document.revision).toBe(1);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 2); const first = (await saved(page)).document.floors[0];
  await page.getByRole('button', { name: 'Draw wall', exact: true }).click(); const joint = await screen(page, b), c = { x: 7.1413, z: 5.2317 };
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await touchDrag(cdp, { x: joint.x + 6, y: joint.y + 5 }, await screen(page, c)); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  const touchPoints = await draft(page); pointEqual(touchPoints[0], first.nodes[1].point, 6); pointEqual(touchPoints[1], c);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 3);
  const result = (await saved(page)).document; expect(result.floors[0].walls).toHaveLength(2); expect(result.floors[0].nodes).toHaveLength(3); expect(result.floors[0].walls[1].nodeIDs[0]).toBe(first.walls[0].nodeIDs[1]); expect(validateDocument(result)).toEqual([]); await cdp.detach();
});

test('room and wall corner and edge snaps use screen distance at two zoom levels and release freely outside the target', async ({ page }) => {
  const before = await imported(page);
  for (const label of ['Draw rectangular room', 'Draw wall']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const preview = page.locator(label === 'Draw wall' ? '[data-drawing-preview]' : '[data-room-snap]'), attribute = label === 'Draw wall' ? 'data-drawing-preview' : 'data-room-snap';
    for (let scale = 0; scale < 2; scale++) {
      const corner = await screen(page, { x: 4, z: 0 }), boundary = await screen(page, { x: 4, z: 2.8 });
      await page.mouse.move(corner.x + 8, corner.y + 6); await expect(preview).toHaveAttribute(attribute, 'corner');
      await page.mouse.move(corner.x + 44, corner.y - 39); await expect(preview).toHaveAttribute(attribute, 'free');
      await page.mouse.move(boundary.x + 6, boundary.y); await expect(preview).toHaveAttribute(attribute, 'boundary');
      await page.mouse.move(boundary.x + 44, boundary.y); await expect(preview).toHaveAttribute(attribute, 'free');
      await page.keyboard.down('Alt'); await page.mouse.move(corner.x + 6, corner.y + 6); await expect(preview).toHaveAttribute(attribute, 'free'); await page.keyboard.up('Alt');
      if (!scale) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    }
  }
  await page.getByRole('button', { name: 'Snap wall corners and boundaries', exact: true }).click();
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  for (const label of ['Draw wall', 'Draw rectangular room']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const corner = await screen(page, { x: 4, z: 0 }), free = { x: corner.x + 6, y: corner.y + 6 }; await tap(cdp, free);
    await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(1); pointEqual((await draft(page))[0], await world(page, free));
    await page.getByRole('button', { name: 'Cancel drawing', exact: true }).click();
  }
  await cdp.detach();
  expect((await saved(page)).document).toEqual(before);
});

test('adjoining finger room drag snaps a partial shared boundary and preserves window geometry in one undoable edit', async ({ page, context }) => {
  const source = await imported(page); await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click();
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const anchor = await screen(page, { x: 4, z: 1 }), end = await screen(page, { x: 7, z: 3 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: anchor.x + 6, y: anchor.y, id: 1 }] }); await expect(page.locator('[data-room-snap]')).toHaveAttribute('data-room-snap', 'boundary');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 3);
  const result = (await saved(page)).document, floor = result.floors[0]; expect(floor.rooms).toHaveLength(2); expect(floor.walls).toHaveLength(9); expect(floor.rooms[0].boundary).toHaveLength(6);
  const shared = floor.rooms[1].boundary.filter(ref => floor.rooms[0].boundary.some(other => other.wallID === ref.wallID)); expect(shared).toHaveLength(1); expect(shared[0].reversed).not.toBe(floor.rooms[0].boundary.find(ref => ref.wallID === shared[0].wallID)!.reversed);
  openingsEqual(result, source); expect(new WalkNavigation(result, floor.id).portals).toHaveLength(0); expect(validateDocument(result)).toEqual([]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await revision(page, 4); expect((await saved(page)).document.floors).toEqual(source.floors);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await revision(page, 5); expect((await saved(page)).document.floors).toEqual(result.floors); await cdp.detach();
});

test('a single wall can end or begin at a boundary snap with shared T junction topology and retained opening location', async ({ page }) => {
  const source = await imported(page), host = source.floors[0].walls[1]; let nextRevision = 3;
  for (const startsAtBoundary of [false, true]) {
    await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
    const joint = await screen(page, { x: 4, z: startsAtBoundary ? 1 : 3 }), nearJoint = { x: joint.x + 6, y: joint.y }, free = await screen(page, { x: 7, z: startsAtBoundary ? .5 : 3.5 });
    await mouseDrag(page, startsAtBoundary ? nearJoint : free, startsAtBoundary ? free : nearJoint); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
    await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, nextRevision++);
    const stored = await saved(page), result = stored.document, floor = result.floors[0]; expect(floor.walls).toHaveLength(6); expect(floor.rooms[0].boundary).toHaveLength(5);
    const t = floor.nodes.find(node => Math.abs(node.point.x - 4) < 1e-6 && Math.abs(node.point.z - (startsAtBoundary ? 1 : 3)) < 1e-5)!; expect(t).toBeTruthy(); expect(floor.walls.filter(wall => wall.nodeIDs.includes(t.id))).toHaveLength(3);
    openingsEqual(result, source); expect(stored.receipt?.mappings.find(item => item.sourceID === host.id)?.resultingIDs).toHaveLength(2); expect(validateDocument(result)).toEqual([]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await revision(page, nextRevision++); expect((await saved(page)).document.floors).toEqual(source.floors);
  }
});

test('a wall junction through a retained opening is rejected atomically and leaves the draft adjustable', async ({ page }) => {
  const source = await imported(page); await page.getByRole('button', { name: 'Draw wall', exact: true }).click();
  const joint = await screen(page, { x: 4, z: 2 }); await mouseDrag(page, await screen(page, { x: 7, z: 2.5 }), { x: joint.x + 6, y: joint.y });
  await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2); await page.getByRole('button', { name: 'Finish walls', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/opening/i); expect((await saved(page)).document).toEqual(source); await expect(page.locator('[data-drawing-draft] circle')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove last drawing point', exact: true }).click(); const clear = await screen(page, { x: 4, z: 3 }); await page.mouse.click(clear.x + 6, clear.y);
  await page.getByRole('button', { name: 'Finish walls', exact: true }).click(); await revision(page, 3); const result = (await saved(page)).document; openingsEqual(result, source); expect(result.floors[0].walls).toHaveLength(6);
});

test('cancel and second-finger pinch abandon a pending room handle drag without changing its completed draft or saving geometry', async ({ page, context }) => {
  await blank(page); await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click(); await installProbe(page);
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await tap(cdp, await screen(page, { x: 1.3, z: 1.4 })); await tap(cdp, await screen(page, { x: 4.8, z: 4.2 })); const before = await draft(page), savedBefore = (await saved(page)).document;
  for (const interruption of ['cancel', 'pinch']) {
    const start = await screen(page, before[0]), end = await screen(page, { x: .5, z: .6 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] }); await resetFrames(page);
    const queued = await burst(page, start, end); expect(queued.requests).toBe(1); expect(queued.saves).toBe(0);
    if (interruption === 'cancel') await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    else {
      const other = await screen(page, { x: 6, z: 4 }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }, { ...other, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x - 15, y: start.y - 10, id: 1 }, { x: other.x + 15, y: other.y + 10, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...start, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await expect(page.getByRole('button', { name: 'Finish room', exact: true })).toBeEnabled(); expect(await draft(page)).toEqual(before); expect((await saved(page)).document).toEqual(savedBefore);
  }
  await page.getByRole('button', { name: 'Finish room', exact: true }).click(); await revision(page, 2); const floor = (await saved(page)).document.floors[0], boundary = roomBoundary(floor, floor.rooms[0]); pointEqual(boundary[0], before[0], 6); pointEqual(boundary[2], before[1], 6); expect((await probe(page)).saves).toBe(1); await cdp.detach();
});
