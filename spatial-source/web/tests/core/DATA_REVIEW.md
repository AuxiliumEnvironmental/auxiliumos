# Independent data-layer review

Reviewer: the shared geometry worker, not the data implementation author.
Scope: read-only review of `web/src/data/` and synthetic in-memory probes using
fake-indexeddb. No live connections, production records, account changes or
physical-device tests occurred. The data worker owns fixes and regression tests.

These findings were reproduced on October 9, 2026 and reported to the lead and
data worker. They are historical failure evidence; source may subsequently be
fixed. Check the data worker's regression evidence for resolution.

| Finding | Observed result | Required invariant |
| --- | --- | --- |
| Saved revision identity | A valid B snapshot stored under A's revision row was returned by `loadFrozen(A)`; restoring it wrote B under A's draft key and then broke reopening. | Bind saved-row key, document ID and revision to its validated frozen content and requested identity. |
| Durable freeze acknowledgment | Corrupting the retained frozen bytes left `freeze` reporting success while a following `loadFrozen` rejected them. | Validate the bytes actually retained before acknowledging an immutable saved revision. |
| DEFLATE consumption | Inserting `JUNK` after a member's final DEFLATE block and adjusting compressed sizes/directory offset was accepted. | Match the existing native `Z_STREAM_END`, exact input consumption and exact output-size checks. |
| Existing SVG compatibility | Both preserved `tests/exports/continuation/fixtures/floorplan-*.svg` files were rejected. | Admit the existing bounded local drawing vocabulary, including semantic attributes, circles and text/tspan nesting, without admitting active resources. |
| Encoded PDF names | A local archive with `/J#53 (payload)` in its PDF was accepted. | Decode PDF name escapes and retain the existing native forbidden action, attachment, encryption and object-stream vocabulary. |
| PNG header profile | A CRC-valid PNG header with bit depth 0 and color/compression/filter/interlace 99 was accepted. | Retain native profile checks and the existing 16-million-pixel cap; do not widen to 32 million. |
| Outbox source association | A queued A request with a valid B archive and updated archive/manifest hashes authorized A and uploaded B. | Bind archive manifest identity and geometry bytes to the frozen source before any transport call. |

The PDF/PNG findings concern admission compatibility. Received derivatives are
not rendered, so no code-execution exploit was observed or claimed. The outbox
probe concerns consistency under stored-record misassociation; byte hashes do
not establish publication authority.

## Resolution verification

The data worker implemented the fixes. This reviewer subsequently inspected the
changes and independently ran `node --import tsx tests/core/data-review-probes.mjs`
from `web/`: eight probe groups passed, covering all seven original failures plus
ordinary multi-chunk DEFLATE compatibility at three compression levels. The
original corrupt-row restore no longer changes the draft; outbox misassociation
is rejected before authorization or upload. Actual preserved native SVG fixtures
now pass in their drawing profile while remaining rejected in the older exchange
profile. Input hashes are recorded in `data-review-evidence.json`.

The fflate exact-consumption adapter intentionally depends on internal state in
the pinned 0.8.3 package because its public streaming API omits consumed-input
counts. It fails closed if the shape changes. Dependency upgrades must rerun the
ordinary-stream and trailing-stream probes. This is a maintenance constraint,
not an unresolved observed failure.
