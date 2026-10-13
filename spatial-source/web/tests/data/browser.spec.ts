import { expect, test, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { importWorkspace } from '../../src/data/imports';
import { readZIP, writeZIP } from '../../src/data/zip';
import { jsonBytes, sha256, strictJSON } from '../../src/data/bytes';
import type { SpatialDocument } from '../../src/types';

const output = 'tests/data/generated/browser';
async function download(page: Page, format: string, name: string): Promise<Uint8Array> {
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption(format);
  const downloading = page.waitForEvent('download', { timeout: 30000 }); await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
  const file = await downloading; expect(await file.failure()).toBeNull(); await mkdir(output, { recursive: true });
  await file.saveAs(`${output}/${name}`); return new Uint8Array(await readFile(`${output}/${name}`));
}
async function inspectPNG(page: Page, bytes: Uint8Array) {
  return page.evaluate(async raw => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(raw)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0, blue = 0, white = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] < 100 && data[i + 1] < 120 && data[i + 2] < 140) ink++; if (data[i] > 200 && data[i] < 245 && data[i + 2] - data[i] > 5) blue++; if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) white++; }
    const result = { width: bitmap.width, height: bitmap.height, ink, blue, white }; bitmap.close(); canvas.width = canvas.height = 0; return result;
  }, Array.from(bytes));
}
test('actual workspace downloads a nonblank PNG with line art and restrained blue fills', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button', { name: /Open example/ }).click();
  await page.getByRole('button', { name: /Export/ }).click();
  const png = await download(page, 'png', 'actual-workspace.png');
  expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const pixels = await inspectPNG(page, png); expect(pixels.width).toBe(2400); expect(pixels.height).toBe(1800); expect(pixels.ink).toBeGreaterThan(3000); expect(pixels.blue).toBeGreaterThan(100_000); expect(pixels.white).toBeGreaterThan(100_000);
  await writeFile(`${output}/PNG_PIXELS.json`, JSON.stringify(pixels, null, 2));
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Revision 1 prepared for download.'); expect(errors).toEqual([]);
});
test('actual Unicode correction exports PDF and PNG from the frozen corrected revision', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByRole('button', { name: /Open example/ }).click();
  await page.locator('.spatial-object-list button').filter({ hasText: 'Living room' }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Ωμέγα / Café – meeting'); await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2'); await page.getByRole('button', { name: /Export/ }).click();
  const pdf = await download(page, 'pdf', 'unicode-corrected.pdf');
  const text = new TextDecoder('latin1').decode(pdf); expect(text.startsWith('%PDF-1.')).toBe(true); expect(text).toContain('Source revision 2'); expect(text).toContain('/Subtype /Image'); expect(text).toContain('%%EOF');
  const png = await download(page, 'png', 'unicode-corrected.png'); expect((await inspectPNG(page, png)).ink).toBeGreaterThan(3000);
  const svg = await download(page, 'svg', 'unicode-corrected.svg'); const labelText = await page.evaluate(source => [...new DOMParser().parseFromString(source, 'image/svg+xml').querySelectorAll('text')].map(node => node.textContent).join(''), new TextDecoder().decode(svg)); expect(labelText).toContain('Ωμέγα / Café – meeting');
  expect(errors).toEqual([]);
});
test('actual all-floor export retains empty floors, label pages and exact source; browser strict import roundtrips it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const document: SpatialDocument = JSON.parse(await readFile(new URL('../../../fixtures/geometry.json', import.meta.url), 'utf8'));
  document.documentID = 'browser-all-floor-probe'; document.title = 'Synthetic complete document'; document.schemaVersion = '1.1.0';
  document.floors[0].rooms[0].label = 'Complete long label '.repeat(12);
  document.floors[0].areas = [{ id: 'quiet-zone', label: 'Quiet activity area', polygon: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }], provenance: { origin: 'synthetic', sourceIDs: [], classificationConfidence: 'unknown' } }];
  document.floors.push({ id: 'upper-empty', label: 'Upper incomplete floor', elevation: 3, nodes: [], walls: [], openings: [], rooms: [] });
  await page.goto('/'); await page.locator('input[type="file"]').setInputFiles({ name: 'synthetic-all-floor.json', mimeType: 'application/json', buffer: Buffer.from(jsonBytes(document)) });
  await expect(page.locator('.spatial-save-state')).toContainText('Saved locally'); await expect(page.locator('.spatial-floor-picker select')).toHaveValue('floor-1');
  await page.getByRole('button', { name: /Export/ }).click(); const archive = await download(page, 'local-document', 'all-floor.spatial.zip');
  const files = readZIP(archive), manifest = strictJSON(files['manifest.json']) as any;
  expect(manifest.profileVersion).toBe('auxilium-spatial-local-document/1.0.0'); expect(manifest.floors).toHaveLength(2); expect(manifest.floors[0].pageCount).toBe(2); expect(manifest.floors[1].representationStatus).toBe('empty');
  expect(strictJSON(files['geometry.json'])).toEqual(document);
  for (const file of manifest.files) { expect(await sha256(files[file.path])).toBe(file.sha256); expect(files[file.path].length).toBe(file.bytes); }
  for (const index of ['0000', '0001']) {
    expect(files[`floors/${index}/scene.json`]).toBeDefined(); expect(files[`floors/${index}/floorplan.pdf`]).toBeDefined(); expect(files[`floors/${index}/floorplan-0000.png`]).toBeDefined();
  }
  await writeFile(`${output}/all-floor-manifest.json`, JSON.stringify(manifest, null, 2));
  await writeFile(`${output}/all-floor-directory.png`, files['floors/0000/floorplan-0001.png']); await writeFile(`${output}/empty-floor.png`, files['floors/0001/floorplan-0000.png']);
  const result = await page.evaluate(async raw => { const path = '/src/data/index.ts'; const { importDocument } = await import(path); return importDocument(Uint8Array.from(raw), 'complete.zip'); }, Array.from(archive));
  expect(result).toEqual(document);
  const deflated = zipSync(files, { level: 6 });
  const compressedResult = await page.evaluate(async raw => { const path = '/src/data/index.ts'; const { importDocument } = await import(path); return importDocument(Uint8Array.from(raw), 'complete-deflated.zip'); }, Array.from(deflated));
  expect(compressedResult).toEqual(document);
  const tampered = structuredClone(manifest); tampered.files.find((file: any) => file.path === 'floors/0000/scene.json').floorID = 'upper-empty'; files['manifest.json'] = jsonBytes(tampered);
  const rejected = await page.evaluate(async raw => { const path = '/src/data/index.ts'; const { importDocument } = await import(path); try { await importDocument(Uint8Array.from(raw), 'wrong-floor.zip'); return 'accepted'; } catch (error) { return error instanceof Error ? error.message : String(error); } }, Array.from(writeZIP(files)));
  expect(rejected).toBe('file-floor-mismatch');
  // The copy's full backup must retain its actual origin, while canonical geometry has a new identity.
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'synthetic-all-floor.json', mimeType: 'application/json', buffer: Buffer.from(jsonBytes(document)) });
  await page.getByRole('button', { name: 'Save as separate layout', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Export/ }).click(); const copiedArchive = await download(page, 'local-document', 'copied-all-floor.spatial.zip');
  const copiedFiles = readZIP(copiedArchive), copiedManifest = strictJSON(copiedFiles['manifest.json']) as any;
  expect(copiedManifest.profileVersion).toBe('auxilium-spatial-local-document/1.1.0'); expect(copiedManifest.floors).toHaveLength(2);
  expect(copiedFiles['source/geometry.json']).toEqual(jsonBytes(document));
  const copied = await importWorkspace(copiedArchive, 'copy.zip'); expect(copied.document.documentID).not.toBe(document.documentID); expect(copied.document.floors).toEqual(document.floors);
  expect(copied.sourceIdentity).toEqual({ documentID: document.documentID, revision: document.revision, sha256: await sha256(jsonBytes(document)), reason: 'file-import' });
  const browserCopy = await page.evaluate(async raw => { const path = '/src/data/index.ts'; const { importWorkspace } = await import(path); const result = await importWorkspace(Uint8Array.from(raw), 'copy.zip'); return { document: result.document, sourceIdentity: result.sourceIdentity, sourceBytes: Array.from(result.sourceBytes) }; }, Array.from(copiedArchive));
  expect(browserCopy).toEqual({ document: copied.document, sourceIdentity: copied.sourceIdentity, sourceBytes: Array.from(jsonBytes(document)) });
  expect(errors).toEqual([]);
});

test('missing font glyphs fail visibly without losing the exact label or claiming a completed raster export', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: /Open example/ }).click();
  await page.locator('.spatial-object-list button').filter({ hasText: 'Living room' }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Unavailable glyph \u{10ffff}'); await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 2'); await page.getByRole('button', { name: /Export/ }).click();
  const downloads: string[] = []; page.on('download', value => downloads.push(value.suggestedFilename()));
  for (const format of ['png', 'pdf']) {
    await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption(format); await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('drawing-font-missing-glyphs');
  }
  expect(downloads).toEqual([]);
  const svg = await download(page, 'svg', 'missing-glyph-exact.svg'); expect(new TextDecoder().decode(svg)).toContain('Unavailable glyph \u{10ffff}');
});
