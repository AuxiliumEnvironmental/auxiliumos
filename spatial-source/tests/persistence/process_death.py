#!/usr/bin/env python3
"""Kill a real Swift process at each file/DB commit boundary and reopen.

Usage: python3 tests/persistence/process_death.py <path-to-spatialstorecheck>
Synthetic data, local temporary directories only. This is not an iOS lock test,
power-loss test, low-disk test, or physical-device acceptance.
"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    binary = Path(sys.argv[1]).resolve(strict=True)
    outcomes = []
    capture_outcomes = []
    boundaries = ("stagedFileSynced", "immutableFilePromoted", "beforeDatabaseCommit", "databaseCommitted")
    for boundary in boundaries:
        with tempfile.TemporaryDirectory(prefix="spatial-process-death-") as directory:
            root = str(Path(directory) / "store")
            subprocess.run([str(binary), "seed", root], check=True, capture_output=True, text=True)
            failed = subprocess.run([str(binary), "edit", root, boundary], capture_output=True, text=True)
            assert failed.returncode == 86, (boundary, failed.returncode, failed.stderr)
            reopened = subprocess.run([str(binary), "inspect", root], check=True, capture_output=True, text=True)
            observed = json.loads(reopened.stdout)
            committed = boundary == "databaseCommitted"
            assert observed["revision"] == (2 if committed else 1), observed
            assert observed["orphans"] == (0 if committed else 1), observed
            assert observed["rawPreserved"], observed
            assert observed["receiptPreserved"] is committed, observed
            assert observed["label"] == ("Persisted correction" if committed else "Assessment area"), observed
            outcomes.append({"boundary": boundary, "processExit": failed.returncode, **observed})
        with tempfile.TemporaryDirectory(prefix="spatial-capture-death-") as directory:
            root = str(Path(directory) / "store")
            subprocess.run([str(binary), "seed", root], check=True, capture_output=True, text=True)
            failed = subprocess.run([str(binary), "capture", root, boundary], capture_output=True, text=True)
            assert failed.returncode == 86, (boundary, failed.returncode, failed.stderr)
            recovered = subprocess.run([str(binary), "recover", root], check=True, capture_output=True, text=True)
            observed = json.loads(recovered.stdout)
            assert observed["recovered"] == (0 if boundary == "databaseCommitted" else 1), observed
            assert observed["draftCount"] == 1, "Raw recovery must not save an uncommitted draft"
            assert observed["verifiedPayload"], observed
            reprocessed = subprocess.run([str(binary), "reprocess", root], check=True, capture_output=True, text=True)
            assert json.loads(reprocessed.stdout)["reprocessedRevision"] == 1
            capture_outcomes.append({"boundary": boundary, **observed, "syntheticReprocessing": "passed"})
    print(json.dumps({"syntheticDraftProcessDeathChecks": outcomes,
                      "syntheticRawRecoveryChecks": capture_outcomes,
                      "passed": len(outcomes) + len(capture_outcomes)}, indent=2))


if __name__ == "__main__":
    main()
