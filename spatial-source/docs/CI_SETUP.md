# CI setup without hidden deployment

Use `bash tools/verify.sh` as the portable CI job after checking out the actual
repository and installing a recorded Swift toolchain plus the pinned Python
verification requirements. Pin any selected CI action versions to reviewed commit
SHAs. No CI service, GitHub workflow, signing secret or cloud integration was
installed by this package.

The native agent adds a separate actual Xcode build/test job after creating the
real app target. Do not label portable Linux Swift compilation as an Apple build.
Device capture tests remain physical-device acceptance. Restrict credentials and
signing material to the authorized native pipeline; never put them in source.

Source/dependency/configuration/fixture changes invalidate the relevant recorded
evidence. The full release job is separate from iterative targeted checks.
