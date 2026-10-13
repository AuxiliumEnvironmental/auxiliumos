import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), root = dirname(web), output = join(web, 'tests/data/generated');
const executable = process.env.SPATIAL_BROWSER_EXECUTABLE ?? join(web, 'tests/ui/.browser-runtime/chromium');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function paths(directory) { const result = []; for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) result.push(...await paths(path)); else if (/\.(?:ts|tsx|css)$/.test(path)) result.push(path); } return result; }
async function hashes() { const all = [...await paths(join(web, 'src')), fileURLToPath(import.meta.url), ...['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(name => join(web, name))]; return Object.fromEntries(await Promise.all(all.sort().map(async path => [relative(root, path), sha(await readFile(path))]))); }
await mkdir(output, { recursive: true }); const profile = await mkdtemp(join(tmpdir(), 'auxilium-spatial-recovery-')), before = await hashes(), stages = [];
const server = await createServer({ server: { host: '127.0.0.1', port: 4178, strictPort: true } }); await server.listen();
let active;
async function launch() {
  const child = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', 'about:blank'], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise(resolve => { child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', () => resolve({ code: null, signal: 'spawn-error' })); }); active = { child, exited }; let diagnostic = '';
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`chromium-start-timeout: ${diagnostic}`)), 15_000);
    child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('exit', () => { clearTimeout(timer); reject(new Error(`chromium-start-exit: ${diagnostic}`)); });
    child.stderr.on('data', bytes => { diagnostic = (diagnostic + bytes.toString()).slice(-8000); const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(diagnostic); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const browser = await chromium.connectOverCDP(endpoint), context = browser.contexts()[0]; await context.setDefaultTimeout(15_000);
  const page = context.pages()[0] ?? await context.newPage(); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('http://127.0.0.1:4178');
  active = { child, exited, browser, page }; return page;
}
async function terminate() {
  assert.ok(active); const current = active; active = undefined;
  if (current.child.pid) { try { process.kill(-current.child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } } const exit = await current.exited; if (current.browser) await current.browser.close().catch(() => {});
  assert.equal(exit.signal, 'SIGKILL'); return exit;
}
async function state(page, documentID) {
  return page.evaluate(async id => {
    const path = '/src/data/index.ts', { SpatialWebStore, SpatialOutbox } = await import(path), store = new SpatialWebStore('auxilium-spatial-local-v1');
    try { const workspace = await store.open(id), frozen = await store.loadFrozen(id, 2), outbox = await new SpatialOutbox(store).list(); return { workspace, frozen: { hash: frozen.hash, document: frozen.document }, outbox }; } finally { store.close(); }
  }, documentID);
}
let failure;
try {
  const document = JSON.parse(await readFile(join(root, 'fixtures/geometry.json'), 'utf8')); document.documentID = 'actual-browser-recovery'; document.title = 'Synthetic browser crash recovery';
  let page = await launch(); await page.locator('input[type=file]').setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator('.spatial-save-state')).toContainText('Revision 1'); await page.locator('.spatial-object-list button').filter({ hasText: document.floors[0].rooms[0].label }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Durably acknowledged correction'); await page.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 2'); await expect(page.locator('.spatial-save-state')).toContainText('Saved locally');
  await page.getByRole('button', { name: 'Revisions', exact: true }).click(); await page.getByRole('button', { name: 'Freeze revision 2', exact: true }).click(); await expect(page.locator('.spatial-revision-list')).toContainText('Revision 2'); await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.evaluate(async id => { const path = '/src/data/index.ts', { SpatialWebStore, SpatialOutbox } = await import(path), store = new SpatialWebStore('auxilium-spatial-local-v1'); try { await new SpatialOutbox(store).enqueue(await store.loadFrozen(id, 2), { system: 'auxiliumos', contextID: 'synthetic-recovery-context' }, 'process-recovery-request'); } finally { store.close(); } }, document.documentID);
  const acknowledged = await state(page, document.documentID), firstExit = await terminate();
  page = await launch(); const afterAcknowledgedKill = await state(page, document.documentID); assert.deepEqual(afterAcknowledgedKill, acknowledged);
  stages.push({ scenario: 'SIGKILL_after_acknowledged_real_UI_save_freeze_and_disabled_outbox_enqueue', termination: firstExit, reopenedRevision: afterAcknowledgedKill.workspace.document.revision, exactFrozenHash: afterAcknowledgedKill.frozen.hash, graphHistoryFrozenAndOutboxUnchanged: true });
  await page.locator('.spatial-project-card').filter({ hasText: document.title }).click(); await page.locator('.spatial-object-list button').filter({ hasText: 'Durably acknowledged correction' }).click();
  await page.evaluate(() => {
    globalThis.__spatialHeldWrite = { written: false, committed: false };
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'drafts') {
        const table = this, transaction = this.transaction; let keepAlive = true;
        transaction.addEventListener('complete', () => { globalThis.__spatialHeldWrite.committed = true; keepAlive = false; }); transaction.addEventListener('abort', () => { keepAlive = false; });
        request.addEventListener('success', () => {
          globalThis.__spatialHeldWrite.written = true;
          const hold = () => { if (!keepAlive) return; const next = table.get(args[0].documentID); next.addEventListener('success', hold); next.addEventListener('error', () => { keepAlive = false; }); }; hold();
          setTimeout(() => { keepAlive = false; }, 15_000);
        });
      }
      return request;
    };
  });
  await page.getByLabel('Room name', { exact: true }).fill('Interrupted unacknowledged correction'); await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.waitForFunction(() => globalThis.__spatialHeldWrite.written); assert.equal(await page.evaluate(() => globalThis.__spatialHeldWrite.committed), false); await expect(page.locator('.spatial-save-state')).not.toContainText('Saved locally'); assert.equal(await page.evaluate(() => globalThis.__spatialHeldWrite.committed), false);
  const secondExit = await terminate(); page = await launch(); const afterHeldKill = await state(page, document.documentID); assert.deepEqual(afterHeldKill, acknowledged);
  await page.locator('.spatial-project-card').filter({ hasText: document.title }).click(); await page.getByRole('button', { name: /Undo/ }).click(); await expect(page.locator('.spatial-save-state')).toContainText('Revision 3'); await expect(page.locator('.spatial-object-list')).toContainText(document.floors[0].rooms[0].label);
  const undone = await state(page, document.documentID); assert.equal(undone.workspace.document.revision, 3); assert.equal(undone.workspace.document.floors[0].rooms[0].label, document.floors[0].rooms[0].label); assert.equal(undone.workspace.canRedo, true); assert.deepEqual(undone.frozen, acknowledged.frozen); assert.deepEqual(undone.outbox, acknowledged.outbox);
  stages.push({ scenario: 'SIGKILL_after_real_UI_IDB_put_before_transaction_commit', termination: secondExit, reopenedRevision: afterHeldKill.workspace.document.revision, graphAndUndoNotPartiallyCommitted: true, undoUsableAfterRecovery: true, immutableFrozenAndDisabledOutboxUnchanged: true });
} catch (error) { failure = error instanceof Error ? error.stack : String(error); }
finally { if (active) await terminate().catch(error => { failure ??= String(error); }); await server.close(); await rm(profile, { recursive: true, force: true }); }
const after = await hashes(), unchanged = JSON.stringify(before) === JSON.stringify(after);
const report = { priorAttempts: ['prior-browser-recovery-viewport', 'prior-browser-recovery-pending-label'], status: !failure && unchanged && stages.length === 2 ? 'passed' : 'failed_or_inputs_changed', timestampUTC: new Date().toISOString(), evidenceClass: 'actual_desktop_Chromium_process_termination_with_real_UI_and_IndexedDB', inputBaselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), command: 'node --import tsx tests/data/browser-recovery.mjs', workingSourceHashes: before, inputsUnchangedDuringRun: unchanged, browserSHA256: sha(await readFile(executable)), stages, failure, limitations: ['Synthetic isolated persistent profile only, removed after test', 'Transaction hold is test instrumentation on the actual UI-triggered IDB put', 'No Apple SDK, iOS WebView, physical device, capture, live integration or release acceptance'] };
await writeFile(join(output, 'BROWSER_RECOVERY_EVIDENCE.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ status: report.status, scenarios: stages.length, inputsUnchangedDuringRun: unchanged, failure })); if (report.status !== 'passed') process.exitCode = 1;
