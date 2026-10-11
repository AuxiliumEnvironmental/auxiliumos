#!/usr/bin/env python3
"""Actual Chromium export evidence; does not establish Apple/device/live acceptance."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import zipfile

WEB = Path(__file__).resolve().parents[2]
ROOT = WEB.parent
OUT = WEB / 'tests/data/generated'
OUT.mkdir(exist_ok=True)
BROWSER = Path(os.environ.get('SPATIAL_BROWSER_EXECUTABLE', WEB / 'tests/ui/.browser-runtime/chromium'))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def hashes():
    paths = [*sorted((WEB / 'src').rglob('*.ts')), *sorted((WEB / 'src').rglob('*.tsx')), *sorted((WEB / 'src').rglob('*.css')),
             *sorted((ROOT / 'contracts').glob('*.schema.json')),
             WEB / 'tests/data/browser.spec.ts', WEB / 'tests/data/server.ts', WEB / 'tests/data/playwright.config.ts', Path(__file__).resolve(),
             WEB / 'package.json', WEB / 'package-lock.json', WEB / 'tsconfig.json', WEB / 'vite.config.ts', WEB / 'index.html', ROOT / 'fixtures/geometry.json']
    return {str(path.relative_to(ROOT)): sha(path) for path in paths if path.exists()}

before = hashes()
command = ['node', 'node_modules/@playwright/test/cli.js', 'test', '--config', 'tests/data/playwright.config.ts']
completed = subprocess.run(command, cwd=WEB, text=True, capture_output=True)
log = completed.stdout + completed.stderr
(OUT / 'BROWSER_TESTS.log').write_text(log)
after = hashes()
result_path = OUT / 'BROWSER_RESULTS.json'
results = json.loads(result_path.read_text()) if result_path.exists() else {'stats': {'reportMissing': True}}
postchecks = []
if completed.returncode == 0:
    # Check the actual archive with the preserved schema through an independent JSON-schema reader.
    validate = '''import json,sys,zipfile,hashlib
from pathlib import Path
import jsonschema
root=Path(sys.argv[1])
for name in ['all-floor.spatial.zip','copied-all-floor.spatial.zip']:
 with zipfile.ZipFile(root/'web/tests/data/generated/browser'/name)as archive:
  manifest=json.loads(archive.read('manifest.json'));copied=manifest['profileVersion'].endswith('/1.1.0')
  schema='local-document-manifest-v1.1.schema.json' if copied else 'local-document-manifest.schema.json'
  jsonschema.Draft202012Validator(json.loads((root/'contracts'/schema).read_text())).validate(manifest)
  for file in manifest['files']:
   data=archive.read(file['path']);assert len(data)==file['bytes'];assert hashlib.sha256(data).hexdigest()==file['sha256']
  if copied:
   descriptor=json.loads(archive.read('source/identity.json'));jsonschema.Draft202012Validator(json.loads((root/'contracts/source-provenance.schema.json').read_text())).validate(descriptor)
   original=archive.read('source/geometry.json');assert descriptor['sourceIdentity']['sha256']==hashlib.sha256(original).hexdigest()
  print(json.dumps({'archive':name,'manifestProfile':manifest['profileVersion'],'floors':len(manifest['floors']),'verifiedMembers':len(manifest['files'])}))
'''
    checks = [([str(WEB / 'tests/data/.venv/bin/python'), '-c', validate, str(ROOT)], 'native_local_document_schema_and_member_identity'),
              (['pdftoppm', '-f', '1', '-singlefile', '-scale-to', '1200', '-png', str(OUT / 'browser/unicode-corrected.pdf'), str(OUT / 'browser/unicode-pdf-render')], 'actual_unicode_pdf_reader_render')]
    for args, name in checks:
        result = subprocess.run(args, cwd=WEB, text=True, capture_output=True)
        postchecks.append({'check': name, 'command': args, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
font_list = subprocess.run(['fc-list', '--format=%{file}\n'], text=True, capture_output=True)
font_paths = sorted(set(font_list.stdout.splitlines())) if font_list.returncode == 0 else []
unchanged = before == after
success = completed.returncode == 0 and unchanged and result_path.exists() and all(check['exitCode'] == 0 for check in postchecks)
report = {
    'status': 'passed' if success else 'failed_or_inputs_changed', 'timestampUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'inputBaselineCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'evidenceClass': 'actual_Chromium_workspace_export_download_import_and_raster_behavior',
    'workingSourceHashes': before, 'inputsUnchangedDuringRun': unchanged,
    'changedDuringRun': sorted(key for key in before.keys() | after.keys() if before.get(key) != after.get(key)),
    'command': command, 'cwd': str(WEB), 'exitCode': completed.returncode, 'results': results['stats'], 'postchecks': postchecks,
    'environment': {'platform': platform.platform(), 'node': subprocess.check_output(['node', '--version'], text=True).strip(), 'browserExecutable': str(BROWSER), 'browserSHA256': sha(BROWSER), 'fontFileHashes': {path: sha(Path(path)) for path in font_paths}},
    'artifacts': {str(path.relative_to(ROOT)): {'bytes': path.stat().st_size, 'sha256': sha(path)} for path in sorted((OUT / 'browser').glob('*')) if path.is_file()},
    'priorResultsRetained': ['prior-browser-selector-failure', 'prior-browser-format-locator-failure', 'prior-browser-pdf-roundtrip-failure', 'prior-browser-missing-cjk-glyphs', 'prior-browser-wrapped-label-assertion', 'prior-browser-hmr-run'],
    'limitations': ['Synthetic layouts only', 'Tested installed Greek/Latin glyph coverage; Linux runtime has no CJK font', 'Missing-glyph detector is conservative, not proof of exhaustive Unicode coverage', 'No Apple SDK compilation, iOS WebView, native device, capture, physical accessibility, performance acceptance, live integration or release established'],
}
(OUT / 'BROWSER_EVIDENCE.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['status', 'exitCode', 'inputsUnchangedDuringRun', 'changedDuringRun', 'results']}))
if not success:
    print(log)
    raise SystemExit(completed.returncode or 1)
