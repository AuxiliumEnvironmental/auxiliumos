#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Active Markdown only. Historical evidence is preserved, not rewritten to pass.
export function inspectMarkdown(text, filename, root) {
  const errors = []; let fence = null;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length, line: index + 1 };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (fence) continue;
    for (const match of line.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const destination = path.resolve(path.dirname(filename), decodeURIComponent(target.split('#')[0]));
      if (!destination.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(destination)) errors.push(`${path.relative(root, filename)}:${index + 1}: missing/unsafe local link ${target}`);
    }
  }
  if (fence) errors.push(`${path.relative(root, filename)}:${fence.line}: unclosed code fence`);
  return errors;
}

export function checkDocs(root) {
  const errors = []; let count = 0;
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['.git', 'node_modules', '10-history', 'evidence', 'test-results', 'playwright-report'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (directory === root && entry.isDirectory() && !['docs', '.cursor', '.codex', '.github'].includes(entry.name)) continue;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.(md|mdc)$/.test(entry.name)) { count++; errors.push(...inspectMarkdown(fs.readFileSync(file, 'utf8'), file, root)); }
    }
  };
  visit(root); return { files_checked: count, errors };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDocs(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
