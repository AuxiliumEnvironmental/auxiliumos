# # Next Actions

Last updated: 2026-06-22

## Current Phase

Prep / AI Software Factory Setup

## Current Goal

Complete the repo control layer before installing or activating additional development tools.

The repository must be stable enough that ChatGPT, Cursor, Lovable, Claude Code, Codex, and future AI agents can read project rules and work from issues without relying on chat memory.

---

# Repo Foundation Review

## Review Status

Status: Complete

Reviewer: CJD

Founder: CJD

Branch: docs/repo-foundation-review

---

# Expected Top-Level Files and Folders

Confirmed these exist at the root of the repository:

- [x] [AGENTS.md](http://AGENTS.md)

- [x] [CLAUDE.md](http://CLAUDE.md)

- [x] [README.md](http://README.md)

- [x] [CHANGELOG.md](http://CHANGELOG.md)

- [x] .gitignore

- [x] .github/

- [x] .cursor/

- [x] app/

- [x] docs/

- [x] supabase/

- [x] tests/

---

# Expected GitHub Files

Confirmed these exist:

- [x] .github/PULL_REQUEST_[TEMPLATE.md](http://TEMPLATE.md)

- [x] .github/ISSUE_TEMPLATE/feature_[ticket.md](http://ticket.md)

- [x] .github/ISSUE_TEMPLATE/decision_[required.md](http://required.md)

- [x] .github/workflows/ci.yml

---

# Expected Cursor Rule Files

Confirmed these exist:

- [x] .cursor/rules/product.mdc

- [x] .cursor/rules/supabase.mdc

- [x] .cursor/rules/security.mdc

- [x] .cursor/rules/testing.mdc

- [x] .cursor/rules/document-control.mdc

---

# Expected Documentation Folders

Confirmed these exist:

- [x] docs/00-control/

- [x] docs/01-product/

- [x] docs/02-ontology/

- [x] docs/03-data/

- [x] docs/04-security/

- [x] docs/05-workflows/

- [x] docs/06-ui/

- [x] docs/07-testing/

- [x] docs/08-ai/

- [x] docs/09-release/

---

# Expected Supabase Folders

Confirmed these exist:

- [x] supabase/migrations/

- [x] supabase/functions/

- [x] supabase/seed/

- [x] supabase/tests/rls/

- [x] supabase/tests/database/

---

# Expected Test Folders

Confirmed these exist:

- [x] tests/e2e/

- [x] tests/integration/

- [x] tests/unit/

---

# Control Documents Completed

These source-of-truth control documents have been completed and merged:

- [x] PROJECT_[STATE.md](http://STATE.md) v1

- [x] DECISION_[LOG.md](http://LOG.md) v1

- [x] OPEN_[QUESTIONS.md](http://QUESTIONS.md) v1

- [x] DATA_[SPINE.md](http://SPINE.md) v1

- [x] MODULE_[MAP.md](http://MAP.md) v1

- [x] Session closeout habit v1

---

# Immediate Next Actions After Foundation Review

After this repo foundation review is complete, the next setup sequence is:

1. Install Node.js LTS.

2. Install Cursor.

3. Open the repo in Cursor.

4. Ask Cursor to summarize project rules without editing files.

5. Set up Lovable Project Knowledge.

6. Create Supabase dev project.

7. Document Supabase dev project existence without committing secrets.

8. Continue specification work before allowing AI tools to edit app/schema files.

---

# Do Not Start Yet

Do not start these yet:

- Full Lovable app build

- Supabase production project

- Supabase schema migrations

- Supabase storage buckets

- RLS policies

- Claude Code file edits

- Codex file edits

- Playwright installation

- GitHub Actions real CI setup

- Real client data

- Real PHI or healthcare patient data

- Production deployment

---

# Missing Items

## Missing files/folders

- None identified.

## Setup issues

- None identified.

## Risks

- Founder is still learning GitHub/project workflow.

- AI tools must not be allowed to work outside the repo/ticket/guardrail system.

- No real client data or secrets should enter the repo or AI tools.

---

# Current Next Work Item

After this issue is released:

Install Node.js LTS, then install/open Cursor and verify Cursor can read the repo rules without editing files.