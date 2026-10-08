import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  checkAllocation, checkpoint, currentStatus, evidenceStatus, fingerprint,
  inventory, loadModel, releaseReadiness, safePath, validate, validateModel, verify,
} from '../../scripts/os-control.mjs';
import { evaluateActivation } from '../../scripts/owner-policy.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modeVariable = 'AUXILIUMOS_CONTROL_FIXTURE_MODE';
const clone = value => structuredClone(value);
const writeJson = (root, relative, value) => write(root, relative, JSON.stringify(value, null, 2) + '\n');
function write(root, relative, value) {
  const dest = path.join(root, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, value);
}
function updateJson(root, relative, mutate) {
  const value = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  mutate(value);
  writeJson(root, relative, value);
}
function withMode(value, action) {
  const previous = process.env[modeVariable];
  if (value === undefined) delete process.env[modeVariable];
  else process.env[modeVariable] = value;
  try { return action(); }
  finally {
    if (previous === undefined) delete process.env[modeVariable];
    else process.env[modeVariable] = previous;
  }
}

function modelFixture() {
  const requirements = Array.from({ length: 20 }, (_, i) => ({
    id: `M${String(i + 1).padStart(2, '0')}`,
    kind: 'product_module', name: `Fixture module ${i + 1}`, status: 'planned',
    sources: ['docs/source.md'], acceptance: ['Prove the described behavior.'],
    verification_profiles: [], required_evidence_levels: ['fixture_unit'],
  }));
  return {
    state: { version: 1, source: { review_basis: 'isolated synthetic fixture' }, live_repository_reconciled: false, production_authorization: { evidence: null } },
    requirements: { version: 1, requirements },
    queue: { version: 1, tasks: requirements.map((r, i) => ({
      id: `TASK-${i + 1}`, title: `Deliver ${r.id}`, status: 'planned', dependencies: [],
      requirements: [r.id], allowed_paths: [`src/module-${i + 1}/**`],
      next_action: 'Implement the specified fixture behavior.', owner_decisions: [], verification_profiles: [],
      assigned_to: null, branch: null,
    })) },
    decisions: { version: 1, decisions: [{
      id: 'OD-001', topic: 'Fixture release authority', status: 'configured_for_development',
      recommendation: 'Use a recorded exact-version decision.', activation_gate: 'Confirm live authority.',
      config_path: 'config/policy-defaults.json#documents', production_enabled: false,
      required_for_full_release: true, approved_by: null, approved_at: null, approval_evidence: null,
    }] },
    profiles: { version: 1, profiles: [{
      id: 'fixture-check', level: 'fixture_unit', environment: 'isolated-local-fixture',
      environment_variables: [modeVariable], cacheable: true, timeout_ms: 5000,
      inputs: ['src', 'tests/fixture-check.mjs', 'config/policy-defaults.json'],
      commands: [['node', 'tests/fixture-check.mjs']],
    }] },
  };
}

function fixture(t, mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auxiliumos-controls-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const model = modelFixture();
  mutate(model);
  for (const [key, filename] of Object.entries({ state: 'BUILD_STATE.json', queue: 'BUILD_QUEUE.json', requirements: 'REQUIREMENTS.json', decisions: 'OWNER_DECISIONS.json', profiles: 'VERIFICATION_PROFILES.json' })) writeJson(root, filename, model[key]);
  for (const filename of ['os-control.mjs', 'owner-policy.mjs']) write(root, `scripts/${filename}`, fs.readFileSync(path.join(repository, 'scripts', filename)));
  write(root, 'AGENTS.md', '# Synthetic fixture instructions\n');
  write(root, 'docs/source.md', '# Synthetic acceptance source\n');
  write(root, 'src/main.txt', 'synthetic implementation v1\n');
  writeJson(root, 'package.json', { name: 'auxiliumos-control-fixture', private: true, type: 'module' });
  writeJson(root, 'package-lock.json', { name: 'auxiliumos-control-fixture', lockfileVersion: 3, packages: {} });
  writeJson(root, 'config/policy-defaults.json', { documents: { exact_version: true }, actions: { release_document: ['OD-001'] } });
  write(root, 'tests/fixture-check.mjs', `import fs from 'node:fs';
fs.appendFileSync('runs.txt', 'run\\n');
const mode = process.env.${modeVariable};
if (mode === 'fail') { console.error('synthetic command failure'); process.exit(7); }
if (mode === 'mutate') fs.appendFileSync('src/main.txt', 'changed during verification\\n');
console.log('synthetic command complete');
`);
  return root;
}
const profileAt = root => loadModel(root).profiles.profiles[0];
const runCount = root => fs.existsSync(path.join(root, 'runs.txt')) ? fs.readFileSync(path.join(root, 'runs.txt'), 'utf8').trim().split('\n').length : 0;
const errors = model => validateModel(model).join('\n');
const approve = decision => ({ ...decision, status: 'approved', production_enabled: true, approved_by: 'Synthetic owner', approved_at: '2026-10-08T00:00:00Z', approval_evidence: 'Synthetic recorded approval only' });

