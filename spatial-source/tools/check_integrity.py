#!/usr/bin/env python3
"""Check the packaged bytes, without trusting paths supplied by the manifest.

This detects accidental changes against the supplied baseline. It is not a
signature, proof of provenance, authorization check, or production security audit.
"""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
IGNORED_DIRS = {'.build', '__pycache__', '.git', '.swiftpm'}
MANIFEST = 'PACKAGE_MANIFEST.json'


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def check(root: Path) -> int:
    baseline = json.loads((root / MANIFEST).read_text(encoding='utf-8'))
    if baseline.get('version') != 1 or not isinstance(baseline.get('files'), list):
        raise ValueError('Unsupported manifest format')
    expected = set()
    for row in baseline['files']:
        name = row['path']
        parts = PurePosixPath(name)
        if (not name or parts.is_absolute() or '..' in parts.parts or
                '\\' in name or str(parts) != name or name == MANIFEST or name in expected):
            raise ValueError(f'Unsafe or duplicate manifest path: {name!r}')
        expected.add(name)
        path = root / name
        if any((root.joinpath(*parts.parts[:i])).is_symlink()
               for i in range(1, len(parts.parts) + 1)):
            raise ValueError(f'Symlink forbidden: {name}')
        if not path.is_file():
            raise ValueError(f'Missing file: {name}')
        if path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
            raise ValueError(f'File differs from package baseline: {name}')
    actual = {p.relative_to(root).as_posix() for p in root.rglob('*')
              if p.is_file() and not (set(p.relative_to(root).parts) & IGNORED_DIRS)
              and p.name != '.DS_Store' and p.relative_to(root).as_posix() != MANIFEST}
    if actual != expected:
        raise ValueError(f'Unlisted files: {sorted(actual - expected)}; missing: {sorted(expected - actual)}')
    return len(expected)


def main() -> int:
    if len(sys.argv) > 2:
        print('Usage: python tools/check_integrity.py [package-root]', file=sys.stderr)
        return 2
    root = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else ROOT
    try:
        count = check(root)
        print(f'Package byte integrity passed: {count} listed files. Not a digital signature.')
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f'Integrity check failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
