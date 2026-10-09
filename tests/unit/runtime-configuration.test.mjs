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

function rejectedBeforeEmission(t, { command = 'build', mode, url = approvedUrl, key, allowLocal = 'false' }) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiliumos-config-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const args = [path.join(root, 'node_modules/vite/bin/vite.js')];
  if (command === 'build') args.push('build');
  args.push('--config', 'web/vite.config.ts', '--logLevel', 'error');
  if (mode) args.push('--mode', mode);
  if (command === 'build') args.push('--outDir', output);
  const result = spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key, VITE_ALLOW_LOCAL_TEST_BACKEND: allowLocal },
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

function cleanBrowserEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('VITE_')) delete env[key];
  delete env.NODE_ENV;
  return env;
}

test('tracked development settings contain only the approved public browser pair and remain mode-scoped', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiliumos-public-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const content = fs.readFileSync(path.join(root, 'web/.env.development'), 'utf8');
  const assignments = content.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  assert.equal(assignments.length, 2, 'Never place other configuration or secrets in the tracked public defaults.');
  assert.equal(assignments[0], 'VITE_SUPABASE_URL=' + approvedUrl);
  assert.match(assignments[1], /^VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_[A-Za-z0-9_-]+$/);
  fs.copyFileSync(path.join(root, 'web/.env.development'), path.join(directory, '.env.development'));
  const script = `import { loadEnv } from 'vite'; const directory = process.argv[1]; process.stdout.write(JSON.stringify({ development: loadEnv('development', directory, 'VITE_'), production: loadEnv('production', directory, 'VITE_') }));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, directory], {
    cwd: root, encoding: 'utf8', timeout: 10_000, env: cleanBrowserEnvironment(),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const loaded = JSON.parse(result.stdout);
  assert.deepEqual(loaded.development, {
    VITE_SUPABASE_URL: approvedUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: assignments[1].slice('VITE_SUPABASE_PUBLISHABLE_KEY='.length),
  });
  assert.deepEqual(loaded.production, {}, 'Normal production mode must not silently inherit the development target.');
});

test('tracked publication settings explicitly configure only the same approved public development pair', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiliumos-publication-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const assignments = fs.readFileSync(path.join(root, 'web/.env.production'), 'utf8')
    .split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  const developmentAssignments = fs.readFileSync(path.join(root, 'web/.env.development'), 'utf8')
    .split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  assert.equal(assignments.length, 2, 'Publication defaults may contain only the public URL and publishable key.');
  assert.equal(assignments[0], 'VITE_SUPABASE_URL=' + approvedUrl);
  assert.match(assignments[1], /^VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_[A-Za-z0-9_-]+$/);
  assert.deepEqual(assignments, developmentAssignments, 'Publishing must not switch the backend or add activation settings.');
  fs.copyFileSync(path.join(root, 'web/.env.production'), path.join(directory, '.env.production'));
  const script = `import { loadEnv } from 'vite'; process.stdout.write(JSON.stringify(loadEnv('production', process.argv[1], 'VITE_')));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, directory], {
    cwd: root, encoding: 'utf8', timeout: 10_000, env: cleanBrowserEnvironment(),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    VITE_SUPABASE_URL: approvedUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: assignments[1].slice('VITE_SUPABASE_PUBLISHABLE_KEY='.length),
  });
});

test('normal production build resolves the repository-root artifact expected by hosting', () => {
  const script = `import { resolveConfig } from 'vite'; const config = await resolveConfig({ configFile: 'web/vite.config.ts', mode: 'production' }, 'build'); process.stdout.write(JSON.stringify({ root: config.root, outDir: config.build.outDir }));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root, encoding: 'utf8', timeout: 10_000, env: cleanBrowserEnvironment(),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(result.stdout);
  assert.equal(path.resolve(resolved.root, resolved.outDir), path.join(root, 'dist'));
});

test('explicit development build emits the tracked public settings in a clean checkout', (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiliumos-development-bundle-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['build:dev'], 'tsc --project web/tsconfig.json --noEmit && vite build --config web/vite.config.ts --mode development --outDir ../dist');
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules/vite/bin/vite.js'), 'build',
    '--config', 'web/vite.config.ts', '--mode', 'development', '--outDir', output, '--logLevel', 'error',
  ], { cwd: root, encoding: 'utf8', timeout: 30_000, env: cleanBrowserEnvironment() });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const key = fs.readFileSync(path.join(root, 'web/.env.development'), 'utf8')
    .match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(sb_publishable_[A-Za-z0-9_-]+)$/m)[1];
  const javascript = fs.readdirSync(path.join(output, 'assets'))
    .filter((file) => file.endsWith('.js')).map((file) => fs.readFileSync(path.join(output, 'assets', file), 'utf8')).join('\n');
  assert.ok(javascript.includes(approvedUrl), 'The actual emitted development app must have its intended backend.');
  assert.ok(javascript.includes(key), 'The actual emitted development app must have its public browser key.');
});

test('development mode still rejects an explicitly supplied server secret before emission', (t) => {
  rejectedBeforeEmission(t, { mode: 'development', key: 'sb_secret_synthetic_development_mode_regression' });
});

test('development mode still rejects an explicitly supplied different backend before emission', (t) => {
  rejectedBeforeEmission(t, { mode: 'development', url: 'https://other-project.example.invalid', key: 'sb_publishable_synthetic_development_mode_regression' });
});

test('production publication settings still reject an explicitly supplied different backend before emission', (t) => {
  rejectedBeforeEmission(t, { url: 'https://other-project.example.invalid', key: 'sb_publishable_synthetic_publication_regression' });
});

test('development-mode builds never enable the development-server-only loopback fixture escape', (t) => {
  rejectedBeforeEmission(t, { mode: 'development', url: 'http://127.0.0.1:54321', key: 'sb_publishable_synthetic_development_mode_regression', allowLocal: 'true' });
});

test('public build-mode ignore exceptions apply to exactly the two reviewed files', () => {
  const cases = [
    ['web/.env.development', 1],
    ['web/.env', 0],
    ['web/.env.local', 0],
    ['web/.env.development.local', 0],
    ['web/.env.production', 1],
    ['web/.env.production.local', 0],
    ['.env.production', 0],
    ['web/src/.env.development', 0],
    ['web/src/.env.production', 0],
    ['tools/.env.development', 0],
    ['tools/.env.production', 0],
  ];
  for (const [file, expected] of cases) {
    const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', '--', file], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, expected, 'Unexpected ignore decision for ' + file);
  }
});
