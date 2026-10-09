# AuxiliumOS
AuxiliumOS is the planned 20-module operating platform for Auxilium Environmental. Moldo remains an independently operated application with a controlled enterprise/management integration. Companion work is deferred.

The uploaded source contains a static UI shell, seven-table development migration, demo seed and static test harnesses. The continuation package adds working build controls, proposed specifications and a complete delivery register. It does not claim a finished or deployed OS.

Start with AGENTS.md, BUILD_STATE.json and `npm run os:status`. REQUIREMENTS.json preserves the full destination; BUILD_QUEUE.json sequences it; OWNER_DECISIONS.json tracks proposed business defaults. Detailed plans remain in docs/01-product. Current GitHub access and live deployments must be reconciled before treating this archive as current.

Node 24 (used for package verification and CI), or a compatible supported Node version is recommended for the control tools. The controls have no new dependency packages.

```sh
npm run os:check
npm run os:verify -- controls
npm run os:verify -- package-importer
npm run os:verify -- foundation-contract
npm run os:status
npm run os:checkpoint
```

The existing `npm run test:e2e` needs dependencies and a Playwright browser. Static shell tests do not establish production workflows. `npm run os:release-check` intentionally fails until full implementation, current runtime evidence, owner activation decisions and production authorization are recorded.

A saved checkpoint is a snapshot before its own commit. Verify Git status and the pushed branch separately. ChatGPT with the existing Lovable and Supabase projects is the primary continuation path; follow docs/08-ai/FULL_STACK_BUILD_PROTOCOL.md. Cursor is optional and must use the same repository/branch if used. Hosted setup observations are in docs/00-control/CONNECTED_SETUP_OBSERVATIONS.json.
