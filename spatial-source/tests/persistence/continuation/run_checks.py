#!/usr/bin/env python3
"""Record changed-source portable persistence/outbox evidence without overwriting history."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--swift", required=True)
    parser.add_argument("--sqlite-root", type=Path)
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--history-only", action="store_true", help="Run only the changed history process helper, reusing separate unchanged library-test evidence")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    folder = root / "tests/persistence/continuation" / datetime.now(timezone.utc).strftime("run-%Y%m%dT%H%M%S%fZ")
    folder.mkdir()
    package = root / "packages/SpatialPersistence"
    env = dict(os.environ, SWIFT_USE_OLD_DRIVER="1", SWIFT_BACKTRACE="enable=no")
    flags = []
    if args.sqlite_root:
        libraries = str(args.sqlite_root / "usr/lib/x86_64-linux-gnu")
        env["LD_LIBRARY_PATH"] = libraries + ":" + env.get("LD_LIBRARY_PATH", "")
        flags = ["-Xcc", "-I" + str(args.sqlite_root / "usr/include"), "-Xlinker", "-L" + libraries]

    def hashes():
        paths = []
        for name in ("SpatialCore", "SpatialPersistence", "SpatialInterop"):
            base = root / "packages" / name
            paths.append(base / "Package.swift")
            trees = ("Sources", "Tests") if name == "SpatialPersistence" else ("Sources",)
            paths.extend(p for tree in trees for p in (base / tree).rglob("*") if p.is_file())
        paths.extend([root / "tests/persistence/process_death.py", Path(__file__), Path(__file__).with_name("process_death_outbox.py"),
                      Path(__file__).with_name("process_death_recovery_copy.py"), Path(__file__).with_name("trace_process_checks.py"),
                      Path(__file__).with_name("process_death_history.py")])
        return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}

    before = hashes()
    report = {"baselineHEAD": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
              "platform": platform.platform(), "inputSHA256": before, "commands": [],
              "scope": "Synthetic portable SQLite/XCTest/process-death checks only. No Apple SDK, iOS protection, sensor, physical-device, or live integration acceptance."}

    def run(label, command, timeout=180):
        try:
            result = subprocess.run(command, cwd=root, env=env, capture_output=True, text=True, timeout=timeout)
            output, code = result.stdout + result.stderr, result.returncode
        except subprocess.TimeoutExpired as error:
            output = (error.stdout or b"").decode() + (error.stderr or b"").decode()
            code = "timeout"
        (folder / (label + ".log")).write_text(output)
        report["commands"].append({"label": label, "command": command, "exit": code})
        print(json.dumps({"label": label, "exit": code, "log": str((folder / (label + ".log")).relative_to(root))}), flush=True)
        if code != 0:
            print(output[-16000:], flush=True)
        return code == 0

    okay = args.skip_build or run("build", [args.swift, "build", "--package-path", str(package), "--build-tests", "--jobs", "1", *flags])
    binary = package / ".build/debug/SpatialPersistencePackageTests.xctest"
    helper = package / ".build/debug/spatialstorecheck"
    if okay:
        report["binarySHA256"] = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (binary, helper)}
        if not args.history_only:
            okay = run("xctest", [str(binary)])
    if okay and not args.history_only:
        tracer = "tests/persistence/continuation/trace_process_checks.py"
        original = run("draft-raw-process-death", [sys.executable, tracer, "tests/persistence/process_death.py", str(helper)])
        outbox = run("outbox-process-death", [sys.executable, tracer, "tests/persistence/continuation/process_death_outbox.py", str(helper)])
        recovery = run("recovery-copy-process-death", [sys.executable, tracer, "tests/persistence/continuation/process_death_recovery_copy.py", str(helper)])
        okay = original and outbox and recovery
    if okay:
        okay = run("history-cleanup-process-death", [sys.executable, "tests/persistence/continuation/trace_process_checks.py", "tests/persistence/continuation/process_death_history.py", str(helper)])
    report["inputsStableDuringRun"] = before == hashes()
    report["passed"] = okay and report["inputsStableDuringRun"]
    report["environment"] = {key: env[key] for key in ("SWIFT_USE_OLD_DRIVER", "SWIFT_BACKTRACE", "LD_LIBRARY_PATH") if key in env}
    (folder / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"passed": report["passed"], "inputsStable": report["inputsStableDuringRun"], "report": str((folder / "verification.json").relative_to(root))}), flush=True)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
