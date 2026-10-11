# Recoverable copy provenance

Local document profile `auxilium-spatial-local-document/1.1.0` is an additive
backup profile for a draft explicitly saved as a separate copy. The canonical
geometry and old local document/exchange profiles are unchanged. Ordinary drafts
still write local document `1.0.0`. A reader supporting only `1.0.0` must reject
`1.1.0`, never silently discard its source association.

The manifest keeps the existing top-level and floor records. It additionally
requires exactly one `source/geometry.json` and one `source/identity.json` in its
hashed member list, both `application/json` without a floor ID or page index.
The two entries count toward the existing 4,095-member, 64 MiB archive and 32 MiB
member limits. No external paths or references are allowed.

`source/geometry.json` contains the original canonical geometry bytes, before
the explicit copy receives a new document ID and revision 1. Its geometry IDs,
provenance and source revision are retained. It is not an Apple raw capture;
the protected native capture vault remains the original Apple source store.

`source/identity.json` has exactly these fields:

```json
{
  "profileVersion": "auxilium-spatial-source-provenance/1.0.0",
  "documentID": "copy-document-id",
  "revision": 3,
  "sourceIdentity": {
    "documentID": "original-document-id",
    "revision": 7,
    "sha256": "<64 lowercase hexadecimal characters>",
    "reason": "explicit-import-copy"
  }
}
```

Readers validate the outer document ID/revision against the exported frozen
geometry and the source ID/revision against the parsed original bytes. The IDs
must differ. The source hash must match the exact canonical source bytes, in
addition to every manifest member hash and length check. The source graph must
pass the existing strict geometry validation. Reasons must be nonblank, at most
256 characters and free of control characters. Unknown properties are rejected.

Import returns the geometry and paired source identity/bytes together for an
atomic durable write. Export freezes and validates that same association.
Edits, undo/redo, restoration, and reopen retain the original source association.
Import cannot replace a corrected draft automatically. Creating a copy of a copy
retains its original source association; retry deduplication is a private local
input identity, never publication authority.

Hashes establish byte identity only. This profile grants no OS project access,
publication authority or audience expansion. Live publication remains disabled.
