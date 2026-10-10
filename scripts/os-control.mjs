#!/usr/bin/env node
// Repository continuity checks. These checks do not certify the application runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = 'docs/00-control/evidence';
const STATES = new Set(['planned', 'ready', 'in_progress', 'implemented', 'blocked', 'deferred']);
const EXCLUDED = new Set(['.git', 'node_modules', 'playwright-report', 'test-results', 'coverage', 'dist', 'build']);
const COMMON_ENVIRONMENT = ['PATH', 'NODE_OPTIONS', 'NODE_PATH', 'TZ', 'LANG', 'LC_ALL', 'CI'];
const safeRelative = value => typeof value === 'string' && value.length > 0 && !path.isAbsolute(value) && !/^[A-Za-z]:/.test(value) && !value.includes('\\') && !value.includes('\0') && !value.split('/').some(p => !p || p === '.' || p === '..' || p === '.git');
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export const readJson = (root, relative) => JSON.parse(fs.readFileSync(safePath(root, relative), 'utf8'));

export function safePath(root, relative) {
  if (!safeRelative(relative)) throw new Error(`Unsafe repository path: ${relative}`);
  const base = path.resolve(root);
  const result = path.resolve(base, relative);
  if (!result.startsWith(base + path.sep)) throw new Error(`Path escapes repository: ${relative}`);
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink is not permitted in control input: ${relative}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return result;
}

function writeJson(root, relative, data) {
  const dest = safePath(root, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, dest);
}

export function inventory(root, inputs) {
  const found = new Map();
  const visit = relative => {
    const absolute = safePath(root, relative);
    if (!fs.existsSync(absolute)) throw new Error(`Missing verification input: ${relative}`);
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) {
        if (EXCLUDED.has(entry)) continue;
        const next = `${relative}/${entry}`;
        if (next === EVIDENCE || next.startsWith(`${EVIDENCE}/`)) continue;
        if (['docs/00-control/SESSION_CHECKPOINT.json', 'docs/00-control/RESUME.md'].includes(next)) continue;
        visit(next);
      }
    } else if (stat.isFile()) {
      found.set(relative, sha256(fs.readFileSync(absolute)));
    } else throw new Error(`Unsupported verification input: ${relative}`);
  };
  inputs.forEach(visit);
  return Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
}

