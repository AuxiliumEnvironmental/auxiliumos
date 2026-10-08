import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const approvedUrl = 'https://txofqxictwecgcnvezlb.supabase.co';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function rejectedBeforeEmission(t, { command = 'build', url = approvedUrl, key }) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiliumos-config-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const args = [path.join(root, 'node_modules/vite/bin/vite.js')];
  if (command === 'build') args.push('build');
  args.push('--config', 'web/vite.config.ts', '--logLevel', 'error');
  if (command === 'build') args.push('--outDir', output);
  const result = spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key, VITE_ALLOW_LOCAL_TEST_BACKEND: 'false' },
  });
  assert.equal(result.error, undefined, 'Configuration must reject immediately, not start a server and time out.');
  assert.equal(result.status, 1, 'Unsafe browser configuration must prevent Vite startup/build.');
  assert.equal(fs.readdirSync(output).length, 0, 'Rejected configuration must emit no browser artifact.');
  assert.equal(`${result.stdout}${result.stderr}`.includes(key), false, 'Error output must not echo the rejected key.');
}

test('Vite rejects a synthetic server secret before emitting a bundle', (t) => {
  rejectedBeforeEmission(t, { key: 'sb_secret_synthetic_configuration_regression' });
});

test('Vite rejects a synthetic legacy service-role JWT before emitting a bundle', (t) => {
  const key = `${encode({ alg: 'HS256' })}.${encode({ role: 'service_role' })}.synthetic-signature`;
  rejectedBeforeEmission(t, { key });
});

test('development startup rejects a different backend before opening a server', (t) => {
  rejectedBeforeEmission(t, { command: 'serve', url: 'https://other-project.example.invalid', key: 'sb_publishable_synthetic_configuration_regression' });
});
