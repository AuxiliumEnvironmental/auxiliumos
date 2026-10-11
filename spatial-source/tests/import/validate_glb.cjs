#!/usr/bin/env node
// Test-only official Khronos validator. Never fetches external resources or uploads bytes.
const fs = require('node:fs');
const path = require('node:path');
const validator = require('./.validator-toolchain/node_modules/gltf-validator');

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node tests/import/validate_glb.cjs FILE.glb [REPORT.json]');
  const result = await validator.validateBytes(new Uint8Array(fs.readFileSync(file)), {
    uri: path.basename(file), format: 'glb', writeTimestamp: false, maxIssues: 100,
    externalResourceFunction: async () => { throw new Error('External resources forbidden'); },
  });
  const report = { validatorPackage: 'gltf-validator', version: validator.version(), result };
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ version: validator.version(), ...result.issues }, null, 2));
  if (result.issues.numErrors || result.issues.numWarnings) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
