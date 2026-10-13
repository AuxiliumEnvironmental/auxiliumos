#!/usr/bin/env python3
"""Stage exact canonical inputs in the authorized existing OS CI branch.
Generated snapshots are build inputs, never independently maintained source.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
target = Path(sys.argv[1]).resolve() / 'spatial-source'
paths = []
for name in ['packages', 'ios', 'tests/native', 'tests/capacitor', 'fixtures', 'contracts', 'capacitor', 'web/src']:
    paths += [p for p in (ROOT/name).rglob('*') if p.is_file() and not any(part in {'.build','.build-device','DerivedData','node_modules','public','evidence','__pycache__','.build-simulator'} for part in p.relative_to(ROOT).parts)]
paths += [ROOT/name for name in ['web/package.json','web/package-lock.json','web/tsconfig.json','web/vite.config.ts','web/vite.library.config.ts','web/offlinePlugin.ts','web/index.html','web/capacitor.config.ts']]
paths += [ROOT/name for name in ['integration/apple-interop-evidence.json', 'integration/reuse_apple_interop.py']]
manifest = {'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
            'purpose':'Generated native build snapshot with complete C/Swift/React dependencies and synthetic fixtures. Canonical source remains the Auxilium Spatial repository.', 'files':{}}
for p in sorted(set(paths)):
    if p.is_symlink(): raise SystemExit(f'Refuse symlink: {p}')
    if p.suffix.lower() in {'.ttf','.otf','.woff','.woff2','.p12','.mobileprovision'}: raise SystemExit(f'Refuse excluded input: {p}')
    relative = p.relative_to(ROOT)
    destination = target/relative
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(p,destination)
    manifest['files'][str(relative)] = hashlib.sha256(p.read_bytes()).hexdigest()
(target/'SOURCE_SNAPSHOT.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Staged {len(paths)} exact source inputs, including C sources and binary test fixtures.')
