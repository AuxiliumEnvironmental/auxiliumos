#!/usr/bin/env python3
"""Package the actual built workspace into the native host; no preview fallback."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
CSP = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-src 'none'; "
       "object-src 'none'; base-uri 'self'; form-action 'none'")


def prepare_assets(source: Path, destination: Path):
    if not (source / 'index.html').is_file():
        raise ValueError('Build the canonical web workspace first; no placeholder will be packaged.')
    files = sorted(source.rglob('*'))
    if any(file.is_symlink() for file in files):
        raise ValueError('Symlinked web assets are not accepted.')
    files = [file for file in files if file.is_file()]
    if any(file.suffix.lower() in ('.ttf', '.otf', '.woff', '.woff2') for file in files):
        raise ValueError('Font binaries must not be included in the source distribution.')
    if sum(file.stat().st_size for file in files) > 512 * 1024 * 1024:
        raise ValueError('Unexpectedly large workspace build.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.workspace-staging-', dir=destination.parent))
    try:
        for file in files:
            target = staging / file.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
        index = staging / 'index.html'
        html = index.read_text()
        if '<head>' not in html:
            raise ValueError('Workspace index has no head element.')
        html = html.replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + CSP + '">', 1)
        index.write_text(html)
        hashes = {str(file.relative_to(source)): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}
        packaged = {str(file.relative_to(staging)): hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(staging.rglob('*')) if file.is_file()}
        manifest = {'bridgeVersion': '1.0.0', 'source': 'web/dist', 'sourceFiles': hashes, 'packagedFiles': packaged,
                    'transform': 'Installed-host CSP only; canonical React/TypeScript build unchanged.'}
        (staging / 'GENERATED_WEB_ASSETS.json').write_text(json.dumps(manifest, indent=2) + '\n')
        backup = destination.with_name('.previous-public')
        if backup.exists():
            raise ValueError('A previous interrupted package operation needs review: ' + str(backup))
        if destination.exists(): os.replace(destination, backup)
        try: os.replace(staging, destination)
        except Exception:
            if backup.exists(): os.replace(backup, destination)
            raise
        if backup.exists(): shutil.rmtree(backup)
        return manifest
    finally:
        if staging.exists(): shutil.rmtree(staging)


if __name__ == '__main__':
    manifest = prepare_assets(ROOT / 'web/dist', ROOT / 'capacitor/ios/App/public')
    subprocess.run(['python3', str(ROOT / 'capacitor/generate_project.py')], check=True)
    print(f"Packaged {len(manifest['sourceFiles'])} canonical built workspace files; no remote server configured.")
