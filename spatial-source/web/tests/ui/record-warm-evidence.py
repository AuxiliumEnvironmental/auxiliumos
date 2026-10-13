#!/usr/bin/env python3
"""Run the lifecycle-affected UI suite once and bind evidence to exact inputs."""
import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[2]
os.chdir(root)
output = root / "tests/ui/artifacts/warm-switch"
output.mkdir(parents=True, exist_ok=True)
prefix = os.environ.get("SPATIAL_EVIDENCE_PREFIX", "")
if prefix and not all(character.isalnum() or character == "-" for character in prefix):
    raise ValueError("Evidence prefix must contain only letters, numbers or hyphens")
prefix = prefix + "-" if prefix else ""


def hashes():
    paths = set()
    for pattern in ["src/**/*.ts", "src/**/*.tsx", "src/**/*.css", "tests/ui/*.ts",
                    "tests/ui/*.tsx", "tests/ui/*.html", "tests/ui/*.py"]:
        paths.update(root.glob(pattern))
    for name in ["package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "index.html"]:
        paths.add(root / name)
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(paths)}


before = hashes()
(output / (prefix + "inputs-before.json")).write_text(json.dumps(before, indent=2) + "\n")
executable = root / "tests/ui/.browser-runtime/chromium"
environment = dict(os.environ, SPATIAL_BROWSER_EXECUTABLE=str(executable))
command = ["npx", "playwright", "test", "--config", "tests/ui/warm-switch.config.ts", *sys.argv[1:]]
record = {
    "start": datetime.now(timezone.utc).isoformat(),
    "inputGitRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "workingTreeAtStart": subprocess.check_output(["git", "status", "--short"], text=True).splitlines(),
    "platform": platform.platform(),
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "browserExecutableSHA256": hashlib.sha256(executable.read_bytes()).hexdigest(),
    "command": command,
    "environmentOverride": {"SPATIAL_BROWSER_EXECUTABLE": str(executable)},
}
with (output / (prefix + "FINAL_UI.log")).open("w") as log:
    run = subprocess.run(command, env=environment, stdout=log, stderr=subprocess.STDOUT)
after = hashes()
(output / (prefix + "inputs-after.json")).write_text(json.dumps(after, indent=2) + "\n")
record.update({"completed": datetime.now(timezone.utc).isoformat(), "exitCode": run.returncode,
               "changedInputsDuringRun": [name for name in set(before) | set(after)
                                          if before.get(name) != after.get(name)]})
(output / (prefix + "run-context.json")).write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({"exitCode": run.returncode, "changedInputs": record["changedInputsDuringRun"]}))
raise SystemExit(run.returncode)
