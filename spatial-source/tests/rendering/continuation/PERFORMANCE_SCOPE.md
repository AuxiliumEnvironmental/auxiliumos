# Operating-envelope execution scope

Source: `packages/SpatialCore/Tests/SpatialCoreTests/OperatingEnvelopeTests.swift`.
This is executable portable workload validation, not a native frame-rate benchmark.

| Input | Proposed engine profile | Extended 10x profile |
| --- | ---: | ---: |
| Explicit closed rooms | 100 | 1,000 |
| Physical wall objects | 1,000 | 10,000 |
| Hosted openings | 500 | 5,000 |
| Connected coordinate frames | One synthetic floor frame | One synthetic floor frame |
| Overlay markers | Not exercised | Not exercised |

The deterministic fixture is a connected grid of square rooms. Shared grid edges
are subdivided into four or five wall objects so the exact wall counts are real
canonical objects, not duplicated coincident walls. Adjacent rooms traverse each
shared boundary oppositely. Every other wall hosts one valid synthetic window,
door, or passage. No source file, sensor scan, business record or external service
is involved.

Checks include validation; exact counts; bounded valid scene indices and object
lineage; preserved revisions; navigation graph construction; an explicit safe room
placement; a swept move through an accepted shared portal; view-dependent cutaway;
and explicit navigation rejection of a separately validated 10,001-wall request
above its safety limit. No geometry is silently removed to make a workload pass.

The log records one elapsed-time observation per operation with the host monotonic
clock. It does not estimate p95, mobile latency, GPU time, memory, scan capacity or
field usability. There is deliberately no wall-time test assertion that could
change application acceptance when a shared test machine is busy.

The original targets in `docs/07_VERIFICATION.md` remain unchanged, including
2,000 overlay markers in the proposed profile, the extended 10x degradation probe,
100 ms local acknowledgment, 500 ms warm switching, baseline iPhone 15 Pro 60 Hz
target and 20-cycle retained-memory checks. The canonical model in this tested
slice has no overlay-marker type; that part of the workload is unproved, not
replaced by semantic areas. Apple/device profiling and actual marker-layer load
remain required before any corresponding acceptance claim.

Run from `packages/SpatialCore` with the recorded Swift 6.2.1 environment:

```sh
swift test --jobs 1 --filter OperatingEnvelopeTests
```

`operating-envelope.log` preserves the actual command's compiler and XCTest output.
Its `OPERATING_ENVELOPE_OBSERVATION` lines are machine-readable JSON observations,
not contractual performance claims. Relevant source/dependency changes invalidate
reuse in the same way as other test evidence.
