#!/usr/bin/env python3
"""Bounded crash-diagnostic probe, not an acceptance test or automatic retry policy."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

binary = Path(sys.argv[1]).resolve(strict=True)
output = Path(__file__).resolve().parent / datetime.now(timezone.utc).strftime("runtime-diagnostic-%Y%m%dT%H%M%S%fZ")
output.mkdir()
environment = dict(os.environ, SWIFT_BACKTRACE="enable=yes,interactive=no,timeout=3,threads=all,registers=none,images=mentioned,sanitize=no", LIBDISPATCH_LOG="stderr")
commands = []
for attempt in range(12):
    with tempfile.TemporaryDirectory(prefix="spatial-runtime-diagnostic-") as temporary:
        command = [str(binary), "seed", str(Path(temporary) / "store")]
        try:
            result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=12)
            text, code = result.stdout + result.stderr, result.returncode
        except subprocess.TimeoutExpired as error:
            text = (error.stdout or b"").decode() + (error.stderr or b"").decode()
            code = "diagnostic-timeout"
        (output / f"seed-{attempt}.log").write_text(text)
        commands.append({"command": command, "exit": code, "log": f"seed-{attempt}.log"})
        if code != 0:
            print(text, flush=True)
            break
report = {"purpose": "Capture the first runtime crash with backtracing enabled; no failure is retried or relabeled passed.",
          "binarySHA256": hashlib.sha256(binary.read_bytes()).hexdigest(), "commands": commands,
          "SWIFT_BACKTRACE": environment["SWIFT_BACKTRACE"], "LIBDISPATCH_LOG": environment["LIBDISPATCH_LOG"]}
(output / "diagnostic.json").write_text(json.dumps(report, indent=2) + "\n")
print(str(output / "diagnostic.json"))
