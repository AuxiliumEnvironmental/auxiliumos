#!/usr/bin/env python3
"""Real-process exit at four outbox file/DB boundaries. Synthetic local data only.

This does not establish iOS lock, low-disk, background networking, or device acceptance.
Usage: python3 tests/persistence/continuation/process_death_outbox.py <spatialstorecheck>
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
        with tempfile.TemporaryDirectory(prefix="spatial-outbox-death-") as directory:
            root = str(Path(directory) / "store")
            subprocess.run([str(binary), "seed", root], check=True, capture_output=True, text=True)
            killed = subprocess.run([str(binary), "queue-publication", root, boundary], capture_output=True, text=True)
            assert killed.returncode == 86, (boundary, killed.returncode, killed.stderr)
            reopened = subprocess.run([str(binary), "inspect-publication", root], check=True, capture_output=True, text=True)
            state = json.loads(reopened.stdout)
            committed = boundary == "databaseCommitted"
            assert state["count"] == (1 if committed else 0), state
            assert state["verifiedBytes"] is committed, state
            assert state["orphans"] == (0 if committed else 1), state
            assert state["sourceRevision"] == 1 and not state["receiverConfirmed"], state
            outcomes.append({"boundary": boundary, "processExit": killed.returncode, **state})
    print(json.dumps({"syntheticOutboxProcessDeathChecks": outcomes, "passed": len(outcomes)}, indent=2))


if __name__ == "__main__":
    main()
