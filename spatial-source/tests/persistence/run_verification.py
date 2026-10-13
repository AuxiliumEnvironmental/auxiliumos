#!/usr/bin/env python3
"""Run the portable persistence checks and save precise, reproducible evidence."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--swift", default=shutil.which("swift"))
    args = parser.parse_args()
    if not args.swift:
        parser.error("Swift is unavailable. Supply --swift; no native/device claim is implied.")
    root = Path(__file__).resolve().parents[2]
    output = root / "tests/persistence"
    paths = []
    for package in ("SpatialCore", "SpatialPersistence"):
        base = root / "packages" / package
        paths.append(base / "Package.swift")
        paths.extend(path for tree in ("Sources", "Tests") for path in (base / tree).rglob("*") if path.is_file())
    paths.extend([Path(__file__), output / "process_death.py"])

    def hashes():
        return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}

    before = hashes()
    test_command = [args.swift, "test", "--package-path", "packages/SpatialPersistence", "--jobs", "1"]
    version = subprocess.run([args.swift, "--version"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
    tests = subprocess.run(test_command, cwd=root, capture_output=True, text=True)
    (output / "latest-swift-test.log").write_text(tests.stdout + tests.stderr)
    crash_command = [sys.executable, "tests/persistence/process_death.py", "packages/SpatialPersistence/.build/debug/spatialstorecheck"]
    crashes = None
    if tests.returncode == 0:
        crashes = subprocess.run(crash_command, cwd=root, capture_output=True, text=True)
        (output / "latest-process-death.log").write_text(crashes.stdout + crashes.stderr)
    after = hashes()
    report = {
        "recordedAtUTC": datetime.now(timezone.utc).isoformat(),
        "baselineHEAD": subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip(),
        "swift": version, "platform": platform.platform(), "python": sys.version.split()[0],
        "SWIFT_USE_OLD_DRIVER": os.environ.get("SWIFT_USE_OLD_DRIVER"),
        "testCommand": test_command, "testExit": tests.returncode,
        "processDeathCommand": crash_command, "processDeathExit": None if crashes is None else crashes.returncode,
        "inputsStableDuringRun": before == after, "inputSHA256": before,
        "evidenceScope": "Linux portable tests using synthetic data. Not Xcode, iOS protection, LiDAR, or physical-device acceptance.",
    }
    if crashes is not None and crashes.returncode == 0:
        report["processDeathResults"] = json.loads(crashes.stdout)
    (output / "LATEST_VERIFICATION.json").write_text(json.dumps(report, indent=2) + "\n")
    success = tests.returncode == 0 and crashes is not None and crashes.returncode == 0 and before == after
    print(json.dumps({"passed": success, "testExit": tests.returncode,
                      "processDeathExit": None if crashes is None else crashes.returncode,
                      "inputsStable": before == after, "report": "tests/persistence/LATEST_VERIFICATION.json"}))
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
