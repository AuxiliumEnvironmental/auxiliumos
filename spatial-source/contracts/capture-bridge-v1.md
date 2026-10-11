# Native bridges 1.0.0

The installed app accepts bridge calls only from its bundled
`capacitor://localhost` workspace. Remote navigation/server URLs are disabled.
Browser wrappers fail closed outside native iOS. No method accepts credentials,
arbitrary paths, script, external endpoints or business-record writes.

AuxiliumCapture.capabilities({bridgeVersion:'1.0.0'}) returns the same version,
available:boolean and optional reason. Availability does not claim permission
already granted or physical acceptance.

AuxiliumCapture.capture({bridgeVersion:'1.0.0'}) presents guided native capture,
returning {bridgeVersion:'1.0.0',document,nativeSourceRetained:true} only after
the exact canonical document has been durably saved and reopened. Cancellation,
denial, storage failure, incompatible bridge and failed alignment reject without
synthetic replacement. Completed rooms can return revision greater than one.
The web consumer validates geometry and never overwrites an edited existing ID.
Native raw captures/world maps remain protected and are excluded from exports.

AuxiliumFiles.saveExport({bridgeVersion:'1.0.0',filename,mimeType,base64}) opens an
explicit native share sheet for an exact frozen artifact. Maximum decoded size
is 32 MiB. Only JSON, ZIP, SVG, GLB, PDF and PNG are admitted. Filename must be a
basename, never a path. Protected temporary files are cleaned on completion or
interruption. Result {bridgeVersion:'1.0.0',completed:boolean} distinguishes
cancellation. There is no automatic upload or inferred permission to publish.