test('baseline model preserves all 20 modules and validates its actual references', t => {
  assert.deepEqual(validateModel(modelFixture()), []);
  const root = fixture(t);
  assert.equal(validate(root).requirements.requirements.length, 20);
  const status = currentStatus(root);
  assert.equal(status.product_modules, 20);
  assert.deepEqual(status.verified_product_modules, []);
});

test('missing module and duplicate IDs are rejected', () => {
  const missing = modelFixture(); missing.requirements.requirements.pop();
  assert.match(errors(missing), /20-module/);
  for (const [key, collection] of [['requirements', 'requirements'], ['queue', 'tasks'], ['decisions', 'decisions'], ['profiles', 'profiles']]) {
    const model = modelFixture(); model[key][collection].push(clone(model[key][collection][0]));
    assert.match(errors(model), /duplicate/i, `${key} duplicate must fail`);
  }
});

test('unknown dependencies, requirement/profile/decision references and cycles fail', () => {
  const cases = [
    [m => { m.queue.tasks[0].dependencies = ['MISSING']; }, /Unknown dependency/],
    [m => { m.queue.tasks[0].requirements = ['MISSING']; }, /Unknown requirement/],
    [m => { m.queue.tasks[0].owner_decisions = ['MISSING']; }, /Unknown decision/],
    [m => { m.queue.tasks[0].verification_profiles = ['missing-profile']; }, /Unknown profile/],
    [m => { m.requirements.requirements[0].verification_profiles = ['missing-profile']; }, /Unknown profile/],
    [m => { m.queue.tasks[0].dependencies = ['TASK-2']; m.queue.tasks[1].dependencies = ['TASK-1']; }, /cycle/],
  ];
  for (const [mutate, expected] of cases) { const model = modelFixture(); mutate(model); assert.match(errors(model), expected); }
});

test('unapproved activation and unsupported completed status cannot forge completion', () => {
  const activated = modelFixture(); activated.decisions.decisions[0].production_enabled = true;
  assert.match(errors(activated), /Unapproved decision activated/);
  const missingApproval = modelFixture(); missingApproval.decisions.decisions[0].status = 'approved';
  assert.match(errors(missingApproval), /approval missing evidence/);
  for (const status of ['done', 'verified']) {
    const model = modelFixture(); model.queue.tasks[0].status = status; model.requirements.requirements[0].status = status;
    assert.match(errors(model), /Unsupported task status/);
    assert.match(errors(model), /Unsupported requirement status/);
  }
  const implemented = modelFixture(); implemented.queue.tasks[0].status = 'implemented'; implemented.requirements.requirements[0].status = 'implemented';
  assert.match(errors(implemented), /Implemented task needs verification profile/);
  assert.match(errors(implemented), /Implemented requirement needs verification profile/);
});

test('active writer leases must be identified and must not overlap', () => {
  const model = modelFixture();
  for (const task of model.queue.tasks.slice(0, 2)) Object.assign(task, { status: 'in_progress', assigned_to: 'synthetic-agent', branch: `fixture/${task.id}` });
  model.queue.tasks[0].allowed_paths = ['src/**'];
  model.queue.tasks[1].allowed_paths = ['src/main.txt'];
  assert.match(errors(model), /Overlapping writer leases/);
  model.queue.tasks[1].allowed_paths = ['docs/**'];
  assert.doesNotMatch(errors(model), /Overlapping writer leases/);
  model.queue.tasks[0].assigned_to = null;
  assert.match(errors(model), /Active task needs agent and branch/);
});

