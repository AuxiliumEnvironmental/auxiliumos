#!/usr/bin/env python3
"""Kill user-confirmed history retirement at ledger/file boundaries using synthetic stores."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    binary = Path(sys.argv[1]).resolve(strict=True)
    outcomes = []
    boundaries = ("historyBeforeMetadataCommit", "historyMetadataCommitted", "historyFileRemoved", "historyRemovalRecorded")
    for boundary in boundaries:
        with tempfile.TemporaryDirectory(prefix="spatial-history-death-") as directory:
            root = str(Path(directory) / "store")
            subprocess.run([str(binary), "seed-history", root], check=True, capture_output=True, text=True)
            initial = json.loads(subprocess.run([str(binary), "inspect-history", root], check=True, capture_output=True, text=True).stdout)
            killed = subprocess.run([str(binary), "cleanup-history", root, boundary], capture_output=True, text=True)
            assert killed.returncode == 86, (boundary, killed.returncode, killed.stderr)
            observed = json.loads(subprocess.run([str(binary), "inspect-history", root], check=True, capture_output=True, text=True).stdout)
            retired = 0 if boundary == "historyBeforeMetadataCommit" else 15
            assert observed["retired"] == retired, observed
            expected_pending = 14 if boundary == "historyRemovalRecorded" else retired
            assert observed["pending"] == expected_pending, observed
            removed = 1 if boundary in ("historyFileRemoved", "historyRemovalRecorded") else 0
            assert observed["artifactFiles"] == initial["artifactFiles"] - removed, observed
            for key in ("currentRevision", "currentLabel", "frozenSHA256", "publicationSHA256"):
                assert observed[key] == initial[key], (key, observed)
            assert observed["rawRetained"] and observed["receiptRetained"] and observed["exactPublication"], observed
            subprocess.run([str(binary), "resume-history", root], check=True, capture_output=True, text=True)
            resumed = json.loads(subprocess.run([str(binary), "inspect-history", root], check=True, capture_output=True, text=True).stdout)
            assert resumed["retired"] == 15 and resumed["pending"] == 0, resumed
            assert resumed["artifactFiles"] == initial["artifactFiles"] - 15, resumed
            for key in ("currentRevision", "currentLabel", "frozenSHA256", "publicationSHA256"):
                assert resumed[key] == initial[key], (key, resumed)
            assert resumed["rawRetained"] and resumed["receiptRetained"] and resumed["exactPublication"], resumed
            outcomes.append({"boundary": boundary, "processExit": killed.returncode, "reopened": observed, "resumed": resumed})
    print(json.dumps({"syntheticConfirmedHistoryCleanupProcessDeathChecks": outcomes, "passed": len(outcomes)}, indent=2))


if __name__ == "__main__":
    main()
