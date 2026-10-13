// Exercise the real built application on two local origins. This is not a live
// domain, host authentication, or physical-device test.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { unzipSync } from 'fflate';

const release = resolve(process.argv[2] ?? ''), output = resolve(process.argv[3] ?? 'tests/integration/artifacts/standalone-built');
const root = resolve(release, 'site'), manifest = JSON.parse(await readFile(resolve(release, 'RELEASE.json'), 'utf8'));
const servers = [], origins = [], contexts = [];
let browser;
const report = { sourceCommit: manifest.sourceCommit, workspaceInputSHA256: manifest.workspaceInputSHA256,
  scope: 'Compiled application on two loopback origins with synthetic geometry. No real domain, hosted authentication, native device or live integration acceptance.', checks: [] };
const check = name => report.checks.push({ name, passed: true });
try {
  for (let i = 0; i < 2; i++) {
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
        const data = await readFile(path);
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(path)] ?? 'application/octet-stream');
        response.end(data);
      } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
    origins.push(`http://127.0.0.1:${server.address().port}`);
  }
  browser = await chromium.launch({ executablePath: process.env.SPATIAL_BROWSER_EXECUTABLE,
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  await context.route('**/*', route => origins.some(origin => route.request().url().startsWith(origin + '/')) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const served = await (await page.request.get(origins[0] + '/spatial-release.json')).json();
  assert.equal(served.sourceCommit, manifest.sourceCommit); assert.equal(served.workspaceInputSHA256, manifest.workspaceInputSHA256);
  check('served revision identity matches the packaged application');
  await page.goto(origins[0]);
  await page.getByRole('button', { name: '+ New layout', exact: true }).click();
  await page.getByLabel('Layout name').fill('Independent host synthetic transfer');
  await page.getByRole('button', { name: 'Create layout', exact: true }).click();
  await page.getByRole('button', { name: 'Draw rectangular room', exact: true }).click();
  const canvas = await page.locator('.spatial-plan>svg').boundingBox(); assert.ok(canvas);
  await page.mouse.click(canvas.x + canvas.width * .25, canvas.y + canvas.height * .3);
  await page.mouse.click(canvas.x + canvas.width * .65, canvas.y + canvas.height * .65);
  await page.getByRole('button', { name: 'Finish room', exact: true }).click();
  await page.getByText('Saved locally', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: /Undo/ }).click();
  await page.locator('.spatial-save-state').filter({ hasText: 'Revision 3' }).waitFor();
  await page.getByRole('button', { name: /Redo/ }).click();
  await page.locator('.spatial-save-state').filter({ hasText: 'Revision 4' }).waitFor();
  check('built app creates a canonical room with saved undo and redo');
  await page.getByRole('button', { name: '3D model', exact: true }).click();
  await page.locator('.spatial-model-canvas canvas').waitFor();
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'built-room-3d.png'), fullPage: true });
  await page.reload();
  await page.locator('.spatial-project-card').filter({ hasText: 'Independent host synthetic transfer' }).click();
  await page.locator('.spatial-save-state').filter({ hasText: 'Revision 4' }).waitFor();
  check('built app reopens saved geometry after page reload');
  await page.getByRole('button', { name: /Export/ }).click();
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('local-document');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Prepare download', exact: true }).click();
  const download = await downloadPromise, bytes = await readFile(await download.path());
  const originalGeometry = JSON.parse(new TextDecoder().decode(unzipSync(bytes)['geometry.json']));
  report.backupSHA256 = createHash('sha256').update(bytes).digest('hex');
  const backup = resolve(output, 'synthetic-transfer.auxspatial'); await writeFile(backup, bytes);
  check('exact saved revision exports as a local-document backup');
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts.push(other);
  await other.route('**/*', route => origins.some(origin => route.request().url().startsWith(origin + '/')) ? route.continue() : route.abort());
  const target = await other.newPage(); target.on('pageerror', error => errors.push(error.message));
  await target.goto(origins[1]);
  await target.getByText('Your layouts will be saved here.', { exact: true }).waitFor();
  assert.equal(await target.locator('.spatial-project-card').count(), 0);
  check('a separate origin starts without silently sharing the original drafts');
  await target.locator('input[type=file]').setInputFiles({ name: 'synthetic-transfer.zip', mimeType: 'application/zip', buffer: bytes });
  await target.locator('.spatial-save-state').filter({ hasText: 'Revision 4' }).waitFor();
  await target.reload();
  await target.locator('.spatial-project-card').filter({ hasText: 'Independent host synthetic transfer' }).click();
  await target.locator('.spatial-save-state').filter({ hasText: 'Revision 4' }).waitFor();
  assert.equal(await target.locator('.spatial-plan>svg text').filter({ hasText: 'Room 1' }).count(), 1);
  assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await target.screenshot({ path: resolve(output, 'built-imported-room-mobile.png'), fullPage: true });
  await target.getByRole('button', { name: /Export/ }).click();
  await target.getByRole('combobox', { name: 'Format', exact: true }).selectOption('geometry');
  const transferredDownload = target.waitForEvent('download');
  await target.getByRole('button', { name: 'Prepare download', exact: true }).click();
  const transferred = await transferredDownload;
  assert.deepEqual(JSON.parse(await readFile(await transferred.path(), 'utf8')), originalGeometry);
  check('explicit backup import persists the chosen revision on a second origin');
  await page.reload(); await page.locator('.spatial-project-card').filter({ hasText: 'Independent host synthetic transfer' }).click();
  await page.locator('.spatial-save-state').filter({ hasText: 'Revision 4' }).waitFor();
  check('original origin remains intact after transfer');
  assert.deepEqual(errors, []); check('no unhandled browser errors during the exercised journeys');
  report.result = 'passed';
} catch (error) {
  report.result = 'failed'; report.error = String(error.stack ?? error); process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  if (browser) await browser.close();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await mkdir(output, { recursive: true }); await writeFile(resolve(output, 'RESULT.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
