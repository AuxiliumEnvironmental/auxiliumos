import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureCapabilities, captureRoom } from '../../src/capture';
import { nativeExportFilename, saveExport } from '../../src/exportDelivery';
test('browser capture never invokes native sensors or fabricates geometry', async () => {
  assert.equal((await captureCapabilities()).available, false);
  await assert.rejects(captureRoom(), /installed iPhone/);
});
test('native delivery sanitizes path-like Unicode names without changing output extension', () => {
  const name = nativeExportFilename('../area/測定.very-long_' + 'x'.repeat(256) + '.json', 'application/json');
  assert.match(name, /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/); assert.ok(name.endsWith('.json')); assert.ok(!name.includes('..'));
  assert.throws(() => nativeExportFilename('page.html','text/html'));
});
test('oversize or unsupported delivery is rejected before creating browser or native side effects', async () => {
  await assert.rejects(saveExport({filename:'bad.html',mimeType:'text/html',bytes:new Uint8Array([1]),revision:1,hash:''}), /unsupported/);
  await assert.rejects(saveExport({filename:'large.zip',mimeType:'application/zip',bytes:new Uint8Array(32*1024*1024+1),revision:1,hash:''}), /limit/);
});
