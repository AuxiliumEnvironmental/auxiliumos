import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { PRIVATE_BUCKET, PRIVATE_BUCKET_OPTIONS, provisionPrivateBucket } from '../../scripts/private-object-provision.mjs';

const ok = data => ({ data, error: null });
const settings = () => ({ id: PRIVATE_BUCKET, public: false, file_size_limit: 65_536, allowed_mime_types: ['text/plain'] });
function fixture({ bucket = null, entries = [], failure } = {}) {
  const calls = [];
  const response = (name, data) => failure === name ? { data: null, error: { message: 'raw-provider-secret' } } : ok(data);
  const client = { storage: {
    listBuckets: async () => { calls.push('inventory'); return response('inventory', bucket ? [bucket] : []); },
    createBucket: async (id, options) => {
      calls.push('create'); assert.equal(id, PRIVATE_BUCKET); assert.deepEqual(options, PRIVATE_BUCKET_OPTIONS);
      bucket = settings(); return response('create', { name: id });
    },
    getBucket: async id => { calls.push('readback'); assert.equal(id, PRIVATE_BUCKET); return response('readback', bucket); },
    from: id => { assert.equal(id, PRIVATE_BUCKET); return { list: async () => { calls.push('entries'); return response('entries', entries); } }; },
  } };
  return { client, calls };
}

test('verify-only cannot create a missing bucket; explicit create uses exact supported API settings', async () => {
  const f = fixture();
  await assert.rejects(provisionPrivateBucket(f.client), /absent/);
  assert.deepEqual(f.calls, ['inventory']);
  const result = await provisionPrivateBucket(f.client, { create: true });
  assert.equal(result.mode, 'create-if-absent'); assert.equal(result.created, true);
  assert.equal(result.policiesAndSigningHistoryVerified, false);
  assert.equal(result.existingEntriesReviewed, false);
  assert.deepEqual(f.calls, ['inventory', 'inventory', 'create', 'readback', 'entries']);
});

test('existing entries require an explicit review acknowledgment on every run, without update or deletion', async () => {
  const f = fixture({ bucket: settings(), entries: [{ name: 'preserved-account-prefix' }] });
  await assert.rejects(provisionPrivateBucket(f.client, { create: true }), /contains existing/);
  const result = await provisionPrivateBucket(f.client, { reviewedExisting: true });
  assert.equal(result.mode, 'verify-only'); assert.equal(result.created, false);
  assert.equal(result.containsEntries, true); assert.equal(result.existingEntriesReviewed, true);
  assert.equal(result.policiesAndSigningHistoryVerified, false);
  assert.ok(!f.calls.includes('create'));
});

test('even create plus review cannot adopt or repair unsafe existing bucket settings', async () => {
  for (const change of [{ public: true }, { file_size_limit: 65_537 }, { allowed_mime_types: ['text/plain', 'application/pdf'] }]) {
    const f = fixture({ bucket: { ...settings(), ...change } });
    await assert.rejects(provisionPrivateBucket(f.client, { create: true, reviewedExisting: true }), /configuration differs/);
    assert.deepEqual(f.calls, ['inventory', 'readback']);
  }
});

test('ambiguous provider errors fail closed, reveal no raw details and never retry a creation', async () => {
  for (const failure of ['inventory', 'create', 'readback', 'entries']) {
    const f = fixture({ failure });
    await assert.rejects(provisionPrivateBucket(f.client, { create: true }), error => !error.message.includes('raw-provider-secret'));
    assert.ok(f.calls.filter(name => name === 'create').length <= 1);
    if (failure === 'inventory') assert.deepEqual(f.calls, ['inventory']);
  }
});

test('strings cannot accidentally authorize create/reuse', async () => {
  const f = fixture();
  for (const options of [{ create: 'false' }, { reviewedExisting: 'true' }]) {
    await assert.rejects(provisionPrivateBucket(f.client, options), /explicit booleans/);
  }
  assert.deepEqual(f.calls, []);
});

test('CLI refuses unsupported targets, missing secrets and unknown options without emitting supplied values', () => {
  for (const [url, key, flags] of [
    ['https://unapproved-project.supabase.co', 'sentinel-key-must-not-print', []],
    ['https://txofqxictwecgcnvezlb.supabase.co', '   ', []],
    ['https://txofqxictwecgcnvezlb.supabase.co', 'sentinel-key-must-not-print', ['--auto-enable']],
  ]) {
    const result = spawnSync(process.execPath, ['scripts/private-object-provision.mjs', ...flags], {
      cwd: new URL('../../', import.meta.url), encoding: 'utf8',
      env: { PATH: process.env.PATH, AUXILIUMOS_TEST_URL: url, AUXILIUMOS_TEST_SERVICE_ROLE_KEY: key },
    });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.ok(!result.stderr.includes('sentinel-key-must-not-print'));
    assert.ok(!result.stderr.includes('unapproved-project'));
  }
});
