#!/usr/bin/env python3
"""Bundle synthetic outputs. Never sends data anywhere."""
from pathlib import Path
import hashlib
import json
import zipfile
from validate_package import validate_files

root = Path(__file__).resolve().parents[1]
files = {name: (root / "fixtures" / name).read_bytes() for name in ("geometry.json", "scene.json", "floorplan.svg")}
geometry = json.loads(files["geometry.json"])
manifest = {"formatVersion": "1.0.0", "documentID": geometry["documentID"], "revision": geometry["revision"], "measurementStatus": "unverified", "contentClass": "spatial-draft", "files": [{"path": k, "bytes": len(v), "sha256": hashlib.sha256(v).hexdigest()} for k, v in sorted(files.items())]}
files["manifest.json"] = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
validate_files(files)
path = root / "fixtures" / "synthetic_exchange.zip"
with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as out:
    for name, data in sorted(files.items()):
        entry = zipfile.ZipInfo(name, (2026, 10, 8, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        out.writestr(entry, data)
print(path.name)