test('allocation checks permit exact/subtree writes and reject siblings and unsafe paths', () => {
  assert.deepEqual(checkAllocation(['src/**', 'README.md'], ['src/main.js', 'src/nested/file.js', 'README.md']), []);
  assert.deepEqual(checkAllocation(['src/**'], ['src-other/file.js', 'README.md']), ['src-other/file.js', 'README.md']);
  for (const changed of ['src/../outside.txt', '../outside.txt', '/tmp/outside.txt', 'src\\outside.txt']) {
    let denied;
    try { denied = checkAllocation(['.'], [changed]).includes(changed); }
    catch { denied = true; }
    assert.equal(denied, true, `Unsafe changed path was accepted: ${changed}`);
  }
});

test('missing source, config and policy decision references are rejected on disk', t => {
  const root = fixture(t);
  updateJson(root, 'REQUIREMENTS.json', d => { d.requirements[0].sources = ['docs/missing.md']; });
  assert.throws(() => validate(root), /Missing requirement source/);
  updateJson(root, 'REQUIREMENTS.json', d => { d.requirements[0].sources = ['docs/source.md']; });
  updateJson(root, 'OWNER_DECISIONS.json', d => { d.decisions[0].config_path = 'config/missing.json#documents'; });
  assert.throws(() => validate(root), /Missing decision configuration/);
  updateJson(root, 'OWNER_DECISIONS.json', d => { d.decisions[0].config_path = 'config/policy-defaults.json#documents'; });
  updateJson(root, 'config/policy-defaults.json', d => { d.actions.release_document.push('OD-MISSING'); });
  assert.throws(() => validate(root), /Policy references missing decision/);
});

test('source inventory rejects missing inputs, traversal and symbolic links', t => {
  const root = fixture(t);
  assert.throws(() => inventory(root, ['missing-directory']), /Missing verification input/);
  for (const relative of ['../outside', '/tmp/outside', 'src/../outside', 'src\\outside', '.git/config']) assert.throws(() => safePath(root, relative), /Unsafe|escapes/);
  fs.symlinkSync(path.join(root, 'src/main.txt'), path.join(root, 'src/link.txt'));
  assert.throws(() => inventory(root, ['src']), /Symlink/);
});

