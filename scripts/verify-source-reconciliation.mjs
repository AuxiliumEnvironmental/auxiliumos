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
const publication = report.github_access.publication;
let publishedSource = null;
if (publication) {
  assert.match(publication.branch, /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/);
  assert.match(publication.head, /^[0-9a-f]{40}$/);
  assert.match(publication.tree, /^[0-9a-f]{40}$/);
  const ref = `refs/heads/${publication.branch}`;
  const publishedRemote = execFileSync('git', ['ls-remote', '--exit-code', report.canonical_repository, ref], { encoding: 'utf8', timeout: 25000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim().split(/\s+/)[0];
  // Fetching refs is not a push or merge. A historical publication remains
  // saved when the feature branch advances without rewriting its ancestry.
  execFileSync('git', ['fetch', '--no-tags', report.canonical_repository, ref], { timeout: 25000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  assert.equal(execFileSync('git', ['rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim(), publishedRemote, 'Feature branch moved during inspection; reconcile it.');
  execFileSync('git', ['merge-base', '--is-ancestor', publication.head, publishedRemote]);
  assert.equal(execFileSync('git', ['rev-parse', `${publication.head}^{tree}`], { encoding: 'utf8' }).trim(), publication.tree);
  publishedSource = { recorded_commit: publication.head, recorded_tree: publication.tree, current_branch_head: publishedRemote, preserved_in_remote_history: true };
}
console.log(JSON.stringify({ canonical_main: remote, foundation_preserved: true, source_relationship: 'Separate Lovable prototype explicitly recorded', github_write: report.github_access.write, published_source: publishedSource, scope: 'Current Git reads and historical published-tree verification plus dated connector observations. Not a push, runtime acceptance or deployment.' }, null, 2));
