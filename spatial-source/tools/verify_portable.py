#!/usr/bin/env python3
"""Build and run portable XCTest binaries, preserving input-bound evidence.

Direct XCTest execution avoids the separately recorded Linux SwiftPM test-runner
process-accounting failure. It does not replace an Apple build or device tests.
Never rerun a failing test automatically or overwrite an earlier run.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = {
    "SpatialCore": ("packages/SpatialCore", []),
    "CaptureKit": ("packages/CaptureKit", []),
    "SpatialInterop": ("packages/SpatialInterop", ["packages/SpatialCore", "contracts"]),
    "SpatialPersistence": ("packages/SpatialPersistence", ["packages/SpatialCore", "packages/SpatialInterop", "contracts"]),
    "WorkflowIntegration": ("tests/WorkflowIntegration", ["packages/SpatialCore", "packages/SpatialInterop", "packages/SpatialPersistence", "packages/CaptureKit", "contracts"]),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs(directories):
    paths = []
    for directory in directories:
        paths.extend(p for p in (ROOT / directory).rglob("*") if p.is_file()
                     and not any(part in {".build", "__pycache__", ".swiftpm"} for part in p.parts)
                     and p.suffix in {".swift", ".json", ".h", ".c", ".modulemap"})
    return {str(p.relative_to(ROOT)): digest(p) for p in sorted(set(paths))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--swift", type=Path, required=True)
    parser.add_argument("--sqlite-root", type=Path, required=True)
    parser.add_argument("packages", nargs="+", choices=PACKAGES)
    args = parser.parse_args()
    run = ROOT / "evidence" / "continuation" / ("portable-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    run.mkdir(parents=True, exist_ok=False)
    env = os.environ.copy()
    env.update(SWIFT_USE_OLD_DRIVER="1", SWIFT_BACKTRACE="enable=no")
    env["LD_LIBRARY_PATH"] = str(args.sqlite_root / "usr/lib/x86_64-linux-gnu")
    version = subprocess.run([str(args.swift), "--version"], env=env, text=True, capture_output=True, check=True).stdout.strip()
    result = {"base_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "environment": {"platform": os.uname().sysname + " " + os.uname().release, "swift": version,
                              "driver": "legacy (SWIFT_USE_OLD_DRIVER=1)", "runner": "direct compiled XCTest",
                              "sqlite_sha256": digest(args.sqlite_root / "usr/lib/x86_64-linux-gnu/libsqlite3.so.0.8.6")},
              "apple_sdk_compiled": False, "physical_device_tested": False, "packages": {}}
    for name in args.packages:
        relative, dependencies = PACKAGES[name]
        before = inputs([relative] + dependencies)
        command = [str(args.swift), "build", "--build-tests", "--package-path", str(ROOT / relative), "-j", "2",
                   "-Xcc", "-I" + str(args.sqlite_root / "usr/include"),
                   "-Xlinker", "-L" + str(args.sqlite_root / "usr/lib/x86_64-linux-gnu")]
        entry = {"source_sha256": before, "commands": [command]}
        result["packages"][name] = entry
        print("Building", name, flush=True)
        with (run / (name + "-build.log")).open("w") as log:
            entry["build_exit"] = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
        if entry["build_exit"] == 0:
            binaries = list((ROOT / relative / ".build" / "debug").glob("*PackageTests.xctest"))
            if len(binaries) != 1:
                raise RuntimeError("Expected exactly one compiled XCTest binary for " + name)
            binary = binaries[0]
            entry["binary_sha256"] = digest(binary)
            entry["commands"].append([str(binary)])
            print("Testing", name, flush=True)
            test_log = run / (name + "-tests.log")
            with test_log.open("w") as log:
                entry["test_exit"] = subprocess.run([str(binary)], cwd=ROOT / relative, env=env, stdout=log, stderr=subprocess.STDOUT).returncode
            matches = re.findall(r"Executed (\d+) tests?, with (\d+) failures?", test_log.read_text())
            entry["xctest"] = {"tests": int(matches[-1][0]), "failures": int(matches[-1][1])} if matches else None
        entry["inputs_unchanged"] = before == inputs([relative] + dependencies)
        entry["passed"] = entry.get("test_exit") == 0 and bool(entry.get("xctest")) and entry["xctest"]["failures"] == 0 and entry["inputs_unchanged"]
        (run / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
        print(name, "PASS" if entry["passed"] else "FAIL (evidence retained)", entry.get("xctest"), flush=True)
    result["passed"] = all(e["passed"] for e in result["packages"].values())
    (run / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
    print(str(run.relative_to(ROOT)), flush=True)
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
