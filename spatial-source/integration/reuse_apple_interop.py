#!/usr/bin/env python3
"""Reuse one real passing run only when its relevant inputs/runtime still match."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
record = json.loads((root / 'integration/apple-interop-evidence.json').read_text())
reasons = []
for name, expected in record['inputFiles'].items():
    path = root / name
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        reasons.append(name)
for command, expected in [(['xcodebuild', '-version'], record['xcode']),
                          (['sw_vers', '-buildVersion'], record['macOSBuild'])]:
    try:
        if subprocess.check_output(command, text=True).strip() != expected:
            reasons.append(command[0])
    except (OSError, subprocess.CalledProcessError):
        reasons.append(command[0])
try:
    if subprocess.check_output(['swift', '--version'], text=True).splitlines()[0] != record['swiftFirstLine']:
        reasons.append('swift')
except (OSError, subprocess.CalledProcessError):
    reasons.append('swift')
if os.environ.get('ImageVersion') != record['runnerImageVersion']:
    reasons.append('runner image')
if reasons:
    print('Evidence invalidated; run Apple tests:', ', '.join(reasons))
    sys.exit(1)
print(f"Reused {record['tests']} passing Apple tests from {record['runURL']}; input hashes and runtime match.")
