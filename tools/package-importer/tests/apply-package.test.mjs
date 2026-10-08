import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyPackage } from '../apply-package.mjs';

const SCRIPT = fileURLToPath(new URL('../apply-package.mjs', import.meta.url));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, relative, contents) => { fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true }); fs.writeFileSync(path.join(root, relative), contents); };
const read = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiliumos import fixture '));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const target = path.join(temporary, 'working repo');
  const packageRoot = path.join(temporary, 'continuation package');
  fs.mkdirSync(target);
  fs.mkdirSync(packageRoot);
  git(target, 'init', '-b', 'main');
  git(target, 'config', 'user.name', 'Importer Fixture');
  git(target, 'config', 'user.email', 'fixture@example.invalid');
  git(target, 'remote', 'add', 'origin', 'https://github.com/AuxiliumEnvironmental/auxiliumos.git');
  write(target, 'AGENTS.md', 'Original instructions\n');
  write(target, 'src/preserved.js', 'export const preserved = true;\n');
  git(target, 'add', '.');
  git(target, 'commit', '-m', 'Synthetic source baseline');
  const sourceCommit = git(target, 'rev-parse', 'HEAD');
  git(target, 'switch', '-c', 'modernization/fixture');
  const manifest = {
    version: 1,
    source_repository: 'https://github.com/AuxiliumEnvironmental/auxiliumos.git',
    source_commit: sourceCommit,
    files: [
      { path: 'AGENTS.md', before_sha256: hash('Original instructions\n'), after_sha256: hash('Modernized instructions\n') },
      { path: 'docs/new/handoff.md', before_sha256: null, after_sha256: hash('Current handoff\n') },
    ],
  };
  write(packageRoot, 'repo/AGENTS.md', 'Modernized instructions\n');
  write(packageRoot, 'repo/docs/new/handoff.md', 'Current handoff\n');
  const saveManifest = () => write(packageRoot, 'PACKAGE_MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
  saveManifest();
  return { temporary, target, packageRoot, manifest, sourceCommit, saveManifest };
}

test('default preflight does not create targets, journals, commits or branches', (t) => {
  const f = fixture(t);
  const result = applyPackage(f);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.add, 1);
  assert.equal(result.update, 1);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
  assert.equal(fs.existsSync(path.join(f.target, 'docs')), false);
  assert.equal(fs.existsSync(path.join(f.target, '.git/auxiliumos-package-imports')), false);
  assert.equal(git(f.target, 'rev-parse', 'HEAD'), f.sourceCommit);
  assert.equal(git(f.target, 'status', '--porcelain'), '');
});

test('successful import preserves unrelated files and repeats exactly without rewriting', (t) => {
  const f = fixture(t);
  const result = applyPackage({ ...f, apply: true });
  assert.equal(result.mode, 'applied');
  assert.equal(read(f.target, 'AGENTS.md'), 'Modernized instructions\n');
  assert.equal(read(f.target, 'docs/new/handoff.md'), 'Current handoff\n');
  assert.equal(read(f.target, 'src/preserved.js'), 'export const preserved = true;\n');
  assert.equal(git(f.target, 'rev-parse', 'HEAD'), f.sourceCommit);
  const modified = fs.statSync(path.join(f.target, 'AGENTS.md')).mtimeMs;
  assert.equal(applyPackage({ ...f, apply: true }).mode, 'already-applied');
  assert.equal(fs.statSync(path.join(f.target, 'AGENTS.md')).mtimeMs, modified);
  git(f.target, 'add', '.');
  assert.equal(applyPackage({ ...f, apply: true }).mode, 'already-applied');
});

test('a newer unrelated committed change is preserved when all baseline targets still match', (t) => {
  const f = fixture(t);
  write(f.target, 'src/preserved.js', 'export const preserved = "newer work";\n');
  git(f.target, 'add', '.');
  git(f.target, 'commit', '-m', 'Newer non-target source');
  const head = git(f.target, 'rev-parse', 'HEAD');
  applyPackage({ ...f, apply: true });
  assert.equal(read(f.target, 'src/preserved.js'), 'export const preserved = "newer work";\n');
  assert.equal(git(f.target, 'rev-parse', 'HEAD'), head);
});

