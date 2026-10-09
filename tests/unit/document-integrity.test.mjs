import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectMarkdown } from '../../scripts/check-docs.mjs';

test('handoff checker distinguishes closed examples from an unclosed fence', () => {
  const root = os.tmpdir(), filename = path.join(root, 'handoff.md');
  assert.deepEqual(inspectMarkdown('# Handoff\n\n```sh\nmissing/example\n```\n', filename, root), []);
  assert.match(inspectMarkdown('# Handoff\n\n```sh\nunfinished\n', filename, root).join('\n'), /unclosed code fence/);
  assert.match(inspectMarkdown('````text\n```\n', filename, root).join('\n'), /unclosed code fence/);
});

test('handoff checker rejects broken and escaping local references while accepting existing sources', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auxilium-docs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'source.md'), '# Source\n');
  const file = path.join(root, 'handoff.md');
  assert.deepEqual(inspectMarkdown('[source](source.md#source)\n[web](https://example.com)\n', file, root), []);
  assert.match(inspectMarkdown('[missing](absent.md)', file, root).join('\n'), /missing\/unsafe local link/);
  assert.match(inspectMarkdown('[outside](../other.md)', file, root).join('\n'), /missing\/unsafe local link/);
});
