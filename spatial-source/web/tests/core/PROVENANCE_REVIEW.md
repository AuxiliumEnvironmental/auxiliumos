# Independent source-copy and export review

Reviewer: the geometry worker, independently from the data implementation author.
Input baseline: `f04a4e23c4d09e7358ade11864d7f1883cdbc083`, with the working-tree
source identified by the evidence file hashes. This is a read-only review of data
source, with synthetic IndexedDB namespaces and portable probes. The subsequent
core text-validator correction was implemented by this reviewer under the lead's
explicit ownership assignment; it is author testing, not an independent review.

## Findings and corrections

Two additional data defects were reproduced before correction:

| Finding | Earlier observed behavior | Verified correction |
| --- | --- | --- |
| Unicode copy reason budget | A 129-emoji reason exceeded a UTF-16-unit limit despite the 256-character contract. | The shared source-reason validator admits 256 Unicode code points and rejects 257. |
| Malformed copy reason | A lone surrogate could enter the saved source descriptor but then failed strict JSON import of that descriptor. | Copy creation, imported provenance and retained provenance reject both high and low unpaired surrogates. |

The data author corrected both through `validSourceReason`. Independent probes
exercise the 256/257 boundary and both malformed forms. Earlier data evidence is
preserved in `tests/data/generated/before-unicode-reason-fix/`. The seven preceding
data review findings and their separate resolution evidence remain unchanged in
`DATA_REVIEW.md` and `data-review-evidence.json`.

The same malformed-text inconsistency also existed in geometry titles and floor,
room and area labels. The lead authorized a focused shared validation change.
It now rejects unpaired surrogates without rewriting text or narrowing the
256-code-point limit. Six new tests in `unicode.test.ts` prove admission, exact
valid-Unicode JSON preservation, atomic edit failure, saved-draft reopening, and
actual geometry/exchange export followed by strict import. Scene/navigation
algorithms and schemas were not changed.

## Independent probes

Run from `web/`:

```
node --import tsx tests/core/provenance-review-probes.mjs
node --import tsx tests/core/data-review-probes.mjs
```

Nine new probe groups passed. They cover concurrent copy retries; independent
original/copy edits; exact retained source bytes; undo/redo, frozen restoration and
reopening; corrupted draft/immutable sidecar association; current-copy and original
source identity binding; missing or malformed paired archive members; unknown
permission fields; noncanonical source bytes; Unicode reason admission; ordinary
local 1.0/exchange compatibility; and every active PDF cross-reference offset
after removal of the generated catalog default action.

The probes consume the data worker's actual browser-produced all-floor ordinary
and copied archives and Unicode PDF. This reviewer independently validates those
bytes; it does not claim to have executed that browser workflow. All eight prior
data security probe groups also passed on the recorded current input snapshot.

The PDF correction is narrow: it requires exactly one known jsPDF 4.2.1 catalog
default and replaces its action with equal-length whitespace. Independent offset
checks verify every active cross-reference entry for a freshly generated normal
PDF and the saved browser Unicode PDF. Unknown catalog formats fail closed. The
existing PDF admission policy remains unchanged.

The local missing-glyph safeguard was inspected read-only. It compares rendered
characters with known missing-glyph references, waits for fonts, and cleans up
the canvas. It is a conservative diagnostic, not exhaustive proof of Unicode
font coverage. Recognized missing glyphs produce a visible export error; device
font behavior remains a separate acceptance responsibility.

## Evidence and limits

`evidence-unicode-and-provenance.json` retains the 98 passing core cases, strict
TypeScript compilation and 17 passing independent review probe groups, with
before/after input hashes and no drift during those runs. The data author then
removed one trailing blank line from `imports.ts` and regenerated the copied
browser archive and Unicode PDF. The final review rerun against those exact later
inputs is captured separately in `provenance-review-evidence.json`. It again
passed all 17 independent probe groups with no input drift during execution.

No unresolved source-association defect was found in this review. A hash binds
bytes; it does not authorize publication. These tests establish portable behavior
only. They do not establish Apple compilation, physical capture or recovery,
touch usability, live integration or release. The core review is not independent
of its author. The data review is independent of its implementation author.