test('root inventory and verification work in a real linked Git worktree', t => {
  const root = fixture(t, model => { model.profiles.profiles[0].include_root_files = true; });
  write(root, 'tests/fixture-check.mjs', "console.log('synthetic linked-worktree check');\n");
  write(root, 'root-note.txt', 'covered root input\n');
  const worktree = `${root}-linked`;
  t.after(() => fs.rmSync(worktree, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, '-c', 'user.name=Control Fixture', '-c', 'user.email=control@example.invalid', '-c', `core.hooksPath=${path.join(root, 'disabled-hooks')}`, ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '--initial-branch=main');
  git('add', '.');
  git('commit', '-m', 'Synthetic control fixture');
  git('worktree', 'add', '--detach', worktree, 'HEAD');
  assert.equal(fs.lstatSync(path.join(worktree, '.git')).isFile(), true);
  const profile = profileAt(worktree);
  const inputs = fingerprint(worktree, profile).files;
  assert.equal(Object.hasOwn(inputs, '.git'), false);
  assert.equal(Object.hasOwn(inputs, 'root-note.txt'), true);
  assert.equal(verify(worktree, profile.id).status, 'passed');
  write(worktree, 'root-note.txt', 'changed covered root input\n');
  assert.equal(evidenceStatus(worktree, profile).status, 'stale');
});

test('real fixture command produces evidence and a current cache prevents redundant execution', t => {
  const root = fixture(t);
  withMode('pass', () => {
    assert.equal(evidenceStatus(root, profileAt(root)).status, 'not_run');
    const first = verify(root, 'fixture-check');
    assert.equal(first.status, 'passed'); assert.equal(first.reused, false); assert.equal(runCount(root), 1);
    const reused = verify(root, 'fixture-check');
    assert.equal(reused.status, 'passed'); assert.equal(reused.reused, true); assert.equal(runCount(root), 1);
    assert.equal(verify(root, 'fixture-check', { force: true }).reused, false);
    assert.equal(runCount(root), 2);
  });
});

test('noncacheable profiles require a declared positive finite freshness bound', () => {
  for (const max_age_ms of [undefined, null, 0, -1, NaN, Infinity, '60000']) {
    const model = modelFixture();
    Object.assign(model.profiles.profiles[0], { cacheable: false, max_age_ms });
    assert.match(errors(model), /positive finite max_age_ms/);
  }
  const model = modelFixture();
  Object.assign(model.profiles.profiles[0], { cacheable: false, max_age_ms: 60000 });
  assert.deepEqual(validateModel(model), []);
  delete model.profiles.profiles[0].cacheable;
  assert.match(errors(model), /must declare cacheable/);
});

test('noncacheable evidence reruns and expires; missing, invalid and future timestamps fail closed', t => {
  const maxAge = 60000;
  const root = fixture(t, model => { Object.assign(model.profiles.profiles[0], { cacheable: false, max_age_ms: maxAge }); });
  withMode('pass', () => {
    assert.equal(verify(root, 'fixture-check').status, 'passed');
    assert.equal(evidenceStatus(root, profileAt(root)).status, 'passed');
    assert.equal(verify(root, 'fixture-check').reused, false);
    assert.equal(runCount(root), 2);
    const recordPath = 'docs/00-control/evidence/fixture-check.json';
    const recordedAt = Date.parse(JSON.parse(fs.readFileSync(path.join(root, recordPath), 'utf8')).recorded_at);
    t.mock.method(Date, 'now', () => recordedAt + maxAge);
    assert.equal(evidenceStatus(root, profileAt(root)).status, 'passed', 'The exact maximum age remains within the bound.');
    for (const [timestamp, expected] of [
      [new Date(recordedAt - 1).toISOString(), 'stale'],
      [new Date(recordedAt + maxAge + 1).toISOString(), 'stale'],
      [undefined, 'invalid'], [null, 'invalid'], ['not-a-timestamp', 'invalid'],
    ]) {
      updateJson(root, recordPath, evidence => { evidence.recorded_at = timestamp; });
      assert.equal(evidenceStatus(root, profileAt(root)).status, expected);
    }
    updateJson(root, recordPath, evidence => { evidence.recorded_at = new Date(recordedAt).toISOString(); });
    const unbounded = { ...profileAt(root) }; delete unbounded.max_age_ms;
    assert.equal(evidenceStatus(root, unbounded).status, 'invalid');
  });
});

test('source additions, changes, removals, tests, config and profile inputs invalidate evidence', t => {
  const root = fixture(t);
  const mutations = [
    () => write(root, 'src/new.txt', 'new covered source\n'),
    () => write(root, 'src/main.txt', 'changed source\n'),
    () => fs.unlinkSync(path.join(root, 'src/new.txt')),
    () => fs.appendFileSync(path.join(root, 'tests/fixture-check.mjs'), '\n// changed test\n'),
    () => updateJson(root, 'config/policy-defaults.json', d => { d.documents.extra_check = true; }),
    () => updateJson(root, 'VERIFICATION_PROFILES.json', d => { d.profiles[0].environment = 'changed-fixture-config'; }),
    () => updateJson(root, 'VERIFICATION_PROFILES.json', d => { d.profiles[0].commands[0].push('--synthetic-profile-change'); }),
    () => updateJson(root, 'package-lock.json', d => { d.fixture_revision = 2; }),
  ];
  withMode('pass', () => {
    assert.equal(verify(root, 'fixture-check').status, 'passed');
    for (const mutate of mutations) {
      mutate();
      assert.notEqual(evidenceStatus(root, profileAt(root)).status, 'passed');
      const next = verify(root, 'fixture-check');
      assert.equal(next.status, 'passed'); assert.equal(next.reused, false);
    }
    assert.equal(runCount(root), mutations.length + 1);
  });
});

test('declared environment input change invalidates a cached pass without storing the raw value', t => {
  const root = fixture(t);
  withMode('synthetic-env-value-a', () => assert.equal(verify(root, 'fixture-check').status, 'passed'));
  withMode('synthetic-env-value-b', () => {
    assert.notEqual(evidenceStatus(root, profileAt(root)).status, 'passed');
    assert.equal(verify(root, 'fixture-check').reused, false);
  });
  const evidence = fs.readFileSync(path.join(root, 'docs/00-control/evidence/fixture-check.json'), 'utf8');
  assert.doesNotMatch(evidence, /synthetic-env-value-[ab]/);
  assert.equal(runCount(root), 2);
});

test('runtime identity participates in evidence freshness', t => {
  const root = fixture(t);
  withMode('pass', () => {
    assert.equal(verify(root, 'fixture-check').status, 'passed');
    assert.equal(fingerprint(root, profileAt(root)).identity.node, process.version);
    const moduleUrl = pathToFileURL(path.join(root, 'scripts/os-control.mjs')).href;
    const code = `Object.defineProperty(process, 'version', { value: 'v0.synthetic-different-runtime' });
const { evidenceStatus, loadModel } = await import(${JSON.stringify(moduleUrl)});
console.log(JSON.stringify(evidenceStatus(${JSON.stringify(root)}, loadModel(${JSON.stringify(root)}).profiles.profiles[0])));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(JSON.parse(result.stdout).status, 'passed');
  });
});

test('failed verification replaces prior success and cannot be reused as passing', t => {
  const root = fixture(t);
  withMode('pass', () => assert.equal(verify(root, 'fixture-check').status, 'passed'));
  withMode('fail', () => {
    const failed = verify(root, 'fixture-check', { force: true });
    assert.equal(failed.status, 'failed');
    assert.notEqual(evidenceStatus(root, profileAt(root)).status, 'passed');
    updateJson(root, 'docs/00-control/evidence/fixture-check.json', evidence => { evidence.result = 'passed'; });
    assert.notEqual(evidenceStatus(root, profileAt(root)).status, 'passed', 'A forged result label cannot overrule failed command evidence.');
    const again = verify(root, 'fixture-check');
    assert.equal(again.status, 'failed'); assert.equal(again.reused, false);
  });
  assert.equal(runCount(root), 3);
});

test('tampered verification log is rejected and fresh execution repairs evidence', t => {
  const root = fixture(t);
  withMode('pass', () => {
    assert.equal(verify(root, 'fixture-check').status, 'passed');
    fs.appendFileSync(path.join(root, 'docs/00-control/evidence/fixture-check.log'), 'unrecorded modification\n');
    assert.notEqual(evidenceStatus(root, profileAt(root)).status, 'passed');
    assert.equal(verify(root, 'fixture-check').reused, false);
    assert.equal(evidenceStatus(root, profileAt(root)).status, 'passed');
  });
});

test('tracked input changed during execution invalidates a zero-exit command', t => {
  const root = fixture(t);
  withMode('mutate', () => {
    const result = verify(root, 'fixture-check');
    assert.equal(result.status, 'failed');
    assert.notEqual(evidenceStatus(root, profileAt(root)).status, 'passed');
    assert.match(fs.readFileSync(path.join(root, 'docs/00-control/evidence/fixture-check.log'), 'utf8'), /inputs changed during execution/i);
  });
});

test('implemented declaration needs current evidence and required runtime evidence levels', t => {
  const root = fixture(t, model => {
    Object.assign(model.requirements.requirements[0], { status: 'implemented', verification_profiles: ['fixture-check'] });
    Object.assign(model.queue.tasks[0], { status: 'implemented', verification_profiles: ['fixture-check'] });
  });
  assert.deepEqual(currentStatus(root).verified_product_modules, []);
  withMode('pass', () => {
    verify(root, 'fixture-check');
    assert.deepEqual(currentStatus(root).verified_product_modules, ['M01']);
    updateJson(root, 'REQUIREMENTS.json', d => { d.requirements[0].required_evidence_levels = ['database', 'api', 'browser']; });
    assert.deepEqual(currentStatus(root).verified_product_modules, [], 'A static/unit pass must not certify a runtime module.');
    assert.equal(releaseReadiness(root).ready, false);
    assert.match(releaseReadiness(root).gaps.join('\n'), /M01.*(database|api|browser)/);
  });
});

test('declared task evidence levels must be nonempty distinct strings', () => {
  for (const levels of [null, [], 'database', [''], [' '], ['database', 1], ['database', 'database']]) {
    const model = modelFixture(); model.queue.tasks[0].required_evidence_levels = levels;
    assert.match(errors(model), /nonempty, distinct evidence levels/);
  }
});

test('SEC runtime task cannot unblock its dependent with static evidence alone', t => {
  const root = fixture(t, model => {
    const task = model.queue.tasks[0];
    Object.assign(task, { id: 'SEC-001', verification_profiles: ['fixture-check'], required_evidence_levels: ['database', 'api'] });
    model.queue.tasks[1].dependencies = ['SEC-001'];
  });
  withMode('pass', () => {
    assert.equal(verify(root, 'fixture-check').status, 'passed');
    updateJson(root, 'BUILD_QUEUE.json', model => { model.tasks[0].status = 'implemented'; });
    assert.throws(() => currentStatus(root), /Implemented task lacks database verification profile: SEC-001/);
    updateJson(root, 'VERIFICATION_PROFILES.json', model => {
      model.profiles[0].level = 'database';
      model.profiles.push({ ...model.profiles[0], id: 'fixture-api', level: 'api' });
    });
    updateJson(root, 'BUILD_QUEUE.json', model => { model.tasks[0].verification_profiles.push('fixture-api'); });
    assert.equal(verify(root, 'fixture-check').status, 'passed');
    assert.equal(currentStatus(root).tasks[0].verified, false, 'A database pass alone still lacks API evidence.');
    assert.notEqual(currentStatus(root).next_ready_task, 'TASK-2');
    assert.equal(verify(root, 'fixture-api').status, 'passed');
    assert.equal(currentStatus(root).tasks[0].verified, true);
    assert.equal(currentStatus(root).next_ready_task, 'TASK-2');
  });
});

test('non-git checkpoint cannot claim a push, remote match or Cursor synchronization', t => {
  const root = fixture(t);
  const record = checkpoint(root, { verifyRemote: true });
  assert.equal(record.git.is_repository_root, false);
  assert.equal(record.git.head, null);
  assert.equal(record.git.remote.status, 'not_checked');
  assert.equal(record.git.remote.head, null);
  assert.match(record.note, /Never claim Cursor synchronization/);
  assert.match(fs.readFileSync(path.join(root, 'docs/00-control/RESUME.md'), 'utf8'), /not a claim of push/);
  assert.equal(releaseReadiness(root).ready, false);
});

function activationFixture() {
  return {
    policy: { actions: { release_document: ['OD-001', 'OD-002'], commit_spend: ['OD-001', 'OD-003'] } },
    decisions: ['OD-001', 'OD-002', 'OD-003'].map(id => ({ id, status: 'configured_for_development', production_enabled: false })),
  };
}

test('activation permits only explicit synthetic dev/test actions and denies real/unknown inputs', () => {
  const input = activationFixture();
  for (const environment of ['development', 'test']) {
    assert.deepEqual(evaluateActivation({ ...input, environment, synthetic: true, action: 'release_document' }), { allowed: true, reason: 'synthetic_development_only' });
    for (const synthetic of [false, undefined, 'true', 1]) assert.equal(evaluateActivation({ ...input, environment, synthetic, action: 'release_document' }).allowed, false);
  }
  for (const environment of ['staging', 'unknown', undefined]) assert.equal(evaluateActivation({ ...input, environment, synthetic: true, action: 'release_document' }).allowed, false);
  for (const action of ['unknown_action', 'toString', '__proto__']) assert.equal(evaluateActivation({ ...input, environment: 'development', synthetic: true, action }).allowed, false);
});

test('partial approvals activate only actions whose complete decision set is approved', () => {
  const input = activationFixture();
  input.decisions[0] = approve(input.decisions[0]);
  let result = evaluateActivation({ ...input, environment: 'production', action: 'release_document' });
  assert.equal(result.allowed, false); assert.deepEqual(result.pending, ['OD-002']);
  input.decisions[1] = approve(input.decisions[1]);
  assert.equal(evaluateActivation({ ...input, environment: 'production', action: 'release_document' }).allowed, true);
  result = evaluateActivation({ ...input, environment: 'production', action: 'commit_spend' });
  assert.equal(result.allowed, false); assert.deepEqual(result.pending, ['OD-003']);
  input.decisions.splice(1, 1);
  assert.equal(evaluateActivation({ ...input, environment: 'production', action: 'release_document' }).allowed, false);
});

test('production approval is a policy activation result, never proof of actor/runtime authorization', () => {
  const input = activationFixture(); input.decisions = input.decisions.map(approve);
  const result = evaluateActivation({ ...input, environment: 'production', action: 'release_document' });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'policy_activation_only');
  assert.equal(Object.hasOwn(result, 'authenticated'), false);
  assert.equal(Object.hasOwn(result, 'authorized_actor'), false);
  for (const field of ['approved_by', 'approved_at', 'approval_evidence', 'production_enabled']) {
    const broken = clone(input); broken.decisions[0][field] = null;
    assert.equal(evaluateActivation({ ...broken, environment: 'production', action: 'release_document' }).allowed, false, `${field} is required`);
  }
});
