import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const report = JSON.parse(readFileSync('docs/00-control/SOURCE_RECONCILIATION.json', 'utf8'));
const remote = execFileSync('git', ['ls-remote', '--exit-code', report.canonical_repository, 'refs/heads/main'], { encoding: 'utf8', timeout: 25000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim().split(/\s+/)[0];
assert.equal(remote, report.canonical_head, 'Canonical main changed; reconcile new source before reusing this checkpoint.');
execFileSync('git', ['merge-base', '--is-ancestor', report.canonical_head, 'HEAD']);
const migration = readFileSync('supabase/migrations/20260713000100_foundation_slice_schema.sql');
assert.equal(createHash('sha256').update(migration).digest('hex'), report.foundation_sha256);
assert.equal(report.package_baseline_matches, true);
assert.equal(report.import.conflicts, 0);
assert.equal(report.lovable.inspection_status, 'completed');
console.log(JSON.stringify({ canonical_main: remote, foundation_preserved: true, source_relationship: 'Separate Lovable prototype explicitly recorded', github_write: report.github_access.write, scope: 'Current Git read plus dated connector observations only. No runtime, push or deployment claim.' }, null, 2));
