#!/usr/bin/env python3
"""Generate synthetic geometry inputs, never device-capture evidence.

Run from repository root: python3 tests/geometry/generate_fixtures.py
The 37-degree asymmetric footprint has an independently computed area of 16
internal square units. No output labels that value as a verified measurement.
"""
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[2]
angle = math.radians(37)
local = [(0, 0), (5, 0), (5, 2), (2, 4), (0, 3)]
world = [(12 + x * math.cos(angle) - z * math.sin(angle),
          -3 + x * math.sin(angle) + z * math.cos(angle)) for x, z in local]
surfaces = []
for i, a in enumerate(world):
    b = world[(i + 1) % len(world)]
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    x, z = (b[0] - a[0]) / length, (b[1] - a[1]) / length
    surfaces.append({
        "id": f"wall-{i}", "kind": "wall",
        "transform": {"columnMajor": [x, 0, z, 0, 0, 1, 0, 0, -z, 0, x, 0, a[0], 6, a[1], 1]},
        "localCorners": [{"x": u, "y": v, "z": 0} for u, v in [(0, 0), (length, 0), (length, 2.7), (0, 2.7)]],
        "classificationConfidence": "unknown", "isCurved": False,
    })
capture = {
    "documentID": "synthetic-rotated-golden", "title": "Synthetic rotated asymmetric fixture",
    "floorID": "floor-golden", "floorLabel": "Synthetic level", "floorElevation": 6,
    "frameID": "synthetic-frame", "sourceArchiveID": "synthetic-source", "sdkVersion": "synthetic-1",
    "surfaces": surfaces,
    "rooms": [{"id": "room-golden", "label": "Asymmetric fixture", "wallIDs": [f"wall-{i}" for i in [3, 1, 4, 0, 2]]}],
}
expected = {"syntheticOnly": True, "signedAreaForAlgorithmCheckOnly": 5 * 4 - (3 * 2) / 2 - (2 * 1) / 2,
            "floorElevation": 6, "wallCount": 5, "roomCount": 1,
            "worldFootprint": [{"x": x, "z": z} for x, z in world]}
for name, value in [("rotated_asymmetric.capture.json", capture), ("rotated_asymmetric.expected.json", expected)]:
    (root / "fixtures" / "geometry" / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
