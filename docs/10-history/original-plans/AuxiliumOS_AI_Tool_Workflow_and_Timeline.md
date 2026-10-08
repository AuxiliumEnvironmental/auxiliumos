# AuxiliumOS AI Tool Workflow & Timeline

## Operating rule
AI can accelerate execution, but it must not own business rules, permissions, document release, scope authority, or professional judgment.

## Recommended tool roles
- Strategic reasoning/specs: ChatGPT / Claude / Gemini-style planning chats.
- Primary coding agent: Claude Code or OpenAI Codex.
- IDE: Cursor or VS Code with AI tools.
- Repo/CI: GitHub Issues, Pull Requests, GitHub Actions, branch protection.
- Testing: unit tests, integration tests, Playwright end-to-end tests.
- Security: OWASP ASVS, NIST SSDF, dependency scanning, secret scanning, permission tests.
- Backend candidate: Postgres-backed system with object-level authorization, such as Supabase RLS or equivalent.

## Golden workflow
1. Update durable docs.
2. Create one GitHub Issue per feature.
3. Start AI coding session with context packet plus one issue.
4. Require plan before code.
5. Implement on feature branch with tests.
6. Run tests and CI.
7. Human review against acceptance criteria.
8. Merge only after review.
9. Update decision log and handoff.

## Realistic timing
- Phase 0 logic foundation: 2–6 weeks.
- Internal prototype: 4–8 weeks after Phase 0.
- Basic PA client v1: 8–14 weeks after Phase 0.
- Scoping/ROM/authorization v1: 3–6 additional months.
- Asset/portfolio lite: 2–4 additional months.
- Enterprise MSA/site passport suite: 6–12 additional months after core stability.
- Full end-state: 12–24+ months.

## First 12 tickets
1. Repo structure and durable docs.
2. Glossary and object names.
3. PA v1 permissions matrix.
4. Document classes and release states.
5. State machines.
6. App shell/auth/database/tests/CI.
7. Account/user roles with permission tests.
8. Project list and detail page.
9. Document upload/release/download with audit.
10. Project-linked messages.
11. Simple project request and admin intake queue.
12. Export/backup/handoff process.
