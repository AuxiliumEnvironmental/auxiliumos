# Independent review probes

These regression and cross-package checks were authored and executed by the separate QA worker after reviewing product code owned by the geometry, persistence, native, and interop workers. The QA worker did not implement the reviewed product fixes.

From the repository root:

```sh
SPATIAL_REVIEW_OUTPUT=/tmp/spatial-review swift run --package-path tests/review --jobs 1 ReviewProbes
python3 tests/review/inspect_exports.py /tmp/spatial-review
```

The recorded Linux execution uses `SWIFT_USE_OLD_DRIVER=1` because the new Swift driver encountered restricted `/proc` access in this environment. This is portable code evidence, not an Apple compile, RoomPlan capture, RealityKit visual review, physical-device recovery, or performance benchmark.

The Python reader independently inspects ZIP member hashes/lengths and GLB binary layout. It verifies triangle intersections with the synthetic door and window interiors, plus known synthetic face areas. Those fixture calculations make no measurement or surveying claim about captured property.

`evidence/reviews/independent-review.json` records findings, review hashes, actual checks and unresolved acceptance gates.
