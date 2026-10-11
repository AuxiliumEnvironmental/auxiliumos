#!/usr/bin/env python3
"""Verify declared package bytes. Does not install, build, publish or modify files."""
from pathlib import Path
import hashlib, json, sys
root=Path(__file__).resolve().parent.parent
m=json.loads((root/'PACKAGE_MANIFEST.json').read_text())
fail=[]
for rel,expected in m['files'].items():
    f=(root/rel).resolve()
    if not f.is_relative_to(root) or not f.is_file(): fail.append(rel+': missing/unsafe'); continue
    if hashlib.sha256(f.read_bytes()).hexdigest()!=expected: fail.append(rel+': hash mismatch')
print(json.dumps({'checked':len(m['files']),'failures':fail,'scope':'package integrity only'},indent=2))
sys.exit(1 if fail else 0)
