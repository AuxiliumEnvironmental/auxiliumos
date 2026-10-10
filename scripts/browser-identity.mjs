// Read-only identity of the browser used by the synthetic browser profiles.
// This records the actual binary at execution time, not a hosted acceptance claim.
import { chromium } from '@playwright/test';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const executable = realpathSync(process.env.AUXILIUMOS_BROWSER_EXECUTABLE || chromium.executablePath());
const version = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
const sha256 = createHash('sha256').update(readFileSync(executable)).digest('hex');
console.log(JSON.stringify({ browser_executable: executable, browser_version: version, browser_sha256: sha256 }));
