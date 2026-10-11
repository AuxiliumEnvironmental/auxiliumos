#!/usr/bin/env python3
"""Add per-process observability without changing the original probes or expectations."""
import json
from pathlib import Path
import runpy
import subprocess
import sys

script = Path(sys.argv[1]).resolve(strict=True)
binary = Path(sys.argv[2]).resolve(strict=True)
original_run = subprocess.run


def traced_run(command, *args, **kwargs):
    print("PROCESS_START " + json.dumps(command), file=sys.stderr, flush=True)
    kwargs.setdefault("timeout", 20)
    try:
        result = original_run(command, *args, **kwargs)
    except subprocess.CalledProcessError as error:
        print("PROCESS_FAILED " + json.dumps({"command": command, "exit": error.returncode}), file=sys.stderr, flush=True)
        if error.stderr:
            print(error.stderr, file=sys.stderr, flush=True)
        raise
    except subprocess.TimeoutExpired:
        print("PROCESS_TIMEOUT " + json.dumps(command), file=sys.stderr, flush=True)
        raise
    print("PROCESS_EXIT " + json.dumps({"command": command, "exit": result.returncode}), file=sys.stderr, flush=True)
    if result.returncode < 0 and result.stderr:
        print(result.stderr, file=sys.stderr, flush=True)
    return result


subprocess.run = traced_run
sys.argv = [str(script), str(binary)]
runpy.run_path(str(script), run_name="__main__")