test('target conflict refuses the entire import before any writes', (t) => {
  const f = fixture(t);
  write(f.target, 'AGENTS.md', 'Owner changed this after the ZIP\n');
  git(f.target, 'add', '.');
  git(f.target, 'commit', '-m', 'Newer target changes');
  assert.throws(() => applyPackage({ ...f, apply: true }), /Import conflicts/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Owner changed this after the ZIP\n');
  assert.equal(fs.existsSync(path.join(f.target, 'docs')), false);
  assert.equal(git(f.target, 'status', '--porcelain'), '');
});

test('new-file collision refuses updates to other target files', (t) => {
  const f = fixture(t);
  write(f.target, 'docs/new/handoff.md', 'Existing owner handoff\n');
  assert.throws(() => applyPackage({ ...f, apply: true }), /Import conflicts/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
  assert.equal(read(f.target, 'docs/new/handoff.md'), 'Existing owner handoff\n');
});

test('a corrupt or missing payload refuses all target changes', (t) => {
  const f = fixture(t);
  write(f.packageRoot, 'repo/docs/new/handoff.md', 'Corrupt bytes\n');
  assert.throws(() => applyPackage({ ...f, apply: true }), /Payload is missing or corrupt/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
  fs.unlinkSync(path.join(f.packageRoot, 'repo/docs/new/handoff.md'));
  assert.throws(() => applyPackage({ ...f, apply: true }), /Payload is missing or corrupt/);
});

test('unsafe paths, duplicate paths and case collisions are rejected', (t) => {
  const f = fixture(t);
  for (const unsafe of ['../escape', '/tmp/escape', 'C:/escape', '.git/config', 'a/../escape', 'a\\escape', 'a//escape', 'a/.Git/config', 'a/CON.txt']) {
    f.manifest.files[1].path = unsafe;
    f.saveManifest();
    assert.throws(() => applyPackage({ ...f, apply: true }), /Unsafe manifest path/, unsafe);
  }
  for (const duplicate of ['AGENTS.md', 'agents.md']) {
    f.manifest.files[1].path = duplicate;
    f.saveManifest();
    assert.throws(() => applyPackage({ ...f, apply: true }), /Duplicate or case-colliding/);
  }
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
});

test('symlink destination parents and payload symlinks are rejected', (t) => {
  const f = fixture(t);
  const outside = path.join(f.temporary, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.target, 'docs'), 'dir');
  assert.throws(() => applyPackage({ ...f, apply: true }), /Symlinks are not permitted/);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(f.target, 'docs'));
  fs.unlinkSync(path.join(f.packageRoot, 'repo/AGENTS.md'));
  fs.symlinkSync(path.join(f.target, 'AGENTS.md'), path.join(f.packageRoot, 'repo/AGENTS.md'));
  assert.throws(() => applyPackage({ ...f, apply: true }), /Symlinks are not permitted/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
});

test('wrong origin is rejected and SSH origin is accepted', (t) => {
  const f = fixture(t);
  git(f.target, 'remote', 'set-url', 'origin', 'https://github.com/other-owner/other-repo.git');
  assert.throws(() => applyPackage({ ...f, apply: true }), /origin does not identify/);
  git(f.target, 'remote', 'set-url', 'origin', 'git@github.com:AuxiliumEnvironmental/auxiliumos.git');
  assert.equal(applyPackage(f).mode, 'dry-run');
});

test('apply rejects main and detached HEAD while dry run permits inspection', (t) => {
  const f = fixture(t);
  git(f.target, 'switch', 'main');
  assert.equal(applyPackage(f).mode, 'dry-run');
  assert.throws(() => applyPackage({ ...f, apply: true }), /named working branch other than main\/master/);
  git(f.target, 'checkout', '--detach');
  assert.throws(() => applyPackage({ ...f, apply: true }), /named working branch other than main\/master/);
});

test('dirty first import and unrelated dirt during repeat are rejected', (t) => {
  const f = fixture(t);
  write(f.target, 'owner-notes.txt', 'Uncommitted owner notes\n');
  assert.throws(() => applyPackage({ ...f, apply: true }), /Working tree is dirty/);
  fs.unlinkSync(path.join(f.target, 'owner-notes.txt'));
  applyPackage({ ...f, apply: true });
  write(f.target, 'owner-notes.txt', 'Unrelated new notes\n');
  assert.throws(() => applyPackage({ ...f, apply: true }), /beyond this exact package/);
  assert.equal(read(f.target, 'owner-notes.txt'), 'Unrelated new notes\n');
});

test('staged content different from the package is not mistaken for an exact repeat', (t) => {
  const f = fixture(t);
  applyPackage({ ...f, apply: true });
  write(f.target, 'AGENTS.md', 'Separate staged edit\n');
  git(f.target, 'add', 'AGENTS.md');
  write(f.target, 'AGENTS.md', 'Modernized instructions\n');
  assert.throws(() => applyPackage({ ...f, apply: true }), /Staged content differs/);
});

test('source commit must exist and be an ancestor of HEAD', (t) => {
  const f = fixture(t);
  f.manifest.source_commit = '0'.repeat(40);
  f.saveManifest();
  assert.throws(() => applyPackage({ ...f, apply: true }), /not present locally/);
  git(f.target, 'switch', '--orphan', 'unrelated-history');
  write(f.target, 'unrelated.txt', 'Another history\n');
  git(f.target, 'add', '.');
  git(f.target, 'commit', '-m', 'Unrelated history');
  f.manifest.source_commit = f.sourceCommit;
  f.saveManifest();
  assert.throws(() => applyPackage({ ...f, apply: true }), /not an ancestor/);
});

test('target must be the repository root', (t) => {
  const f = fixture(t);
  assert.throws(() => applyPackage({ ...f, target: path.join(f.target, 'src'), apply: true }), /Git repository root/);
});

test('write failure rolls back earlier writes and removes only new empty directories', (t) => {
  const f = fixture(t);
  assert.throws(() => applyPackage({ ...f, apply: true, hooks: { afterFileWrite() { throw new Error('Synthetic write failure'); } } }), /rolled back from verified backups/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
  assert.equal(fs.existsSync(path.join(f.target, 'docs')), false);
  assert.equal(git(f.target, 'status', '--porcelain'), '');
  assert.equal(applyPackage({ ...f, apply: true }).mode, 'applied');
});

test('failure after adding a new file restores both updated and added targets', (t) => {
  const f = fixture(t);
  assert.throws(() => applyPackage({ ...f, apply: true, hooks: { afterFileWrite(_path, index) { if (index === 1) throw new Error('Synthetic failure after add'); } } }), /rolled back from verified backups/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
  assert.equal(fs.existsSync(path.join(f.target, 'docs')), false);
  assert.equal(git(f.target, 'status', '--porcelain'), '');
});

test('journal directory symlinks are rejected before target changes', (t) => {
  const f = fixture(t);
  const outside = path.join(f.temporary, 'outside-journal');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(f.target, '.git/auxiliumos-package-imports'));
  fs.symlinkSync(outside, path.join(f.target, '.git/auxiliumos-package-imports/transactions'), 'dir');
  assert.throws(() => applyPackage({ ...f, apply: true }), /Symlinks are not permitted/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
  assert.deepEqual(fs.readdirSync(outside), []);
});

function interruptAfterFirstWrite(f) {
  const code = `import { applyPackage } from ${JSON.stringify(pathToFileURL(SCRIPT).href)}; applyPackage({packageRoot:${JSON.stringify(f.packageRoot)},target:${JSON.stringify(f.target)},apply:true,hooks:{afterFileWrite(){process.exit(99)}}});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(result.status, 99, result.stderr);
}

test('abrupt interruption is detected, then explicit recovery restores original files', (t) => {
  const f = fixture(t);
  interruptAfterFirstWrite(f);
  assert.equal(read(f.target, 'AGENTS.md'), 'Modernized instructions\n');
  assert.throws(() => applyPackage(f), /unfinished import/);
  assert.equal(applyPackage({ ...f, recover: true }).mode, 'recovered');
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
  assert.equal(fs.existsSync(path.join(f.target, 'docs')), false);
  assert.equal(git(f.target, 'status', '--porcelain'), '');
  assert.equal(applyPackage({ ...f, apply: true }).mode, 'applied');
});

test('recovery refuses newer edits and preserves the journal for later resolution', (t) => {
  const f = fixture(t);
  interruptAfterFirstWrite(f);
  write(f.target, 'AGENTS.md', 'Owner edits after interruption\n');
  assert.throws(() => applyPackage({ ...f, recover: true }), /Recovery conflict/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Owner edits after interruption\n');
  assert.equal(fs.existsSync(path.join(f.target, '.git/auxiliumos-package-imports/active.json')), true);
});

test('recovery rejects a changed HEAD even when package target bytes still match', (t) => {
  const f = fixture(t);
  interruptAfterFirstWrite(f);
  write(f.target, 'src/preserved.js', 'New work after interruption\n');
  git(f.target, 'add', 'src/preserved.js');
  git(f.target, 'commit', '-m', 'New source after interrupted import');
  assert.throws(() => applyPackage({ ...f, recover: true }), /HEAD and branch/);
  assert.equal(read(f.target, 'AGENTS.md'), 'Modernized instructions\n');
  assert.equal(read(f.target, 'src/preserved.js'), 'New work after interruption\n');
});

test('CLI requires a target and rejects conflicting or unknown flags', () => {
  for (const args of [[], ['--wat'], ['--target'], ['--package-root'], ['--target', 'somewhere', '--apply', '--recover']]) {
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Import refused/);
  }
});

test('CLI accepts an explicit package root separate from the script location', (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [SCRIPT, '--package-root', f.packageRoot, '--target', f.target], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'dry-run');
  assert.equal(output.add, 1);
  assert.equal(output.update, 1);
  assert.equal(output.sourceCommit, f.sourceCommit);
  assert.equal(read(f.target, 'AGENTS.md'), 'Original instructions\n');
});
