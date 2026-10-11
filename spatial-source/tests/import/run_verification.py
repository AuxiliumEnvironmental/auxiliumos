#!/usr/bin/env python3
"""Record source-bound portable importer/exporter evidence with exact produced-byte hashes.

This runner is not an Xcode, device, sensor, UI, durability, or live integration test.
It invokes native Swift package tests plus two independent format validators.
"""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "tests/import"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs():
    paths = []
    for parent in [ROOT / "packages/SpatialCore", ROOT / "packages/SpatialInterop", ROOT / "contracts"]:
        paths.extend(p for p in parent.rglob("*") if p.is_file() and ".build" not in p.parts and ".swiftpm" not in p.parts)
    paths += [ROOT / "fixtures/synthetic_exchange.zip", ROOT / "tools/validate_package.py",
              BASE / "run_verification.py", BASE / "validate_glb.cjs",
              BASE / ".validator-toolchain/package.json", BASE / ".validator-toolchain/package-lock.json"]
    return {str(p.relative_to(ROOT)): digest(p) for p in sorted(paths)}


def run(command, env, log):
    result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
    log.write_text(result.stdout + result.stderr)
    return {"command": command, "exitCode": result.returncode, "log": str(log.relative_to(ROOT)),
            "outputSHA256": digest(log)}, result.stdout + result.stderr


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--swift", default="swift")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--node", default="node")
    parser.add_argument("--legacy-driver", action="store_true")
    args = parser.parse_args()
    generated, evidence = BASE / "generated", BASE / "evidence"
    generated.mkdir(exist_ok=True); evidence.mkdir(exist_ok=True)
    before = inputs()
    env = dict(os.environ, SPATIAL_EXPORT_FIXTURE_DIR=str(generated))
    if args.legacy_driver:
        env["SWIFT_USE_OLD_DRIVER"] = "1"
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    version = subprocess.run([args.swift, "--version"], cwd=ROOT, env=env, capture_output=True, text=True, check=True).stdout.strip()
    checks = []
    result, output = run([args.swift, "test", "--package-path", "packages/SpatialInterop", "--jobs", "1"], env, evidence / "swift-tests.log")
    summaries = re.findall(r"Executed (\d+) tests, with (\d+) failures", output)
    result["testSummary"] = {"tests": int(summaries[-1][0]), "failures": int(summaries[-1][1])} if summaries else None
    checks.append(result)
    if result["exitCode"] == 0:
        result, _ = run([args.python, "tools/validate_package.py", str(generated / "native_exchange.zip")], env, evidence / "python-bundle.log")
        checks.append(result)
        result, _ = run([args.node, "tests/import/validate_glb.cjs", str(generated / "native_model.glb"), str(evidence / "gltf-validator-report.json")], env, evidence / "gltf-validator.log")
        checks.append(result)
    after = inputs()
    changed = sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))
    record = {
        "schemaVersion": 1, "baselineHEAD": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "startedAtRuntimeUTC": started, "finishedAtRuntimeUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "environment": {"platform": platform.platform(), "swift": version, "legacyDriver": env.get("SWIFT_USE_OLD_DRIVER") == "1"},
        "sourceInputsSHA256": before, "changedInputsDuringChecks": changed,
        "checks": checks, "passed": len(checks) == 3 and all(c["exitCode"] == 0 for c in checks) and not changed,
        "generatedArtifacts": {str(p.relative_to(ROOT)): {"bytes": p.stat().st_size, "sha256": digest(p)} for p in sorted(generated.glob("native_*"))},
        "scope": "Portable Swift + synthetic format validation only; no native SDK/device/sensor/UI/live integration acceptance.",
        "review": "Author tests. Independent QA is recorded separately by the integration lead.",
        "corruptionCorpus": {"truncatedArchivePrefixes": (ROOT / "fixtures/synthetic_exchange.zip").stat().st_size, "compressedPayloadBitMutations": 71},
    }
    (evidence / "verification.json").write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"passed": record["passed"], "changedInputs": changed, "checks": checks}, indent=2))
    return 0 if record["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
