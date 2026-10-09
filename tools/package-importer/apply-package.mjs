#!/usr/bin/env node
/** Baseline-aware AuxiliumOS continuation importer. Node built-ins only. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXPECTED_REPOSITORY = 'github.com/auxiliumenvironmental/auxiliumos';
const SCRIPT = fileURLToPath(import.meta.url);
const DEFAULT_PACKAGE_ROOT = path.resolve(path.dirname(SCRIPT), '..');
const HEX = /^[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = (message) => { throw new Error(message); };
const exists = (value) => { try { fs.lstatSync(value); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };

function git(target, args, { allowFailure = false, binary = false } = {}) {
  try {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd: target, encoding: binary ? undefined : 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    if (allowFailure) return null;
    fail(`Git check failed (${args[0]}). Verify this is an accessible local Git repository; no fetch or reset was attempted.`);
  }
}

function repositoryIdentity(raw) {
  let value = raw.trim();
  if (/^git@github\.com:/i.test(value)) value = `ssh://git@github.com/${value.slice(value.indexOf(':') + 1)}`;
  let url;
  try { url = new URL(value); } catch { fail('Repository URL must be the expected GitHub SSH or HTTPS URL.'); }
  if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname.toLowerCase() !== 'github.com' ||
      url.port || url.search || url.hash || url.password ||
      (url.protocol === 'https:' && url.username) || (url.protocol === 'ssh:' && url.username !== 'git')) {
    fail('Repository URL must be the expected GitHub SSH or HTTPS URL without embedded credentials.');
  }
  return `${url.hostname}${url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '')}`.toLowerCase();
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f\x7f:]/.test(value) ||
      path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) fail(`Unsafe manifest path: ${JSON.stringify(value)}.`);
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' ||
      /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(part))) {
    fail(`Unsafe manifest path: ${JSON.stringify(value)}.`);
  }
  return value;
}

function checkedPath(root, relative, { finalFile = false } = {}) {
  const rel = safeRelative(relative);
  let current = root;
  const parts = rel.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    if (!exists(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(`Symlinks are not permitted in package targets or payload paths: ${rel}.`);
    if (i < parts.length - 1 && !stat.isDirectory()) fail(`A parent path is not a directory: ${rel}.`);
    if (i === parts.length - 1 && finalFile && !stat.isFile()) fail(`Expected a regular file: ${rel}.`);
  }
  return current;
}

function regularRoot(value, label) {
  const resolved = path.resolve(value);
  if (!exists(resolved) || fs.lstatSync(resolved).isSymbolicLink() || !fs.lstatSync(resolved).isDirectory()) {
    fail(`${label} must be an existing directory, not a symlink.`);
  }
  return fs.realpathSync(resolved);
}

function loadManifest(packageRoot) {
  const filename = checkedPath(packageRoot, 'PACKAGE_MANIFEST.json', { finalFile: true });
  if (!exists(filename)) fail('PACKAGE_MANIFEST.json is missing. Keep package-tools beside the manifest and repo directory.');
  const raw = fs.readFileSync(filename);
  let manifest;
  try { manifest = JSON.parse(raw); } catch { fail('PACKAGE_MANIFEST.json is not valid JSON.'); }
  if (manifest.version !== 1 || !SHA.test(manifest.source_commit || '') ||
      repositoryIdentity(manifest.source_repository || '') !== EXPECTED_REPOSITORY ||
      !Array.isArray(manifest.files) || !manifest.files.length) fail('Unsupported or invalid package manifest.');
  const names = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') fail('Invalid file entry in package manifest.');
    const relative = safeRelative(file.path);
    const key = relative.toLowerCase();
    if (names.has(key)) fail(`Duplicate or case-colliding manifest path: ${relative}.`);
    names.add(key);
    if ((file.before_sha256 !== null && !HEX.test(file.before_sha256 || '')) || !HEX.test(file.after_sha256 || '')) {
      fail(`Invalid content hash for ${relative}.`);
    }
  }
  for (const key of names) {
    const parts = key.split('/');
    while (parts.length > 1) { parts.pop(); if (names.has(parts.join('/'))) fail('Manifest file paths overlap parent directories.'); }
  }
  return { manifest, packageId: hash(raw) };
}

function inspectRepository(target, manifest) {
  const root = git(target, ['rev-parse', '--show-toplevel']).trim();
  if (fs.realpathSync(root) !== target) fail('--target must be the Git repository root, not a subdirectory.');
  const origins = git(target, ['remote', 'get-url', '--all', 'origin']).trim().split(/\r?\n/);
  if (origins.length !== 1 || repositoryIdentity(origins[0]) !== EXPECTED_REPOSITORY) {
    fail('origin does not identify AuxiliumEnvironmental/auxiliumos. No files were changed.');
  }
  if (git(target, ['cat-file', '-t', manifest.source_commit], { allowFailure: true })?.trim() !== 'commit') {
    fail(`The package source commit ${manifest.source_commit} is not present locally. Fetch the intended repository yourself, then retry. No fetch was attempted.`);
  }
  if (git(target, ['merge-base', '--is-ancestor', manifest.source_commit, 'HEAD'], { allowFailure: true }) === null) {
    fail('The package source commit is not an ancestor of the current HEAD. Reconcile the correct branch; do not replace newer work.');
  }
  return {
    head: git(target, ['rev-parse', 'HEAD']).trim(),
    branch: git(target, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true })?.trim() || null,
    gitDir: git(target, ['rev-parse', '--absolute-git-dir']).trim(),
  };
}

function readHash(filename) { return exists(filename) ? hash(fs.readFileSync(filename)) : null; }

function inspectPayload(packageRoot, target, manifest) {
  const payloadRoot = checkedPath(packageRoot, 'repo');
  if (!exists(payloadRoot) || !fs.lstatSync(payloadRoot).isDirectory()) fail('Package repo payload directory is missing.');
  const entries = [];
  const conflicts = [];
  for (const file of manifest.files) {
    const payload = checkedPath(payloadRoot, file.path, { finalFile: true });
    if (!exists(payload) || hash(fs.readFileSync(payload)) !== file.after_sha256) fail(`Payload is missing or corrupt: ${file.path}. No files were changed.`);
    const destination = checkedPath(target, file.path, { finalFile: true });
    const currentHash = readHash(destination);
    const state = currentHash === file.after_sha256 ? 'already' : currentHash === file.before_sha256 ? (currentHash === null ? 'add' : 'update') : 'conflict';
    if (state === 'conflict') conflicts.push(file.path);
    entries.push({ ...file, payload, destination, currentHash, state });
  }
  if (conflicts.length) fail(`Import conflicts with existing work in: ${conflicts.join(', ')}. The whole import was refused; no files were changed.`);
  return entries;
}

function enforceCleanOrExactRepeat(target, entries) {
  const raw = git(target, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!raw) return;
  const known = new Map(entries.map((entry) => [entry.path, entry]));
  if (!entries.every((entry) => entry.state === 'already')) fail('Working tree is dirty. Commit or safely preserve existing work before applying the package; no reset or stash was attempted.');
  for (const record of raw.split('\0').filter(Boolean)) {
    const status = record.slice(0, 2);
    const relative = record.slice(3);
    if (/[RCUAD]/.test(status.replace(/^A/, '')) || status.includes('D') || !known.has(relative)) {
      fail('Working tree contains changes beyond this exact package. Preserve them before retrying.');
    }
    if (status[0] !== ' ' && status !== '??') {
      const staged = git(target, ['show', `:${relative}`], { allowFailure: true, binary: true });
      if (staged === null || hash(staged) !== known.get(relative).after_sha256) fail(`Staged content differs from the exact package: ${relative}.`);
    }
  }
  for (const args of [['diff', '--summary'], ['diff', '--cached', '--summary']]) {
    if (/^ mode change /m.test(git(target, args))) fail('Working tree contains an unrelated file-mode change. Preserve it before retrying.');
  }
}

function syncDirectory(directory) {
  let fd;
  try { fd = fs.openSync(directory, 'r'); fs.fsyncSync(fd); }
  catch (error) { if (!['EINVAL', 'EPERM', 'EISDIR', 'EBADF', 'EACCES'].includes(error.code)) throw error; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

function durableFile(filename, bytes, mode = 0o600) {
  const fd = fs.openSync(filename, 'wx', mode);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function atomicJson(filename, value) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  durableFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
  syncDirectory(path.dirname(filename));
}

function writeAtomic(filename, temporary, bytes, mode) {
  if (exists(temporary)) fail('A transaction temporary file unexpectedly exists; stop concurrent writers and recover the import.');
  durableFile(temporary, bytes, mode);
  fs.chmodSync(temporary, mode);
  fs.renameSync(temporary, filename);
  syncDirectory(path.dirname(filename));
}

function journalPaths(gitDir) {
  const root = path.join(gitDir, 'auxiliumos-package-imports');
  if (exists(root) && (fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(root).isDirectory())) fail('Import journal directory is unsafe.');
  return { root, active: path.join(root, 'active.json'), lock: path.join(root, 'lock.json') };
}

function recoveryMessage(target, packageRoot) {
  return `An unfinished import exists. No new import will run. After the original importer has stopped, run: node ${JSON.stringify(SCRIPT)} --package-root ${JSON.stringify(packageRoot)} --target ${JSON.stringify(target)} --recover . Recovery validates file hashes before restoring only this import's changes.`;
}

function runningLock(lock) {
  if (!exists(lock)) return false;
  if (fs.lstatSync(lock).isSymbolicLink()) fail('Import lock is unsafe.');
  let owner;
  try { owner = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { return false; }
  if (owner.hostname !== os.hostname() || !Number.isInteger(owner.pid)) return false;
  try { process.kill(owner.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function rollback(target, manifest, packageId, repo, journals, transaction, journalFile) {
  const actualRepo = inspectRepository(target, manifest);
  if (transaction.version !== 1 || transaction.packageId !== packageId || transaction.target !== target ||
      transaction.head !== repo.head || transaction.branch !== repo.branch || actualRepo.head !== repo.head ||
      actualRepo.branch !== repo.branch || !UUID.test(transaction.id || '') ||
      !Array.isArray(transaction.entries) || !Array.isArray(transaction.createdDirectories)) {
    fail('Recovery journal does not match this package, repository, HEAD and branch. Preserve it and resolve the mismatch before recovery.');
  }
  const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const unique = new Set();
  const indices = new Set();
  const possibleDirectories = new Set();
  const restorations = [];
  for (const entry of transaction.entries) {
    const relative = safeRelative(entry.path);
    const file = expected.get(relative);
    if (!file || unique.has(relative) || entry.before_sha256 !== file.before_sha256 || entry.after_sha256 !== file.after_sha256 ||
        !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777 ||
        entry.backup !== (entry.before_sha256 === null ? null : `before/${entry.index}`) ||
        !Number.isInteger(entry.index) || entry.index < 0 || indices.has(entry.index)) fail('Recovery journal file entry is invalid.');
    unique.add(relative);
    indices.add(entry.index);
    let parent = path.posix.dirname(relative);
    while (parent !== '.') { possibleDirectories.add(parent); parent = path.posix.dirname(parent); }
    const destination = checkedPath(target, relative, { finalFile: true });
    const current = readHash(destination);
    if (current !== entry.before_sha256 && current !== entry.after_sha256) fail(`Recovery conflict: ${relative} changed after the import. Nothing was restored; preserve the newer work before retrying.`);
    let bytes = null;
    if (entry.backup !== null) {
      const backup = checkedPath(path.dirname(journalFile), entry.backup, { finalFile: true });
      if (!exists(backup) || hash(fs.readFileSync(backup)) !== entry.before_sha256) fail(`Recovery backup is missing or corrupt: ${relative}.`);
      bytes = fs.readFileSync(backup);
    }
    const temporary = `${destination}.auxiliumos-import-${transaction.id}.tmp`;
    if (exists(temporary) && (fs.lstatSync(temporary).isSymbolicLink() || !fs.lstatSync(temporary).isFile())) fail('Recovery temporary path is unsafe.');
    restorations.push({ entry, destination, temporary, current, bytes });
  }
  for (const dir of transaction.createdDirectories) {
    if (!possibleDirectories.has(dir)) fail('Recovery journal directory is outside its file paths.');
    const directory = checkedPath(target, safeRelative(dir));
    if (exists(directory) && !fs.lstatSync(directory).isDirectory()) fail('Recovery directory was replaced with another file.');
  }
  for (const item of restorations.reverse()) {
    if (exists(item.temporary)) fs.unlinkSync(item.temporary);
    if (item.current === item.entry.before_sha256) continue;
    if (item.bytes === null) { fs.unlinkSync(item.destination); syncDirectory(path.dirname(item.destination)); }
    else writeAtomic(item.destination, item.temporary, item.bytes, item.entry.mode);
  }
  for (const relative of [...transaction.createdDirectories].sort((a, b) => b.split('/').length - a.split('/').length)) {
    const directory = checkedPath(target, relative);
    if (exists(directory)) { try { fs.rmdirSync(directory); } catch (error) { if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; } }
  }
  transaction.phase = 'rolled_back';
  transaction.finishedAt = new Date().toISOString();
  atomicJson(journalFile, transaction);
  if (exists(journals.active)) fs.unlinkSync(journals.active);
  syncDirectory(journals.root);
}

function recoverImport(target, manifest, packageId, repo, journals) {
  if (runningLock(journals.lock)) fail('The original importer process is still running. Stop it normally before requesting recovery.');
  if (!exists(journals.active)) {
    if (exists(journals.lock)) fs.unlinkSync(journals.lock);
    return { mode: 'recovered', restored: 0, message: 'No active transaction. Removed any abandoned preparation lock; no repository files were changed.' };
  }
  if (fs.lstatSync(journals.active).isSymbolicLink()) fail('Active recovery journal is unsafe.');
  const active = JSON.parse(fs.readFileSync(journals.active, 'utf8'));
  if (!UUID.test(active.transactionId || '') || active.packageId !== packageId) fail('Active journal belongs to another package. Use its original package to recover.');
  const journalFile = checkedPath(journals.root, `transactions/${active.transactionId}/journal.json`, { finalFile: true });
  const transaction = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
  rollback(target, manifest, packageId, repo, journals, transaction, journalFile);
  if (exists(journals.lock)) fs.unlinkSync(journals.lock);
  return { mode: 'recovered', restored: transaction.entries.length, message: 'Import changes were rolled back from verified backups. No commits or pushes were performed.' };
}

/** hooks are a test-only function injection; the manifest can never provide executable commands. */
export function applyPackage({ packageRoot = DEFAULT_PACKAGE_ROOT, target, apply = false, recover = false, hooks = {} }) {
  if (!target) fail('--target PATH is required. Default mode is read-only dry run.');
  if (apply && recover) fail('--apply and --recover cannot be combined.');
  packageRoot = regularRoot(packageRoot, 'Package root');
  target = regularRoot(target, 'Target');
  const { manifest, packageId } = loadManifest(packageRoot);
  const repo = inspectRepository(target, manifest);
  const journals = journalPaths(repo.gitDir);
  if (recover) return recoverImport(target, manifest, packageId, repo, journals);
  if (exists(journals.active) || exists(journals.lock)) fail(recoveryMessage(target, packageRoot));
  const entries = inspectPayload(packageRoot, target, manifest);
  enforceCleanOrExactRepeat(target, entries);
  const result = {
    mode: apply ? 'applied' : 'dry-run', sourceCommit: manifest.source_commit, head: repo.head, branch: repo.branch,
    add: entries.filter((entry) => entry.state === 'add').length,
    update: entries.filter((entry) => entry.state === 'update').length,
    already: entries.filter((entry) => entry.state === 'already').length,
    files: entries.map(({ path: relative, state }) => ({ path: relative, state })),
  };
  if (!apply) return { ...result, message: 'Preflight only. No files, branches, commits or remote state were changed. Use --apply on a dedicated working branch to import.' };
  if (!repo.branch || /^(main|master)$/i.test(repo.branch)) fail('Apply requires a named working branch other than main/master. Create or switch to a dedicated modernization branch first.');
  if (!result.add && !result.update) return { ...result, mode: 'already-applied', message: 'Every package file already matches. No files, commits or remote state were changed.' };

  fs.mkdirSync(journals.root, { recursive: true, mode: 0o700 });
  const transactionId = crypto.randomUUID();
  try { durableFile(journals.lock, JSON.stringify({ pid: process.pid, hostname: os.hostname(), transactionId })); }
  catch (error) { if (error.code === 'EEXIST') fail(recoveryMessage(target, packageRoot)); throw error; }
  let transaction;
  let journalFile;
  let active = false;
  try {
    // Recheck after acquiring the lock, before writing any repository target.
    const currentRepo = inspectRepository(target, manifest);
    if (currentRepo.head !== repo.head || currentRepo.branch !== repo.branch) fail('Repository changed during preflight. Retry after other writers have stopped.');
    const latest = inspectPayload(packageRoot, target, manifest);
    enforceCleanOrExactRepeat(target, latest);
    if (latest.some((entry, index) => entry.currentHash !== entries[index].currentHash)) fail('Target files changed during preflight. No target files were changed.');
    const transactionRoot = checkedPath(journals.root, `transactions/${transactionId}`);
    fs.mkdirSync(path.join(transactionRoot, 'before'), { recursive: true, mode: 0o700 });
    journalFile = path.join(transactionRoot, 'journal.json');
    const changed = entries.filter((entry) => entry.state !== 'already');
    const createdDirectories = new Set();
    const journalEntries = changed.map((entry, index) => {
      let parent = path.posix.dirname(entry.path);
      while (parent !== '.') {
        if (!exists(checkedPath(target, parent))) createdDirectories.add(parent);
        parent = path.posix.dirname(parent);
      }
      const mode = exists(entry.destination) ? fs.statSync(entry.destination).mode & 0o777 : 0o644;
      const backup = entry.before_sha256 === null ? null : `before/${index}`;
      if (backup) durableFile(path.join(transactionRoot, backup), fs.readFileSync(entry.destination));
      return { path: entry.path, index, before_sha256: entry.before_sha256, after_sha256: entry.after_sha256, mode, backup };
    });
    transaction = { version: 1, id: transactionId, packageId, target, head: repo.head, branch: repo.branch, phase: 'prepared', startedAt: new Date().toISOString(), entries: journalEntries, createdDirectories: [...createdDirectories] };
    syncDirectory(path.join(transactionRoot, 'before'));
    syncDirectory(transactionRoot);
    syncDirectory(path.dirname(transactionRoot));
    syncDirectory(journals.root);
    atomicJson(journalFile, transaction);
    atomicJson(journals.active, { transactionId, packageId });
    active = true;
    transaction.phase = 'applying';
    atomicJson(journalFile, transaction);
    for (const relative of [...createdDirectories].sort((a, b) => a.split('/').length - b.split('/').length)) fs.mkdirSync(checkedPath(target, relative), { mode: 0o755 });
    for (let index = 0; index < changed.length; index++) {
      const entry = changed[index];
      checkedPath(target, entry.path, { finalFile: true });
      if (readHash(entry.destination) !== entry.before_sha256) fail(`Target changed during import: ${entry.path}.`);
      const bytes = fs.readFileSync(checkedPath(path.join(packageRoot, 'repo'), entry.path, { finalFile: true }));
      if (hash(bytes) !== entry.after_sha256) fail(`Payload changed during import: ${entry.path}.`);
      writeAtomic(entry.destination, `${entry.destination}.auxiliumos-import-${transactionId}.tmp`, bytes, journalEntries[index].mode);
      hooks.afterFileWrite?.(entry.path, index);
    }
    transaction.phase = 'completed';
    transaction.finishedAt = new Date().toISOString();
    atomicJson(journalFile, transaction);
    fs.unlinkSync(journals.active);
    active = false;
    syncDirectory(journals.root);
    return { ...result, journal: journalFile, message: 'Package imported onto the current working branch. Review and test the diff, then commit/push through your normal workflow. No commit, push, fetch, reset or merge was performed.' };
  } catch (error) {
    if (active) {
      try {
        rollback(target, manifest, packageId, repo, journals, transaction, journalFile);
        error.message += ' Import changes were rolled back from verified backups.';
      } catch (recoveryError) { error.message += ` Automatic rollback could not complete: ${recoveryError.message} ${recoveryMessage(target, packageRoot)}`; }
    }
    throw error;
  } finally {
    if (exists(journals.lock)) {
      try { const owner = JSON.parse(fs.readFileSync(journals.lock, 'utf8')); if (owner.transactionId === transactionId) fs.unlinkSync(journals.lock); } catch { /* Keep questionable locks for explicit recovery. */ }
    }
  }
}

function main(argv) {
  let target;
  let packageRoot;
  let apply = false;
  let recover = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--target') { if (target || !argv[index + 1] || argv[index + 1].startsWith('--')) fail('Provide --target exactly once with a path.'); target = argv[++index]; }
    else if (argument === '--package-root') { if (packageRoot || !argv[index + 1] || argv[index + 1].startsWith('--')) fail('Provide --package-root exactly once with a path.'); packageRoot = argv[++index]; }
    else if (argument === '--apply') { if (apply) fail('Duplicate --apply.'); apply = true; }
    else if (argument === '--recover') { if (recover) fail('Duplicate --recover.'); recover = true; }
    else if (argument === '--help') { console.log('Usage: node package-tools/apply-package.mjs --target PATH [--package-root PATH] [--apply | --recover]\nDefault: read-only preflight; package root is the script parent directory. Apply requires the intended repository, matching baseline files and a non-main working branch. Recovery restores only an interrupted package import.'); return; }
    else fail(`Unknown argument: ${argument}.`);
  }
  console.log(JSON.stringify(applyPackage({ target, packageRoot, apply, recover }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`Import refused: ${error.message}`); process.exitCode = 1; }
}
