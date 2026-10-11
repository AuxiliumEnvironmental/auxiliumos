# Maintained workspace, existing OS host

Current owner direction: preserve the OS Spatial selection UI and finish the
independent application before later full-workspace integration. Do not refresh
the old embedded editor as the primary delivery destination. The following
embedding mechanism remains preserved for that later reviewed integration.

The generated ES module from `npm --prefix web run build:library` embeds the full
SpatialWorkspace into the existing OS React application. Source remains maintained
in this repository. The generated module and its SHA256 provenance are refreshed
by `python3 integration/package_os.py PATH_TO_OS_CHECKOUT`. Do not independently
edit generated artifacts or replace the host application with a Spatial preview.

The current OS source at 797c9c99c339e5e7bec18efe814b5e57127b074a explicitly marks
authorized project reads as unconnected in its Projects module. Project requests
are distinct and are not substituted for authorized projects. The development
route can expose the complete editor for profile-scoped synthetic personal work;
project-linked use fails closed until an authorized project adapter exists.
No migration or new database is created to conceal that missing dependency.

`WorkspaceContext` has distinct standalone, authenticated personal and verified
project scopes. The OS adapter supplies current profile authority and must
recheck at entry, visibility return, mutation and export. Project scope requires
account and project identities from a current permitted server lookup. Hashes
identify exact bytes; they do not convey audience or publication authority.

The standalone browser app and Capacitor assets use the same source. Synthetic
development and local drafts do not publish files into OS or Moldo records.
Native capture and live publication are not made available by hosting this page.

## Independent delivery

The owner selected `spatialauxilium.io`. `package_standalone.py` builds the actual
maintained browser workspace from a fixed committed snapshot, separately from
the OS host. See `STANDALONE_DELIVERY.md`. This prepares source and serving bytes;
it does not change DNS, create a cloud resource, or establish authentication.

Exact current host separation evidence and a selective source recovery archive
are in `../evidence/os-separation-2026-10-10/`. They preserve the observed router,
selector, adapter and generated assets at OS commit
`8d59d22271287d7e1185fc3a65b1cfd548c4e82a`. The separate native CI branch is retained;
its build workflow now also exists in this canonical source with standalone
paths and a manual trigger. No remote source was deleted or published.
