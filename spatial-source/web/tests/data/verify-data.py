#!/usr/bin/env python3
"""Capture exact current TypeScript inputs; never relabel this as browser/device acceptance."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess

WEB = Path(__file__).resolve().parents[2]
ROOT = WEB.parent
OUT = Path(__file__).resolve().parent / "generated"
OUT.mkdir(exist_ok=True)
paths = [
    *sorted((WEB / "src/data").glob("*.ts")),
    *sorted((WEB / "src/core").glob("*.ts")),
    *sorted((WEB / "tests/data").glob("*.test.ts")),
    WEB / "src/types.ts", WEB / "package.json", WEB / "package-lock.json", WEB / "tsconfig.json",
    ROOT / "fixtures/geometry.json", ROOT / "fixtures/synthetic_exchange.zip",
    ROOT / "tests/import/generated/native_exchange.zip",
    ROOT / "tests/exports/continuation/fixtures/floorplan-0.svg",
    ROOT / "tests/exports/continuation/fixtures/floorplan-1.svg",
]
def hashes():
    return {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}

before = hashes()
command = ["node", "--import", "tsx", "--test", *[str(path.relative_to(WEB)) for path in sorted((WEB / "tests/data").glob("*.test.ts"))]]
result = subprocess.run(command, cwd=WEB, text=True, capture_output=True)
after = hashes()
log = result.stdout + result.stderr
(OUT / "PORTABLE_TESTS.log").write_text(log)
count = re.search(r"(?:ℹ|#)\s*tests\s+(\d+)", log)
report = {
    "status": "passed" if result.returncode == 0 and before == after else "failed_or_inputs_changed",
    "timestampUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "inputBaselineCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "workingSourceHashes": before,
    "inputsUnchangedDuringRun": before == after,
    "environment": {"platform": platform.platform(), "node": subprocess.check_output(["node", "--version"], text=True).strip()},
    "command": command, "cwd": str(WEB), "exitCode": result.returncode,
    "tests": int(count.group(1)) if count else None,
    "logSHA256": hashlib.sha256(log.encode()).hexdigest(),
    "evidenceClass": "fresh_TypeScript_tests_with_fake_indexeddb_and_synthetic_receiver",
    "notEstablished": ["browser_process_death", "browser_PNG_or_Unicode_PDF", "Apple_compilation", "physical_device_acceptance", "live_publication", "release"],
    "priorFailuresRetained": ["generated/prior-font-rejection/RESULT.json"],
}
(OUT / "PORTABLE_EVIDENCE.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: report[key] for key in ["status", "tests", "exitCode", "inputsUnchangedDuringRun"]}))
if result.returncode or before != after:
    print(log)
    raise SystemExit(result.returncode or 1)
