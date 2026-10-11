#!/usr/bin/env python3
"""Verify new TS exchange/GLB/PDF outputs with existing external format readers."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

WEB = Path(__file__).resolve().parents[2]
ROOT = WEB.parent
OUT = Path(__file__).resolve().parent / "generated"
OUT.mkdir(exist_ok=True)
paths = [*sorted((WEB / "src/data").glob("*.ts")), *sorted((WEB / "src/core").glob("*.ts")), *sorted((ROOT / "contracts").glob("*.schema.json")), WEB / "src/types.ts", WEB / "package-lock.json", WEB / "tests/data/generate-probes.ts", WEB / "tests/data/validate-glb.cjs", ROOT / "fixtures/geometry.json", ROOT / "tools/validate_package.py", ROOT / "requirements-verification.txt"]
def hashes():
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
before = hashes()
commands = [
    (["node", "--import", "tsx", "tests/data/generate-probes.ts"], WEB),
    ([str(WEB / "tests/data/.venv/bin/python"), "tools/validate_package.py", "web/tests/data/generated/synthetic-two-rooms-r1.exchange.zip"], ROOT),
    ([str(WEB / "tests/data/.venv/bin/python"), "tools/validate_package.py", "web/tests/data/generated/directory-synthetic-two-rooms-r1.exchange.zip"], ROOT),
    (["node", "tests/data/validate-glb.cjs", "tests/data/generated/synthetic-two-rooms-r1-floor-1.glb", "tests/data/generated/GLTF_VALIDATION.json"], WEB),
    (["pdftoppm", "-f", "1", "-singlefile", "-scale-to", "1200", "-png", "web/tests/data/generated/synthetic-two-rooms-r1-floor-1.pdf", "web/tests/data/generated/export-review"], ROOT),
    (["pdftoppm", "-f", "2", "-singlefile", "-scale-to", "1200", "-png", "web/tests/data/generated/directory-synthetic-two-rooms-r1-floor-1.pdf", "web/tests/data/generated/directory-review"], ROOT),
]
results = []
for command, cwd in commands:
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    results.append({"command": command, "cwd": str(cwd), "exitCode": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr})
    if completed.returncode:
        break
unchanged = before == hashes()
success = len(results) == len(commands) and all(result["exitCode"] == 0 for result in results) and unchanged
report = {
    "status": "passed" if success else "failed_or_inputs_changed",
    "timestampUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "workingSourceHashes": before, "inputsUnchangedDuringRun": unchanged,
    "evidenceClass": "synthetic_format_compatibility_not_native_acceptance",
    "commands": results,
    "priorFailures": [
        {"command": "python3 tools/validate_package.py ...", "result": "ModuleNotFoundError: jsonschema", "resolution": "Installed existing requirements-verification.txt in test-only isolated virtual environment"},
        {"record": "prior-font-rejection/RESULT.json", "result": "External/custom fonts are not accepted", "resolution": "Corrected generated and accepted SVG font-family to exact existing contract value"},
    ],
    "artifacts": json.loads((OUT / "ARTIFACTS.json").read_text()),
    "glTF": json.loads((OUT / "GLTF_VALIDATION.json").read_text()) if (OUT / "GLTF_VALIDATION.json").exists() else None,
}
(OUT / "PROBE_EVIDENCE.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"status": report["status"], "checks": len(results), "inputsUnchangedDuringRun": unchanged}))
if not success:
    print(json.dumps(results, indent=2))
    raise SystemExit(1)
