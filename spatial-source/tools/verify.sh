#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
SPATIAL_PYTHON=${SPATIAL_PYTHON:-python3}
SPATIAL_SWIFT=${SPATIAL_SWIFT:-swift}
SPATIAL_SWIFT_JOBS=${SPATIAL_SWIFT_JOBS:-2}
"$SPATIAL_PYTHON" tools/check_controls.py
"$SPATIAL_PYTHON" -m unittest discover -s tools -p 'test_*.py' -v
for package in SpatialCore CaptureKit SpatialPersistence SpatialInterop; do
    "$SPATIAL_SWIFT" test --package-path "packages/$package" --jobs "$SPATIAL_SWIFT_JOBS"
done
"$SPATIAL_SWIFT" test --package-path tests/WorkflowIntegration --jobs "$SPATIAL_SWIFT_JOBS"
"$SPATIAL_SWIFT" run --package-path packages/SpatialCore --jobs "$SPATIAL_SWIFT_JOBS" spatialcheck validate fixtures/geometry.json
"$SPATIAL_PYTHON" tools/validate_package.py fixtures/synthetic_exchange.zip
printf '%s\n' 'Portable package checks passed. Native iOS, physical capture and live integration remain separate gates.'
