#!/usr/bin/env python3
"""Kill explicit orphan-copy recovery at file/DB boundaries; retain original source.

Synthetic Linux process evidence only, not a physical-device recovery claim.
"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    binary = Path(sys.argv[1]).resolve(strict=True)
    outcomes = []
    for boundary in ("stagedFileSynced", "immutableFilePromoted", "beforeDatabaseCommit", "databaseCommitted"):
        with tempfile.TemporaryDirectory(prefix="spatial-recovery-copy-death-") as directory:
            root = str(Path(directory) / "store")
            subprocess.run([str(binary), "seed", root], check=True, capture_output=True, text=True)
            orphan = subprocess.run([str(binary), "edit", root, "beforeDatabaseCommit"], capture_output=True, text=True)
            assert orphan.returncode == 86, (orphan.returncode, orphan.stderr)
            killed = subprocess.run([str(binary), "recover-draft-copy", root, boundary], capture_output=True, text=True)
            assert killed.returncode == 86, (boundary, killed.returncode, killed.stderr)
            inspection = subprocess.run([str(binary), "inspect-draft-copy", root], check=True, capture_output=True, text=True)
            state = json.loads(inspection.stdout)
            committed = boundary == "databaseCommitted"
            assert state["drafts"] == (2 if committed else 1), state
            assert state["copyValid"] is committed and state["sourceRetained"] is committed, state
            assert state["originalUnchanged"] and state["originalRevision"] == 1, state
            subprocess.run([str(binary), "recover-draft-copy", root], check=True, capture_output=True, text=True)
            retry = subprocess.run([str(binary), "inspect-draft-copy", root], check=True, capture_output=True, text=True)
            recovered = json.loads(retry.stdout)
            assert recovered["copyValid"] and recovered["sourceRetained"] and recovered["drafts"] == 2, recovered
            outcomes.append({"boundary": boundary, "processExit": killed.returncode, "reopened": state, "retry": recovered})
    print(json.dumps({"syntheticRecoveredDraftProcessDeathChecks": outcomes, "passed": len(outcomes)}, indent=2))


if __name__ == "__main__":
    main()
