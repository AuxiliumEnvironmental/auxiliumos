#!/usr/bin/env python3
"""Export one reproducible, generated full editor module into the existing OS.

Does not modify routing/auth/shared configuration or call remote services.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
target = Path(sys.argv[1]).resolve()
if not (target / 'web/src/lib/runtime.tsx').is_file():
    raise SystemExit('Target must be the actual existing AuxiliumOS application.')
source = ROOT / 'web/dist-library'
if not (source / 'spatial-workspace.js').is_file():
    raise SystemExit('Build the canonical library before packaging.')
out = target / 'web/src/spatial-generated'
out.mkdir(parents=True, exist_ok=True)
old = out / 'SOURCE_MANIFEST.json'
if old.exists():
    prior = json.loads(old.read_text())
    for name, digest in prior['generatedFiles'].items():
        p = out / name
        if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Preserve edited generated file before replacement: {p}')
    for name in prior['generatedFiles']:
        p = out / name
        if p.is_file(): p.unlink()
for p in source.iterdir():
    if p.suffix in ('.js', '.css'): shutil.copyfile(p, out / p.name)
shutil.copyfile(ROOT / 'web/src/types.ts', out / 'types.ts')
(out / 'spatial-workspace.d.ts').write_text("import type { ComponentType } from 'react';\nimport type { WorkspaceContext } from './types';\nexport const SpatialWorkspace: ComponentType<{context?: WorkspaceContext}>;\nexport const spatialWorkspaceVersion: string;\n")
source_hashes = {}
for path in sorted((ROOT / 'web/src').rglob('*')):
    if path.is_file(): source_hashes[str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
for name in ['web/package.json','web/package-lock.json','web/vite.library.config.ts','web/tsconfig.json']:
    source_hashes[name] = hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
manifest = {'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
            'sourceFiles':source_hashes, 'generationCommand':'npm --prefix web run build:library; python3 integration/package_os.py OS_PATH',
            'generatedFiles':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.iterdir()) if p.is_file() and p.name!='SOURCE_MANIFEST.json'},
            'ownership':'Generated full authoring workspace. Do not maintain a second editor here.'}
old.write_text(json.dumps(manifest,indent=2)+'\n')
page = target/'web/src/pages/spatial.tsx'
adapter = (ROOT/'integration/SpatialPage.tsx').read_bytes()
if page.exists() and page.read_bytes()!=adapter: raise SystemExit('Existing Spatial route requires manual reconciliation; generated module updated only.')
page.write_bytes(adapter)
print(f'Exported {len(manifest["generatedFiles"])} files with exact source hashes. Routing remains lead-owned.')