export function fingerprint(root, profile) {
  // Linked worktrees store .git as a file; it is repository metadata, never an input.
  const rootFiles = profile.include_root_files ? fs.readdirSync(root).filter(name => name !== 'VERIFICATION_PROFILES.json' && !EXCLUDED.has(name) && fs.lstatSync(path.join(root, name)).isFile()) : [];
  // The selected profile is already hashed below. Other profile definitions are
  // not execution dependencies unless explicitly declared (e.g. model validation).
  const files = inventory(root, [...new Set(['scripts/os-control.mjs', 'package.json', 'package-lock.json', ...rootFiles, ...profile.inputs])]);
  const environmentHashes = Object.fromEntries([...new Set([...COMMON_ENVIRONMENT, ...(profile.environment_variables || [])])].sort().map(name => [name, Object.hasOwn(process.env, name) ? sha256(process.env[name]) : null]));
  const identity = { node: process.version, platform: process.platform, arch: process.arch, environment: profile.environment, environment_hashes: environmentHashes };
  return { digest: sha256(JSON.stringify({ profile, files, identity })), files, identity };
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function loadModel(root = ROOT) {
  return {
    state: readJson(root, 'BUILD_STATE.json'),
    queue: readJson(root, 'BUILD_QUEUE.json'),
    requirements: readJson(root, 'REQUIREMENTS.json'),
    decisions: readJson(root, 'OWNER_DECISIONS.json'),
    profiles: readJson(root, 'VERIFICATION_PROFILES.json'),
  };
}

export function validateModel(model) {
  const errors = [];
  const { queue, requirements, decisions, profiles } = model;
  const unique = (items, kind) => {
    const seen = new Set();
    for (const x of items) {
      if (typeof x.id !== 'string' || !x.id || seen.has(x.id)) errors.push(`Missing or duplicate ${kind} ID: ${x.id}`);
      seen.add(x.id);
    }
    return seen;
  };
  const tasks = queue.tasks || [];
  const reqs = requirements.requirements || [];
  const ds = decisions.decisions || [];
  const taskIds = unique(tasks, 'task');
  const reqIds = unique(reqs, 'requirement');
  const decisionIds = unique(ds, 'decision');
  const profileIds = unique(profiles.profiles || [], 'profile');
  const expected = Array.from({ length: 20 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
  const modules = reqs.filter(x => x.kind === 'product_module');
  if (modules.length !== 20 || expected.some(id => !modules.some(m => m.id === id))) errors.push('The complete 20-module product scope must remain represented.');
  for (const r of reqs) {
    if (!STATES.has(r.status)) errors.push(`Unsupported requirement status: ${r.id}/${r.status}`);
    if (!r.acceptance?.length || !r.sources?.length) errors.push(`Requirement lacks acceptance/source: ${r.id}`);
    if (!tasks.some(t => t.requirements?.includes(r.id))) errors.push(`Requirement has no delivery task: ${r.id}`);
    for (const p of r.verification_profiles || []) if (!profileIds.has(p)) errors.push(`Unknown profile ${p} in ${r.id}`);
    if (r.status === 'implemented' && !r.verification_profiles?.length) errors.push(`Implemented requirement needs verification profile: ${r.id}`);
  }
  const graph = new Map(tasks.map(t => [t.id, t.dependencies || []]));
  for (const t of tasks) {
    if (!STATES.has(t.status)) errors.push(`Unsupported task status: ${t.id}/${t.status}`);
    if (!t.next_action || !t.allowed_paths?.length) errors.push(`Task lacks next action/file allocation: ${t.id}`);
    for (const rule of t.allowed_paths || []) {
      const prefix = typeof rule === 'string' ? rule.replace(/\/\*\*$/, '') : rule;
      if (rule !== '.' && (!safeRelative(prefix) || /[*?\[\]{}]/.test(prefix))) errors.push(`Unsafe or unsupported allocation rule in ${t.id}: ${rule}`);
    }
    for (const d of t.dependencies || []) if (!taskIds.has(d)) errors.push(`Unknown dependency ${d} in ${t.id}`);
    for (const r of t.requirements || []) if (!reqIds.has(r)) errors.push(`Unknown requirement ${r} in ${t.id}`);
    for (const d of t.owner_decisions || []) if (!decisionIds.has(d)) errors.push(`Unknown decision ${d} in ${t.id}`);
    for (const p of t.verification_profiles || []) if (!profileIds.has(p)) errors.push(`Unknown profile ${p} in ${t.id}`);
    if (t.status === 'implemented' && !t.verification_profiles?.length) errors.push(`Implemented task needs verification profile: ${t.id}`);
    if (t.completion_mode !== undefined && (t.completion_mode !== 'historical_source' || !['SYNC-001', 'SYNC-PUBLISH-001'].includes(t.id) || !t.verification_profiles?.length || t.verification_profiles.some(id => profiles.profiles.find(p => p.id === id)?.level !== 'source_inspection'))) errors.push(`Historical completion is restricted to source reconciliation/publication: ${t.id}`);
    if (Object.hasOwn(t, 'required_evidence_levels')) {
      const levels = t.required_evidence_levels;
      if (!Array.isArray(levels) || !levels.length || levels.some(level => typeof level !== 'string' || !level.trim()) || new Set(levels).size !== levels.length) {
        errors.push(`Task needs nonempty, distinct evidence levels: ${t.id}`);
      } else if (t.status === 'implemented') {
        for (const level of levels) if (!(t.verification_profiles || []).some(id => profiles.profiles.some(p => p.id === id && p.level === level))) errors.push(`Implemented task lacks ${level} verification profile: ${t.id}`);
      }
    }
    if (t.status === 'in_progress' && (!t.assigned_to || !t.branch)) errors.push(`Active task needs agent and branch: ${t.id}`);
  }
  const seen = new Set(), active = new Set();
  function walk(id) {
    if (active.has(id)) { errors.push(`Dependency cycle at ${id}`); return; }
    if (seen.has(id)) return;
    active.add(id);
    for (const dependency of graph.get(id) || []) walk(dependency);
    active.delete(id); seen.add(id);
  }
  taskIds.forEach(walk);
  const writers = tasks.filter(t => t.status === 'in_progress');
  const overlap = (a, b) => {
    const x = a.replace(/\/\*\*$/, '').replace(/\/$/, '');
    const y = b.replace(/\/\*\*$/, '').replace(/\/$/, '');
    return x === '.' || y === '.' || x === y || x.startsWith(y + '/') || y.startsWith(x + '/');
  };
  for (let i = 0; i < writers.length; i++) for (let j = i + 1; j < writers.length; j++) {
    if (writers[i].allowed_paths.some(a => writers[j].allowed_paths.some(b => overlap(a, b)))) errors.push(`Overlapping writer leases: ${writers[i].id}/${writers[j].id}`);
  }
  for (const d of ds) {
    if (!['proposed', 'configured_for_development', 'approved', 'rejected', 'superseded'].includes(d.status)) errors.push(`Unknown decision status: ${d.id}`);
    if (!d.recommendation || !d.activation_gate || !d.config_path) errors.push(`Decision missing recommendation/gate/config: ${d.id}`);
    if (d.status === 'approved' && (!d.approved_by || !d.approved_at || !d.approval_evidence)) errors.push(`Decision approval missing evidence: ${d.id}`);
    if (d.production_enabled && d.status !== 'approved') errors.push(`Unapproved decision activated: ${d.id}`);
  }
  for (const p of profiles.profiles || []) {
    if (!/^[a-z][a-z0-9-]+$/.test(p.id) || !p.inputs?.length || !p.commands?.length || !p.environment || !p.level) errors.push(`Invalid verification profile: ${p.id}`);
    if (typeof p.cacheable !== 'boolean') errors.push(`Verification profile must declare cacheable: ${p.id}`);
    if (p.cacheable === false && (!Number.isFinite(p.max_age_ms) || p.max_age_ms <= 0)) errors.push(`Noncacheable profile needs positive finite max_age_ms: ${p.id}`);
    for (const c of p.commands || []) if (!Array.isArray(c) || c.length < 1 || c.some(a => typeof a !== 'string')) errors.push(`Invalid command arguments: ${p.id}`);
  }
  return [...new Set(errors)];
}

export function validate(root = ROOT) {
  const model = loadModel(root);
  const errors = validateModel(model);
  for (const r of model.requirements.requirements) for (const source of r.sources) {
    const sourcePath = safePath(root, source.split('#')[0]);
    if (!fs.existsSync(sourcePath)) errors.push(`Missing requirement source ${source} for ${r.id}`);
  }
  for (const d of model.decisions.decisions) {
    if (!fs.existsSync(safePath(root, d.config_path.split('#')[0]))) errors.push(`Missing decision configuration: ${d.id}`);
    else if (d.config_path.includes('#') && d.config_path.split('#')[0].endsWith('.json')) {
      const [file, key] = d.config_path.split('#');
      if (!Object.hasOwn(readJson(root, file), key)) errors.push(`Missing decision configuration key: ${d.id}/${key}`);
    }
  }
  const policy = readJson(root, 'config/policy-defaults.json');
  for (const action of Object.keys(policy.actions)) for (const id of policy.actions[action]) {
    if (!model.decisions.decisions.some(d => d.id === id)) errors.push(`Policy references missing decision ${id}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return model;
}

export function evidenceStatus(root, profile) {
  const relative = `${EVIDENCE}/${profile.id}.json`;
  if (!fs.existsSync(safePath(root, relative))) return { status: 'not_run', profile: profile.id };
  try {
    const evidence = readJson(root, relative);
    if (profile.cacheable !== true) {
      // This bounds evidence age only. It does not attest to mutable remote state;
      // runtime profiles still need target revision, migration/config and fixture inputs.
      if (!Number.isFinite(profile.max_age_ms) || profile.max_age_ms <= 0) return { status: 'invalid', profile: profile.id, reason: 'Noncacheable profile needs positive finite max_age_ms.' };
      const recordedAt = typeof evidence.recorded_at === 'string' ? Date.parse(evidence.recorded_at) : NaN;
      const now = Date.now();
      if (!Number.isFinite(recordedAt)) return { status: 'invalid', profile: profile.id, reason: 'Evidence timestamp is missing or invalid.' };
      if (recordedAt > now || now - recordedAt > profile.max_age_ms) return { status: 'stale', profile: profile.id, reason: 'Evidence timestamp is future-dated or expired.' };
    }
    const current = fingerprint(root, profile);
    if (evidence.version !== 1 || evidence.profile !== profile.id || evidence.level !== profile.level || evidence.digest !== current.digest) return { status: 'stale', profile: profile.id };
    const log = safePath(root, evidence.log_path);
    if (!evidence.log_path.startsWith(`${EVIDENCE}/`) || !fs.existsSync(log) || sha256(fs.readFileSync(log)) !== evidence.log_sha256) return { status: 'invalid_log', profile: profile.id };
    if (!Array.isArray(evidence.results) || evidence.results.length !== profile.commands.length || evidence.results.some((r, i) => r.exit_code !== 0 || JSON.stringify(r.argv) !== JSON.stringify(profile.commands[i]))) return { status: 'failed', profile: profile.id };
    return { status: evidence.result === 'passed' ? 'passed' : 'failed', profile: profile.id, evidence: relative, level: evidence.level, recorded_at: evidence.recorded_at };
  } catch (error) { return { status: 'invalid', profile: profile.id, reason: error.message }; }
}

export function verify(root, id, { force = false } = {}) {
  const model = validate(root);
  const profile = model.profiles.profiles.find(p => p.id === id);
  if (!profile) throw new Error(`Unknown verification profile: ${id}`);
  // Preserve the dated source operation before a fresh external check can
  // replace its latest-result files, including when that refresh fails.
  preserveHistoricalSource(root, profile, model);
  const cached = evidenceStatus(root, profile);
  if (!force && profile.cacheable && cached.status === 'passed') return { ...cached, reused: true };
  const before = fingerprint(root, profile);
  const results = []; const logs = [];
  for (const argv of profile.commands) {
    const result = spawnSync(argv[0] === 'node' ? process.execPath : argv[0], argv.slice(1), { cwd: root, encoding: 'utf8', shell: false, timeout: profile.timeout_ms || 120000, maxBuffer: 10 * 1024 * 1024 });
    results.push({ argv, exit_code: result.status, signal: result.signal, error: result.error?.message || null });
    logs.push(`${JSON.stringify(argv)}\n${result.stdout || ''}${result.stderr || ''}${result.error ? '\n' + result.error.message : ''}`);
    if (result.status !== 0) break;
  }
  const after = fingerprint(root, profile);
  const passed = before.digest === after.digest && results.length === profile.commands.length && results.every(r => r.exit_code === 0);
  if (before.digest !== after.digest) logs.push('Verification inputs changed during execution. Result is invalid; rerun after reconciliation.');
  fs.mkdirSync(safePath(root, EVIDENCE), { recursive: true });
  const logPath = `${EVIDENCE}/${id}.log`;
  fs.writeFileSync(safePath(root, logPath), logs.join('\n\n'));
  const record = { version: 1, profile: id, level: profile.level, recorded_at: new Date().toISOString(), result: passed ? 'passed' : 'failed', digest: before.digest, identity: before.identity, inputs: before.files, observed_git_head: git(root, ['rev-parse', 'HEAD']), results, log_path: logPath, log_sha256: sha256(fs.readFileSync(safePath(root, logPath))) };
  writeJson(root, `${EVIDENCE}/${id}.json`, record);
  if (passed) preserveHistoricalSource(root, profile, model);
  return { status: record.result, profile: id, reused: false, evidence: `${EVIDENCE}/${id}.json`, level: record.level };
}

function validHistoricalSource(root, profile, evidence) {
  const timestamp = Date.parse(evidence.recorded_at);
  return profile.level === 'source_inspection' && evidence.version === 1
    && evidence.profile === profile.id && evidence.level === 'source_inspection'
    && evidence.result === 'passed' && Number.isFinite(timestamp) && timestamp <= Date.now()
    && evidence.results?.length === profile.commands.length
    && evidence.results.every((r, i) => r.exit_code === 0 && JSON.stringify(r.argv) === JSON.stringify(profile.commands[i]))
    && evidence.log_path.startsWith(`${EVIDENCE}/`)
    && sha256(fs.readFileSync(safePath(root, evidence.log_path))) === evidence.log_sha256;
}

function preserveHistoricalSource(root, profile, model) {
  if (model.state.live_repository_reconciled !== true || !model.queue.tasks.some(task =>
    task.status === 'implemented' && task.completion_mode === 'historical_source'
      && task.verification_profiles.includes(profile.id))) return;
  const completedPath = `${EVIDENCE}/${profile.id}.completed.json`;
  if (fs.existsSync(safePath(root, completedPath))) return;
  let evidence;
  try {
    evidence = readJson(root, `${EVIDENCE}/${profile.id}.json`);
    if (!validHistoricalSource(root, profile, evidence)) return;
  } catch { return; }
  const logPath = `${EVIDENCE}/${profile.id}.completed.log`;
  fs.copyFileSync(safePath(root, evidence.log_path), safePath(root, logPath));
  writeJson(root, completedPath, { ...evidence, log_path: logPath });
}

function historicalSourceComplete(root, task, model) {
  if (task.status !== 'implemented' || task.completion_mode !== 'historical_source' || model.state.live_repository_reconciled !== true) return false;
  // This records an already performed source operation, not fresh remote state.
  // Retain the original timestamp/log and never use it for runtime/release proof.
  return task.verification_profiles.every(id => {
    try {
      const profile = model.profiles.profiles.find(p => p.id === id);
      const completedPath = `${EVIDENCE}/${id}.completed.json`;
      const evidence = readJson(root, fs.existsSync(safePath(root, completedPath)) ? completedPath : `${EVIDENCE}/${id}.json`);
      return validHistoricalSource(root, profile, evidence);
    } catch { return false; }
  });
}

export function currentStatus(root = ROOT) {
  const model = validate(root);
  const evidence = Object.fromEntries(model.profiles.profiles.map(p => [p.id, evidenceStatus(root, p)]));
  const complete = item => item.status === 'implemented' && item.verification_profiles?.length > 0 && item.verification_profiles.every(id => evidence[id]?.status === 'passed') && (item.required_evidence_levels || []).every(level => item.verification_profiles.some(id => evidence[id]?.status === 'passed' && evidence[id]?.level === level));
  const dependencySatisfied = task => complete(task) || historicalSourceComplete(root, task, model);
  const tasks = model.queue.tasks.map(t => ({ id: t.id, title: t.title, declared_status: t.status, verified: complete(t), historical_completion: historicalSourceComplete(root, t, model), next_action: t.next_action, blocker: t.blocker || null }));
  const ready = model.queue.tasks.filter(t => !dependencySatisfied(t) && !['blocked', 'deferred'].includes(t.status) && (t.dependencies || []).every(id => dependencySatisfied(model.queue.tasks.find(x => x.id === id))));
  const product = model.requirements.requirements.filter(r => r.kind === 'product_module');
  return { version: 1, product_modules: product.length, verified_product_modules: product.filter(complete).map(x => x.id), tasks, evidence, next_ready_task: ready[0]?.id || null, owner_review_pending: model.decisions.decisions.filter(d => d.status !== 'approved' && d.status !== 'superseded' && d.status !== 'rejected').map(d => d.id) };
}

const nonblank = value => typeof value === 'string' && value.trim().length > 0;
function approvalTime(value) {
  // Use an unambiguous UTC instant; Date.parse alone normalizes impossible dates.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() && new Date(time).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z') ? time : NaN;
}

export function productionActivationInputs(root = ROOT) {
  // BUILD_STATE contains observations and the approval itself, not product source.
  // Excluding it avoids a self-containing approval hash. inventory also excludes
  // generated evidence/checkpoints and build/dependency outputs. All other source,
  // including uncommitted additions, is bound; an unsafe/missing input must fail.
  const entries = fs.readdirSync(root).filter(name => !EXCLUDED.has(name) && name !== 'BUILD_STATE.json');
  const files = inventory(root, [...new Set([...entries, 'AGENTS.md', 'BUILD_QUEUE.json', 'REQUIREMENTS.json', 'OWNER_DECISIONS.json', 'VERIFICATION_PROFILES.json', 'config/policy-defaults.json', 'scripts/os-control.mjs', 'package.json', 'package-lock.json'])]);
  const policy = readJson(root, 'config/policy-defaults.json');
  return {
    scope: 'full_business_activation',
    candidate_sha256: sha256(JSON.stringify(files)),
    environment: 'production',
    target: policy.production?.target ?? null,
    owner_decisions_sha256: files['OWNER_DECISIONS.json'],
    policy_sha256: files['config/policy-defaults.json'],
  };
}

function productionAuthorizationGaps(root, model) {
  const gaps = [];
  const required = model.decisions.decisions.filter(d => d.required_for_full_release);
  for (const d of required) {
    if (d.status !== 'approved' || d.production_enabled !== true || !nonblank(d.approved_by) || !nonblank(d.approval_evidence) || !Number.isFinite(approvalTime(d.approved_at))) gaps.push(`${d.id}: owner activation decision pending or approval evidence invalid`);
  }
  // Legacy evidence remains a publication fact. Only this separate, explicitly
  // scoped record can contribute to the full business activation gate.
  const authorization = model.state.production_authorization?.full_activation;
  if (!authorization || typeof authorization !== 'object' || Array.isArray(authorization)) {
    gaps.push('Production full-business activation authorization is not recorded; frontend publication evidence is insufficient.');
    return gaps;
  }
  let inputs;
  try { inputs = productionActivationInputs(root); }
  catch (error) { gaps.push(`Production activation inputs cannot be verified: ${error.message}`); return gaps; }
  for (const field of ['scope', 'environment']) if (authorization[field] !== inputs[field]) gaps.push(`Production activation ${field} must be ${inputs[field]}.`);
  if (!nonblank(inputs.target)) gaps.push('Production activation target is not configured in config/policy-defaults.json.');
  if (!nonblank(authorization.target) || authorization.target !== inputs.target) gaps.push('Production activation target does not match the configured production target.');
  for (const field of ['candidate_sha256', 'owner_decisions_sha256', 'policy_sha256']) {
    if (typeof authorization[field] !== 'string' || !/^[a-f0-9]{64}$/.test(authorization[field]) || authorization[field] !== inputs[field]) gaps.push(`Production activation ${field} is missing or does not match current inputs.`);
  }
  if (!nonblank(authorization.approved_by) || !nonblank(authorization.evidence)) gaps.push('Production activation approved_by and evidence must record the actual approval.');
  const approvedAt = approvalTime(authorization.approved_at);
  if (!Number.isFinite(approvedAt)) gaps.push('Production activation approved_at must be a valid nonfuture UTC timestamp.');
  else if (required.some(d => approvalTime(d.approved_at) > approvedAt)) gaps.push('Production activation approval predates a required owner decision approval.');
  return gaps;
}

export function releaseReadiness(root = ROOT) {
  const model = validate(root); const status = currentStatus(root); const gaps = [];
  for (const r of model.requirements.requirements) {
    if (r.status !== 'implemented' || !r.verification_profiles.length) { gaps.push(`${r.id}: implementation/verification missing`); continue; }
    for (const p of r.verification_profiles) if (status.evidence[p]?.status !== 'passed') gaps.push(`${r.id}: ${p} is not a current pass`);
    for (const level of r.required_evidence_levels || []) if (!r.verification_profiles.some(p => status.evidence[p]?.status === 'passed' && status.evidence[p]?.level === level)) gaps.push(`${r.id}: no current ${level} evidence`);
  }
  gaps.push(...productionAuthorizationGaps(root, model));
  if (model.state.live_repository_reconciled !== true) gaps.push('Live repository has not been reconciled.');
  if (model.profiles.profiles.some(p => p.id === 'source-reconciliation') && status.evidence['source-reconciliation']?.status !== 'passed') gaps.push('Fresh source reconciliation is required for release; historical completion is insufficient.');
  return { ready: gaps.length === 0, gaps, note: 'This repository gate is a necessary check, not a runtime, security, legal or operational certification.' };
}

export function checkAllocation(allowed, changed) {
  return changed.filter(relative => !safeRelative(relative) || !allowed.some(rule => rule === '.' || relative === rule || (rule.endsWith('/**') && relative.startsWith(rule.slice(0, -3) + '/'))));
}

export function checkpoint(root = ROOT, { verifyRemote = false } = {}) {
  const status = currentStatus(root);
  const repositoryRoot = git(root, ['rev-parse', '--show-toplevel']);
  const isRoot = repositoryRoot && path.resolve(repositoryRoot) === path.resolve(root);
  const head = isRoot ? git(root, ['rev-parse', 'HEAD']) : null;
  const branch = isRoot ? git(root, ['branch', '--show-current']) : null;
  const upstream = isRoot ? git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) : null;
  let remoteState = { status: 'not_checked', branch, head: null };
  if (verifyRemote && isRoot && branch) {
    const origin = git(root, ['remote', 'get-url', 'origin']);
    const expected = /^(https:\/\/github\.com\/AuxiliumEnvironmental\/auxiliumos(?:\.git)?\/?|git@github\.com:AuxiliumEnvironmental\/auxiliumos(?:\.git)?|ssh:\/\/git@github\.com\/AuxiliumEnvironmental\/auxiliumos(?:\.git)?)$/i;
    if (!origin || !expected.test(origin)) throw new Error('Remote verification requires the expected AuxiliumEnvironmental/auxiliumos origin.');
    const remote = git(root, ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
    const remoteHead = remote?.split(/\s+/)[0] || null;
    remoteState = { status: !remoteHead ? 'unavailable_or_branch_absent' : remoteHead === head ? 'head_matches_remote' : 'head_differs_from_remote', branch, head: remoteHead, checked_at: new Date().toISOString() };
  }
  const controlFiles = inventory(root, ['AGENTS.md', 'BUILD_STATE.json', 'BUILD_QUEUE.json', 'REQUIREMENTS.json', 'OWNER_DECISIONS.json', 'VERIFICATION_PROFILES.json', 'config', 'scripts']);
  const record = { version: 1, created_at: new Date().toISOString(), source: loadModel(root).state.source, first_unfinished_action: loadModel(root).state.first_runtime_action || null, git: { is_repository_root: Boolean(isRoot), head, branch, upstream, working_tree: isRoot ? git(root, ['status', '--porcelain=v1']) : null, remote: remoteState }, controls_digest: sha256(JSON.stringify(controlFiles)), next_ready_task: status.next_ready_task, blocked_tasks: status.tasks.filter(t => t.declared_status === 'blocked'), evidence: status.evidence, pending_owner_decisions: status.owner_review_pending, note: 'Observed before writing this checkpoint. A matching remote HEAD does not include uncommitted changes or this newly written checkpoint. Commit, push, then read back Git status and remote HEAD. Never claim Cursor synchronization from this file.' };
  writeJson(root, 'docs/00-control/SESSION_CHECKPOINT.json', record);
  fs.writeFileSync(safePath(root, 'docs/00-control/RESUME.md'), `# Resume AuxiliumOS\n\nRecorded first unfinished action: ${record.first_unfinished_action || 'Not recorded; inspect active task records.'}\n\nGenerated ${record.created_at}. Recheck actual Git state before trusting this snapshot.\n\nRead AGENTS.md, BUILD_STATE.json and BUILD_QUEUE.json, then run npm run os:status. Load only the sources for the next task. Do not restart completed work merely because the conversation changed.\n\nComputed verification/task candidate (does not replace the recorded unfinished action): ${status.next_ready_task || 'None; see explicit blockers in BUILD_QUEUE.json.'}\nVerified product modules: ${status.verified_product_modules.length}/20.\nPending owner review: ${status.owner_review_pending.join(', ')}.\nGit HEAD: ${head || 'not a live Git checkout'}. Remote observation: ${remoteState.status}.\n\nThe checkpoint is observation, not a claim of push, deployment or runtime completion. See SESSION_CHECKPOINT.json for evidence freshness and blockers.\n`);
  return record;
}

async function main() {
  const [command = 'status', argument, ...rest] = process.argv.slice(2);
  const args = [argument, ...rest].filter(Boolean);
  let result;
  if (command === 'validate') { validate(); result = { valid: true, note: 'Structure and references only; application behavior is not certified.' }; }
  else if (command === 'status') result = currentStatus();
  else if (command === 'verify') result = verify(ROOT, argument, { force: rest.includes('--force') });
  else if (command === 'checkpoint') result = checkpoint(ROOT, { verifyRemote: args.includes('--verify-remote') });
  else if (command === 'release-inputs') result = { ...productionActivationInputs(), note: 'Binding inputs only; this does not record or grant approval, verify deployment, or authenticate an approver.' };
  else if (command === 'release-check') result = releaseReadiness();
  else if (command === 'allocation') {
    const model = validate(); const task = model.queue.tasks.find(t => t.id === argument);
    if (!task) throw new Error('Specify an existing task ID.');
    const changedFile = rest[0];
    if (!changedFile) throw new Error('Pass a newline-separated changed-paths file generated from the actual diff, including untracked files.');
    const changed = fs.readFileSync(changedFile, 'utf8').split(/\r?\n/).filter(Boolean);
    result = { outside_allocation: checkAllocation(task.allowed_paths, changed) };
    if (result.outside_allocation.length) process.exitCode = 1;
  } else throw new Error('Use validate, status, verify PROFILE [--force], checkpoint [--verify-remote], release-inputs, release-check, or allocation TASK PATHS_FILE.');
  console.log(JSON.stringify(result, null, 2));
  if (result?.status === 'failed' || result?.ready === false) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
