# AI Tool Rules

## Purpose

This file defines how ChatGPT, Lovable, Cursor, Claude Code, Codex, GitHub Copilot, and future AI agents may work on AuxiliumOS.

The goal is to allow AI tools to move fast without breaking the source-of-truth structure, security model, document-control logic, scope-control logic, professional boundaries, or future-proof architecture.

---

## Permanent Rule

The GitHub repository is the source of truth.

AI tools are workers.

AI tools may:

- Propose
- Draft
- Summarize
- Refactor
- Build
- Test
- Review
- Flag risks
- Create pull requests when authorized

AI tools may not silently decide:

- Core architecture
- Business authority
- Legal/professional boundaries
- Scope approval
- Sampling strategy approval
- Document release authority
- Agreement/signature authority
- Financial/cap approval
- Production deployment
- Client-facing promises
- RLS/security exceptions

---

## Required Start-of-Session Behavior

Before any AI tool edits files, it must read or be given:

- AGENTS.md
- CLAUDE.md if using Claude Code
- docs/00-control/CURRENT_HANDOFF.md
- docs/00-control/PROJECT_STATE.md
- docs/00-control/NEXT_ACTIONS.md
- The relevant GitHub issue
- The allowed file list
- The required output format

The AI must first summarize:

- Current task
- Files expected to change
- What it must not change
- Risks or assumptions
- Tests or documentation expected

If it cannot determine those items, it must stop and ask.

---

## Required End-of-Session Closeout

Every AI/tool session must end with this closeout:

```markdown
# Session Closeout

Date:

Tool used:

Ticket(s):

Completed:

Files changed:

Database changes:

RLS changes:

Tests added:

Tests run:

Test results:

Assumptions made:

Decisions needed from founder:

Risks introduced:

Docs updated:

Next recommended ticket:
```

No AI/tool session is considered complete until the closeout exists.

---

## When to Update Repository Files

After a session, update the relevant repository files when needed.

Update:

- docs/00-control/PROJECT_STATE.md if project status changed
- docs/00-control/NEXT_ACTIONS.md if next steps changed
- docs/00-control/CURRENT_HANDOFF.md if the handoff snapshot changed
- docs/00-control/DECISION_LOG.md if a decision was made
- docs/00-control/OPEN_QUESTIONS.md if a new question appeared or was answered
- docs/00-control/RISK_REGISTER.md if a risk appeared
- docs/03-data/SCHEMA_REGISTRY.md if schema changed
- docs/04-security/ROLE_PERMISSION_MATRIX.md if roles or permissions changed
- docs/04-security/DOCUMENT_ACCESS_MATRIX.md if document rules changed
- docs/00-control/CHANGE_LOG.md if project history needs a record

This does not mean every file must be updated after every session.

It means the correct source-of-truth file must be updated when that type of information changed.

---

## Tool-Specific Rules

### ChatGPT

Use ChatGPT for:

- Strategy
- Architecture
- Logic review
- Edge-case analysis
- Ticket writing
- Decision support
- Documentation drafting

Do not use ChatGPT as the only place a decision lives.

If a decision is made, record it in the repository.

### GitHub

Use GitHub as:

- Source of truth
- Issue tracker
- Project board
- Pull request system
- Change history
- Agent instruction storage

Do not treat GitHub as a random file dump.

### GitHub Desktop

Use GitHub Desktop for:

- Branch creation
- Commit
- Push
- Pull
- Viewing changed files
- Beginner-friendly Git workflow

Do not commit:

- Secrets
- API keys
- Real client data
- PHI
- Service-role keys
- Unreviewed production settings

### Cursor

Use Cursor as:

- Code/editor cockpit
- Repository-reading tool
- AI-supervised editing tool
- File inspection tool

Do not accept large multi-module changes without review.

Cursor must be asked to summarize rules before editing.

### Lovable

Use Lovable for:

- UI shells
- Visual prototypes
- Controlled app surfaces
- Client/admin portal screens
- Fast front-end iteration

Lovable must not:

- Invent schema freely
- Invent permissions
- Invent document-release rules
- Invent scope logic
- Build the whole app in one prompt
- Connect to production Supabase during prep or visual shell work

Lovable should stop and ask if a requested feature requires new schema, RLS, document release, sampling, scope, agreement, or professional-boundary decisions.

### Supabase

Use Supabase for:

- Database
- Authentication
- Storage
- Edge functions
- RLS
- Future backend foundation

Supabase must not be used for production client data before:

- RLS is defined
- RLS is tested
- Roles are defined
- Document access is defined
- Audit events are designed

No service-role key may appear in browser/client code or AI chats.

### Claude Code

Use Claude Code as:

- Repo-aware coding worker
- Multi-file implementation assistant
- Test/refactor helper
- Documentation updater

Claude Code may edit files only when:

- A GitHub issue exists
- A branch exists
- Allowed files are defined
- It summarizes the plan first
- It provides session closeout

Claude Code may not make business/legal/professional decisions.

### Codex

Use Codex as:

- GitHub-connected coding worker
- Issue-based implementation agent
- Test/refactor assistant
- Pull request creator

Codex must follow AGENTS.md.

Codex may not:

- Change production
- Invent architecture
- Make legal/professional/business decisions
- Bypass tests
- Work outside issue scope

### Playwright

Use Playwright for:

- Browser workflow tests
- Login/access tests
- Document release tests
- Role-based denial tests
- Incident/request submission tests
- Chat-not-changing-scope tests

Do not treat Playwright as optional decoration.

It becomes critical once the app exists.

### GitHub Actions

Use GitHub Actions for:

- Automated checks
- Build/test gates
- CI
- Future deployment gates

Do not create fake CI that always passes.

No real merge confidence exists unless real checks run.

---

## Safe AI Task Pattern

Use this pattern when asking an AI tool to work:

```markdown
You are working on GitHub issue #__ only.

Read:
- AGENTS.md
- docs/00-control/CURRENT_HANDOFF.md
- docs/00-control/PROJECT_STATE.md
- docs/00-control/NEXT_ACTIONS.md
- The issue body

Allowed files:
-

Do not change files outside the allowed list.

Do not invent new core objects.

Do not alter RLS, document release, scope logic, permissions, agreements, sampling, or professional-boundary logic unless the issue specifically asks for it.

Before editing, summarize your plan and list expected files to change.

After editing, provide session closeout with:
- files changed
- tests run
- assumptions
- risks
- docs updated
- next recommended ticket
```

This pattern is a future copy/paste instruction for Cursor, Claude Code, Codex, or another AI agent.

---

## Decision Required Format

If an AI tool needs founder input, it must stop and create this:

```markdown
# Decision Required

Decision ID:

Area:

Question:

Options:

Recommendation:

Risk if wrong:

Founder decision:

Repo file to update after decision:
```

AI must not proceed past a required founder decision unless authorized.

---

## Final Rule

AI acceleration is allowed.

Uncontrolled AI authority is not allowed.

Every AI contribution must be traceable to:

- Source-of-truth docs
- GitHub issue
- Branch
- Pull request
- Tests or documented reason tests are deferred
- Session closeout
