// Uses the existing pinned, test-only Khronos validator. No external resource loading.
const fs = require('node:fs');
const validator = require('./.validator-toolchain/node_modules/gltf-validator');
const input = process.argv[2];
if (!input) throw new Error('Usage: node tests/data/validate-glb.cjs FILE.glb [REPORT.json]');
validator.validateBytes(new Uint8Array(fs.readFileSync(input)), {
  format: 'glb', writeTimestamp: false, maxIssues: 100,
  externalResourceFunction: async () => { throw new Error('External resources forbidden'); },
}).then(result => {
  const report = { validator: 'gltf-validator', version: validator.version(), result };
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ version: validator.version(), ...result.issues }));
  if (result.issues.numErrors || result.issues.numWarnings) process.exitCode = 1;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
