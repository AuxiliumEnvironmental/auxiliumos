# AuxiliumOS Beginner Tool Setup Manual

Exact tool-by-tool steps for setting up the AI software factory, repo continuity system, Supabase foundation, Lovable workflow, and agent operating rules.

Prepared for AuxiliumOS. Verified against current official docs on 2026-06-21.

## Read this first
This manual is not another architecture document. It is the practical operating guide for executing the checklist inside real tools. It assumes you are brand new to GitHub, Supabase, Lovable, Cursor, Claude Code, Codex, Playwright, and CI/CD. It explains what to click, what to name things, what not to touch, and why each step matters.

## Permanent rule
The repository is the project brain. ChatGPT, Lovable, Claude Code, Codex, and Cursor are workers that must read from the repository. They do not become the source of truth. If a decision, rule, schema change, workflow, or assumption is not captured in the repository, it does not count.

## Controlling AuxiliumOS framework
Everything below serves the same final product: a modular AuxiliumOS suite with one data spine. The platform must support simple project/document clients and a Nutex-style enterprise MSA client with facilities, site passports, incident workflows, document control, vendor coordination, authorization logic, executive dashboards, and future-proof service scoping.

### Non-negotiable guardrails
- No secrets in GitHub, ChatGPT, Lovable, or screenshots.
- No production data during setup.
- No AI-created architecture without approval.
- No direct production edits.

## Part 1 — The plain-English map of every tool

You do not need to become a software engineer before starting. You do need to understand what each tool is responsible for so you do not let one tool do the wrong job.

| Tool | What it is | Your plain-English understanding | What it must never become |
| --- | --- | --- | --- |
| ChatGPT Project | Planning and reasoning workspace | The strategy room where you ask architecture, workflow, and decision questions. | The only memory of the project. |
| GitHub | Permanent code/document repository | The project brain. It stores files, decisions, issues, pull requests, history, and working instructions. | A random backup folder you rarely update. |
| GitHub Desktop | Beginner-friendly Git app | A visual way to copy files to/from GitHub without learning terminal commands first. | A substitute for review discipline. |
| Cursor | AI code editor | Your cockpit for opening the repo, reading files, asking code questions, and supervising changes. | The place where agents freely rewrite the whole app. |
| Lovable | AI app/UI builder | Fast way to build the portal/admin UI and connect to Supabase. | The tool that invents business logic or security rules. |
| Supabase | Backend platform | Database, authentication, storage, serverless functions, and security policies. | A place to casually create tables without documentation. |
| Claude Code | Repo-aware coding agent | A strong coding worker that reads project files, edits code, runs commands, and follows CLAUDE.md. | An unsupervised production engineer. |
| Codex | OpenAI coding agent | A worker that can operate through Codex web/cloud or CLI and make code changes/PRs from GitHub tasks. | A business decision-maker. |
| Playwright | End-to-end browser testing | A robot tester that clicks through the app like users and confirms workflows work. | Optional decoration; for this project it becomes critical. |
| GitHub Actions | Automation/CI system | The automated gate that runs tests before changes are merged. | A thing to postpone forever. |

## Part 2 — What you should create before touching any app code

The prep goal is to create a controlled AI software factory. The output of prep is not the app. The output of prep is a system where AI tools can safely build the app without losing the plot.

- [ ] A private GitHub repository named auxiliumos exists.
- [ ] The starter repo skeleton is committed to GitHub.
- [ ] A ChatGPT Project exists for AuxiliumOS Product Command.
- [ ] GitHub Desktop is installed and connected to your repo.
- [ ] Cursor is installed and can open the repo folder.
- [ ] Lovable project knowledge is configured but Lovable is not allowed to invent schema freely.
- [ ] Supabase dev project exists; staging/prod are planned but not used casually.
- [ ] Decision log, project state, open questions, risk register, schema registry, role matrix, and document matrix are present in the repo.
- [ ] GitHub Issues and Project board are ready.
- [ ] You understand the session closeout process.

## Part 3 — Account setup order

Create accounts in this order so each later tool can connect to the earlier one. Use a password manager and multi-factor authentication wherever available.

1. Create or confirm your ChatGPT account and start a dedicated AuxiliumOS Project.
2. Create a GitHub account.
3. Install GitHub Desktop and sign in with GitHub.
4. Create a Supabase account using the same business email if possible.
5. Create a Lovable account and connect GitHub later.
6. Install Cursor and sign in.
7. Create or confirm Claude/Anthropic access for Claude Code later.
8. Confirm Codex access through your OpenAI account later.
9. Install Node.js LTS before using local developer commands.
10. Install Docker Desktop only when you are ready for local Supabase development.

Why this order matters: GitHub is the center. Lovable, Codex, Claude Code, Cursor, and Supabase integrations all benefit from a repo that already exists. Do not begin with scattered AI sessions that produce files in different places.

## Part 4 — Create your local folder system on your computer

### What this does

This gives your computer a clean home for the project, downloads, backups, exports, and non-repo notes. GitHub stores the official project files; this local folder gives you a simple place to work and back up.

### Exact steps

1. Open File Explorer on Windows or Finder on Mac.
2. Go to a place you control, such as Documents.
3. Create a folder named AuxiliumOS.
4. Inside it, create these folders: 00_GitHub_Repo, 01_Downloaded_Packets, 02_Backups, 03_Exports, 04_No_Upload_Client_Data, 05_Screenshots_For_Review.
5. Move the starter ZIP files I gave you into 01_Downloaded_Packets.
6. Do not put API keys, passwords, or real client data in the repo folder.

### Folder meaning

| Folder | Use |
| --- | --- |
| 00_GitHub_Repo | This is where GitHub Desktop will clone your actual auxiliumos repository. |
| 01_Downloaded_Packets | Keep the manuals, skeleton ZIPs, and planning files you download. |
| 02_Backups | Periodic copies of exported docs or repository ZIPs. |
| 03_Exports | Supabase exports, PDF exports, release packages, non-sensitive outputs. |
| 04_No_Upload_Client_Data | Real client/sensitive data that should not go to AI tools until governance is ready. |
| 05_Screenshots_For_Review | Screenshots for explaining bugs or UI issues. |

## Part 5 — Set up the ChatGPT Project

### What this does

A ChatGPT Project keeps strategy chats, uploaded reference files, and custom instructions together. OpenAI describes Projects as workspaces for grouping chats, files, and instructions so ChatGPT stays on-topic for long-running work.

### Exact steps in ChatGPT

1. Open ChatGPT.
2. In the left sidebar, click New project.
3. Name it AuxiliumOS Product Command.
4. Choose a color/icon so it is easy to identify.
5. Open the project settings or instructions area.
6. Paste the instruction block below.
7. Upload the current master files: Master Map, Founder Homework Workbook, AI Context Packet, Project Status Ledger, Prep-to-Fly Checklist, this Tool Setup Manual, and any future current repo docs exported from GitHub.
8. Do not upload API keys, Supabase service-role keys, passwords, or unredacted client-sensitive documents.

### Project instruction block to paste

```
You are assisting with AuxiliumOS, a modular operating suite for Auxilium Environmental. The repository, not chat memory, is the source of truth. Follow the canonical data spine: Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks -> Deliverables -> Documents -> Communications -> Financial Records -> Reports -> Audit Events.

Do not invent new core objects, roles, permissions, document states, scope workflows, sampling logic, agreement logic, or professional boundaries without flagging the decision. AI may propose, draft, review, and test; it may not silently decide business authority.

When helping with implementation, ask what repo file or ticket controls the work. When giving outputs, include assumptions, risks, decisions needed, and the exact repo file that should be updated.
```

### How to use this Project

- [ ] Use this ChatGPT Project for architecture, decisions, workflow reasoning, ticket creation, and reviewing AI outputs.
- [ ] Do not use this Project as the only place a decision lives. After a decision is made, copy it into DECISION_LOG.md or the relevant repo doc.
- [ ] At the start of major chats, paste the current PROJECT_STATE.md and NEXT_ACTIONS.md from GitHub if they changed since your last upload.

## Part 6 — Create the private GitHub repository

### What this does

GitHub is the permanent source of truth. It stores files, history, issues, pull requests, workflows, and agent instructions. GitHub’s official docs say you can create a new repository from the web UI by clicking New repository, choosing an owner, naming it, choosing visibility, and creating it.

### Exact steps in GitHub browser

1. Go to GitHub and sign in.
2. Click the plus + icon in the upper-right corner.
3. Click New repository.
4. Repository name: auxiliumos.
5. Description: AuxiliumOS operating suite, data spine, client portal, and AI software factory.
6. Visibility: Private.
7. Do not select a README, .gitignore, or license if you are going to upload the starter skeleton, because the skeleton already contains starter files.
8. Click Create repository.

### Why private matters

This project will eventually include architecture, service logic, workflow assumptions, client structure, and business-sensitive information. It should not be public.

### Do not upload files through the browser if you can avoid it

GitHub allows browser uploads, but for this project GitHub Desktop is easier and safer for folders. GitHub’s own docs note browser upload limits and that GitHub Desktop can move changes to branches and commit them.

## Part 7 — Install and connect GitHub Desktop

### What this does

GitHub Desktop is the easiest beginner way to work with GitHub. GitHub describes it as a GUI for cloning repositories, pushing, pulling, committing, and creating pull requests without using command-line Git.

### Exact steps

1. Download GitHub Desktop from the official GitHub Desktop site.
2. Install it like a normal app.
3. Open GitHub Desktop.
4. Click Sign in to GitHub.com.
5. Complete the browser login/authorization.
6. In GitHub Desktop, click File -> Clone repository.
7. Select your auxiliumos repo.
8. For local path, choose the folder AuxiliumOS/00_GitHub_Repo that you created earlier.
9. Click Clone.

### What clone means

Clone means GitHub copies the repository from the cloud to your computer. Changes on your computer are local until you commit and push them back to GitHub.

## Part 8 — Put the starter skeleton into GitHub

### What this does

The starter skeleton creates the permanent project filing system: AGENTS.md, CLAUDE.md, docs folders, Cursor rules, GitHub templates, Supabase folders, app folders, and test folders.

### Exact steps

1. Find the AuxiliumOS_Starter_Repo_Skeleton.zip file.
2. Right-click it and unzip/extract it.
3. Open the extracted folder.
4. Select everything inside the extracted folder, not the folder itself.
5. Copy those files/folders.
6. Open your cloned local repo folder inside AuxiliumOS/00_GitHub_Repo/auxiliumos.
7. Paste the starter files/folders into the repo folder.
8. Open GitHub Desktop. It should show a list of changed files.
9. In the Summary box, type: Initial AuxiliumOS control repo skeleton.
10. Click Commit to main.
11. Click Push origin.

### Verify it worked

- [ ] Open GitHub in your browser.
- [ ] Open the auxiliumos repository.
- [ ] Confirm you can see AGENTS.md, CLAUDE.md, README.md, docs/, supabase/, app/, tests/, .github/, and .cursor/.

## Part 9 — Understand commit, push, branch, issue, pull request

| Term | Simple meaning | How you use it |
| --- | --- | --- |
| Commit | A saved checkpoint of changes | Every meaningful edit gets a short commit message. |
| Push | Send local commits to GitHub cloud | After committing in GitHub Desktop, click Push origin. |
| Branch | A separate workspace for a change | Use branches for features so main stays stable. |
| Issue | A work ticket or task | Every AI/build task should be an issue. |
| Pull request | A review request to merge a branch into main | AI or you opens a PR; tests/review happen before merge. |
| Main branch | The official stable line of the repo | Do not casually change main once build work starts. |

Beginner rule: commit small, explain what changed, push often, and use issues/pull requests once real development starts.

## Part 10 — Set up GitHub repository basics

### Exact steps: enable issues and settings

1. Open your GitHub repository in the browser.
2. Click Settings.
3. Under General, confirm repository visibility is Private.
4. Under Features, confirm Issues is enabled.
5. Leave Wiki off unless you have a reason to use it; your docs folder is the project wiki.
6. Confirm Pull Requests are enabled.
7. Do not invite collaborators until you know exactly what access they need.

### Branch protection

Branch protection prevents accidental changes to main. GitHub’s docs say branch protection can require reviews or passing checks before pull requests merge. For private repositories, availability depends on GitHub plan level. If you do not have branch protection available yet, use a manual rule: never change main directly after the starter setup.

- [ ] If available, protect main.
- [ ] Require pull request before merging.
- [ ] Require status checks once CI exists.
- [ ] Do not allow force pushes.
- [ ] Do not allow deletions.

## Part 11 — Create the GitHub labels

### What labels do

Labels let you sort issues so AI agents and humans know what type of work something is, what module it touches, and whether it is blocked by a founder/security/legal decision.

### Exact steps

1. Open your repo in GitHub.
2. Click Issues.
3. Click Labels.
4. Create the labels below. If GitHub already has default labels, you can keep or delete them later.

| Label group | Labels to create |
| --- | --- |
| Module labels | module:accounts, module:assets, module:intake, module:scope, module:docs, module:messages, module:agreements, module:vendors, module:reporting, module:security, module:ai, module:ops |
| Type labels | type:feature, type:schema, type:rls, type:ui, type:test, type:docs, type:bug, type:refactor |
| Risk labels | risk:client-data, risk:professional-boundary, risk:document-release, risk:permission, risk:finance, risk:high |
| Workflow labels | ready-for-agent, needs:founder-decision, needs:legal-review, needs:security-review, blocked, staging-ready, uat-ready |

## Part 12 — Create the GitHub Project board

### What this does

The GitHub Project board is your command center. It shows the status of every ticket so you are not relying on memory.

### Exact steps

1. In GitHub, click your profile or repository Projects area.
2. Click New project.
3. Choose Board view if offered.
4. Name it AuxiliumOS Build Command Board.
5. Create these columns/statuses: Backlog, Ready for Spec, Needs Founder Decision, Ready for Build, In Agent Work, PR Open, AI Review, Human Review, Staging, UAT, Ready for Release, Released, Blocked.
6. Connect the project board to the auxiliumos repository if GitHub prompts you.
7. Add your first issues once the board exists.

### Why this matters

This prevents long-chat chaos. AI tools should only work tickets that are ready and labeled. Anything with a founder decision required pauses until you answer it.

## Part 13 — Create the first 20 GitHub issues

Create these as separate issues. Do not let one issue become the whole product.

- **Repo foundation review:** Confirm AGENTS.md, CLAUDE.md, docs folders, templates, and project-state files exist.
- **Fill PROJECT_STATE.md v1:** Record current phase, current tools, current source-of-truth rule, and next actions.
- **Fill DECISION_LOG.md v1:** Record decisions already made: one data spine, modular suite, GitHub as source of truth, no chat scope changes.
- **Fill OPEN_QUESTIONS.md v1:** List all unresolved business decisions.
- **Fill ROLE_PERMISSION_MATRIX.md v1:** Draft roles for Auxilium Admin, PM, Doc Controller, Client Executive, Site Champion, PA User, Vendor User.
- **Fill DOCUMENT_ACCESS_MATRIX.md v1:** Draft document classes and who can see/release/download them.
- **Fill DATA_SPINE.md v1:** Record the canonical data spine exactly.
- **Fill MODULE_MAP.md v1:** Record Core, Accounts, Programs, Assets, Readiness, Intake, Scope, Docs, Messages, Agreements, Vendors, Reporting, AI, Audit.
- **Prepare Supabase dev project:** Create dev project, document URL/anon key location, do not commit secrets.
- **Prepare Lovable project knowledge:** Set project rules and prevent schema invention.
- **Prepare Cursor rules verification:** Open repo in Cursor and confirm rules are visible.
- **Create first vertical slice spec:** Define Account -> Role -> Facility -> Incident Request -> Admin Queue -> Document Release -> Client View -> Audit Event.
- **Create RLS test matrix v1:** Define wrong-user denial scenarios.
- **Create Playwright UAT scenarios v1:** Define browser flows for PA user, site champion, admin, executive.
- **Create document release workflow spec:** Define uploaded, draft, under review, release requested, released, superseded.
- **Create project request state machine v1:** Draft intake states from draft to converted/declined/cancelled.
- **Create emergency exception workflow v1:** Draft what must be true before emergency work proceeds.
- **Create no-PHI policy v1:** Define facility data only and prohibited uploads.
- **Create first Lovable UI shell prompt:** Draft prompt for UI shell only; no backend schema creation unless explicitly approved.
- **Create first session closeout habit:** Document exact closeout format and use it after every AI/tool session.

## Part 14 — Install Node.js LTS

### What this does

Node.js lets your computer run modern JavaScript/TypeScript tools such as Supabase CLI, Playwright, frontend apps, and many coding-agent workflows. Node’s official download page lists the current Latest LTS version and installers.

### Exact steps

1. Go to the official Node.js download page.
2. Choose the LTS version, not the experimental latest feature version, unless a developer later gives you a reason.
3. Download the installer for your operating system.
4. Run the installer and accept the standard defaults.
5. Restart Cursor/GitHub Desktop/terminal after installation if they were open.

### Verify Node is installed

Open Terminal on Mac or PowerShell on Windows and run:

```
node -v
npm -v
```

If both commands print version numbers, Node and npm are installed. If they say command not found, restart your computer and try again; if still broken, reinstall Node LTS.

## Part 15 — Install Cursor and open the repository

### What this does

Cursor is your code/editor cockpit. It lets you see the repository files, run AI agent tasks, inspect diffs, and supervise changes. Cursor supports persistent Project/Team/User Rules and AGENTS.md, which is why the skeleton includes .cursor/rules and AGENTS.md.

### Exact steps

1. Download and install Cursor from the official Cursor site.
2. Open Cursor.
3. Sign in or create an account.
4. Click Open Folder.
5. Select your local auxiliumos repo folder inside AuxiliumOS/00_GitHub_Repo/auxiliumos.
6. In the left file tree, confirm you see AGENTS.md, CLAUDE.md, docs/, supabase/, app/, tests/, .cursor/.

### First Cursor check prompt

Open Cursor chat/agent and paste this. It should summarize only; it should not edit files.

```
Read AGENTS.md, CLAUDE.md, docs/00-control/PROJECT_STATE.md, and docs/00-control/NEXT_ACTIONS.md. Summarize the AuxiliumOS project rules, data spine, non-negotiable guardrails, and current next actions. Do not edit any files.
```

### Good result

- [ ] Cursor mentions the data spine.
- [ ] Cursor mentions no AI-created architecture without approval.
- [ ] Cursor mentions no secrets and no production edits.
- [ ] Cursor does not modify files.

## Part 16 — Set up Lovable correctly

### What this does

Lovable is the fast UI/app builder. Lovable can connect to Supabase for database, auth, storage, real-time features, and edge functions, and can sync to GitHub. That speed is useful, but only if Lovable is constrained by the AuxiliumOS rules.

### Exact steps

1. Create or sign in to your Lovable account.
2. Create a new Lovable project named AuxiliumOS Launch Platform.
3. Before asking it to build anything, open Project Knowledge or Knowledge settings if available.
4. Paste the Lovable Project Knowledge block below.
5. Connect GitHub only after your repository skeleton is committed.
6. When connecting GitHub, use the auxiliumos repo and preferably work on a branch such as lovable-ui-shell instead of directly overwriting main.
7. Do not connect production Supabase. Use dev only when ready.
8. Do not ask Lovable to build the whole app. Ask it to build one vertical slice or one UI surface at a time.

### Lovable Project Knowledge block

```
AuxiliumOS is a modular operating suite for Auxilium Environmental. The repository is the source of truth. Do not invent core objects, roles, permissions, document states, service logic, or database architecture.

Canonical data spine: Client Account -> Program/MSA -> Portfolio -> Asset/Facility -> Zone/Area -> Incident -> Project Request -> Scope Record -> Authorization -> Project -> Tasks -> Deliverables -> Documents -> Communications -> Financial Records -> Reports -> Audit Events.

Lovable should primarily build UI and controlled app surfaces. It must not decide RLS policies, service boundaries, professional exclusions, scope-change rules, sampling authorization, agreement logic, or document-release authority.

No chat/message may change scope. Messages can create tasks or change request drafts only. No client-visible document may appear unless release_status = client_visible_released and the current user has the correct account/asset/project/document permission.

If a requested feature requires new schema, permissions, document release logic, or scope logic, stop and ask for approval before building.
```

### First safe Lovable prompt

```
Build a visual-only AuxiliumOS client portal shell. Do not create or change database schema. Do not create backend logic. Create navigation placeholders for Dashboard, Facilities, Projects, Documents, Messages, Approvals, Reports, and Account. Use professional enterprise styling. Include status cards and empty-state examples only. Follow the canonical data spine and do not invent new modules.
```

### Bad Lovable prompt

```
Build the entire AuxiliumOS app with all backend, security, dashboards, and client portal.
```

That bad prompt is dangerous because it invites Lovable to invent schema, permissions, and workflows.

## Part 17 — Set up Supabase dev project

### What this does

Supabase is the backend foundation: PostgreSQL database, authentication, storage, edge functions, and Row Level Security. Supabase says RLS should be enabled on exposed tables and documents local development with CLI/migrations. In the beginning, create only the dev project and document how it will be used. Do not rush into production data.

### Exact steps in Supabase dashboard

1. Create or sign in to your Supabase account.
2. Create an organization if needed, such as AuxiliumOS.
3. Create a new project named auxiliumos-dev.
4. Choose a region close to your expected users unless you have a compliance reason to choose otherwise.
5. Create and securely store the database password in your password manager.
6. Wait for the project to finish provisioning.
7. Open Project Settings -> API and locate the Project URL and anon public key. Do not paste these into public files. The anon key can be used by frontend apps but still must work with RLS. Treat service-role keys as highly sensitive and never expose them in browser code or chat.
8. Open Authentication settings later when the first auth ticket is ready. Do not turn on every provider randomly.
9. Open Storage later when the document-control ticket is ready. Do not create buckets casually without policies.
10. Record in PROJECT_STATE.md that Supabase dev project exists. Do not record secrets.

### Create staging and production later

Create auxiliumos-staging and auxiliumos-prod only when the dev workflow is stable. Beginners often create all environments and then forget which one they are touching. Start with dev.

### Supabase rule

```
RLS first. No client-data table goes live without an RLS policy, denial tests, and audit-event design.
```

## Part 18 — Install Supabase CLI later, not first

### What this does

The Supabase CLI lets you initialize the supabase folder, run a local Supabase stack, manage migrations, and deploy changes. Official Supabase docs show installing the CLI, running npx supabase init, and starting the local stack; local development requires a Docker-compatible runtime.

### When to do this

- [ ] Do this after the repo skeleton is in GitHub.
- [ ] Do this after Node.js LTS is installed.
- [ ] Do this when you are ready to create migrations, not while only doing planning.
- [ ] Do this in the dev phase, not production.

### Exact commands when ready

Open Cursor terminal inside the repository folder and run:

```
npm install supabase --save-dev
npx supabase init
```

If you want to run local Supabase, you must install Docker Desktop or another supported container runtime first. Then you can run:

```
npx supabase start
```

If this feels intimidating, pause. You can still plan schema and build UI before using the CLI deeply. The key is not to let dashboard-only schema changes become the permanent workflow.

## Part 19 — Set up GitHub secrets only when needed

### What this does

GitHub secrets store sensitive values for GitHub Actions. Do not put secrets in normal repository files. For now, you probably do not need secrets until CI/CD or deployment tasks begin.

### Exact steps when needed

1. Open GitHub repository.
2. Click Settings.
3. Click Secrets and variables -> Actions.
4. Click New repository secret.
5. Name the secret clearly, such as SUPABASE_ACCESS_TOKEN or OPENAI_API_KEY if later needed.
6. Paste the secret value.
7. Click Add secret.
8. Record in PROJECT_STATE.md that the secret exists by name only, not by value.

### Never do this

- [ ] Never paste a secret into AGENTS.md.
- [ ] Never paste a secret into ChatGPT.
- [ ] Never paste a secret into Lovable chat unless the tool explicitly provides a secure secrets manager flow.
- [ ] Never commit .env files.

## Part 20 — Set up Claude Code later

### What this does

Claude Code is a repo-aware coding assistant. Anthropic’s quickstart says Claude Code can be installed, logged into, started from a terminal with the claude command, and used with Git. Claude Code uses CLAUDE.md files for persistent project instructions, which the starter repo already includes.

### Exact beginner setup

1. Install Claude Code using the official Anthropic instructions for your operating system.
2. Open Terminal or PowerShell.
3. Navigate to your local repository folder. In Cursor you can also open the built-in terminal inside the repo.
4. Run claude.
5. Log in when prompted.
6. Ask Claude to summarize project rules first. Do not ask it to edit code immediately.

### First Claude Code prompt

```
Read AGENTS.md, CLAUDE.md, docs/00-control/PROJECT_STATE.md, and docs/00-control/NEXT_ACTIONS.md. Summarize the project, current phase, non-negotiable rules, and what you are not allowed to change. Do not edit any files.
```

### When to allow Claude edits

- [ ] Only after a GitHub issue exists.
- [ ] Only on a branch for that issue.
- [ ] Only with a clear list of allowed files.
- [ ] Only with tests or docs updates required.
- [ ] Only after it agrees to provide a session closeout.

## Part 21 — Set up Codex later

### What this does

Codex can work in the cloud connected to GitHub and can create pull requests from tasks. OpenAI’s Codex cloud docs say Codex can read, edit, and run code and work on tasks in the background using a cloud environment connected to GitHub. Codex also reads AGENTS.md-style instructions.

### Exact web setup

1. Open Codex from your OpenAI/ChatGPT account when available in your plan.
2. Connect GitHub when prompted.
3. Authorize only the auxiliumos repository if you can limit access.
4. Select the repo.
5. Before assigning real work, give Codex a summarize-only task.
6. Do not let Codex work on production credentials or production Supabase.

### First Codex task

```
Read AGENTS.md and docs/00-control/PROJECT_STATE.md. Do not edit files. Summarize the project rules, current phase, data spine, and required output format for future tasks.
```

### Later safe Codex task pattern

```
Work on GitHub issue #__ only. Create a branch. Do not change files outside the issue scope. Follow AGENTS.md. Add or update tests if behavior changes. Open a pull request and include files changed, tests run, assumptions, risks, and docs updated.
```

## Part 22 — Set up Playwright when the app exists

### What this does

Playwright is the browser robot. Its docs describe it as an end-to-end test framework for modern web apps that bundles a test runner, assertions, isolation, parallelization, and tooling, and supports Chromium, WebKit, and Firefox. You will use it to verify real workflows such as login, facility view, request submission, document release, and access denial.

### Do not install too early if no app exists

If Lovable or your frontend app has not created a real app folder yet, wait. Once app/package.json exists, install Playwright in that app context.

### Exact setup when ready

1. Open Cursor.
2. Open the local auxiliumos repo folder.
3. Open Terminal inside Cursor.
4. Make sure you are in the app folder if the frontend lives in /app, or in the repo root if package.json is at the root.
5. Run npm init playwright@latest.
6. Choose TypeScript if asked unless the app is JavaScript-only.
7. Use tests/e2e or e2e as the test folder.
8. Allow it to add a GitHub Actions workflow when prompted if your repo is ready for CI.
9. Install browsers when prompted.

```
npm init playwright@latest
```

### First Playwright tests to create later

- [ ] Client can log in and see only their dashboard.
- [ ] PA user cannot see another PA firm project.
- [ ] Site champion can submit an incident.
- [ ] Draft document is hidden from client.
- [ ] Released document is visible to authorized client.
- [ ] Removed user cannot access anything.
- [ ] Chat message cannot mutate scope.

## Part 23 — Set up GitHub Actions after package.json exists

### What this does

GitHub Actions runs automated checks when code changes. GitHub’s docs describe Actions as a way to create custom CI workflows directly in a repository. The starter repo includes a placeholder workflow, but real checks come after the app has package.json, tests, and build commands.

### Beginner explanation

Think of GitHub Actions as the robot gatekeeper. When someone opens a pull request, Actions can run build/test commands. If the robot finds a failure, the pull request should not merge.

### Exact steps later

1. Wait until the app has package.json and test scripts.
2. Open .github/workflows/ci.yml in Cursor.
3. Make sure it runs install, lint, typecheck, test, and build commands that actually exist.
4. Commit the workflow change in a branch.
5. Open a pull request.
6. Confirm GitHub runs the workflow.
7. Fix failures before merging.

### Do not fake CI

A workflow that always passes without running real checks is worse than no workflow because it creates false confidence.

## Part 24 — The standard day-to-day workflow once tools are set up

### Every work session starts like this

- [ ] Open GitHub Project board.
- [ ] Look at Ready for Build and Needs Founder Decision.
- [ ] Open PROJECT_STATE.md and NEXT_ACTIONS.md.
- [ ] Pick one ticket only.
- [ ] Confirm which tool will work on it: ChatGPT, Lovable, Cursor, Claude Code, Codex, or you manually.
- [ ] Create or confirm a branch for the work.
- [ ] Give the AI only the ticket, source-of-truth docs, allowed files, and required output format.

### Every work session ends like this

```
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

### Then update repository files

- [ ] Update PROJECT_STATE.md if the project status changed.
- [ ] Update DECISION_LOG.md if a decision was made.
- [ ] Update OPEN_QUESTIONS.md if a new question appeared or was answered.
- [ ] Update RISK_REGISTER.md if a risk appeared.
- [ ] Update SCHEMA_REGISTRY.md if schema changed.
- [ ] Update ROLE_PERMISSION_MATRIX.md if roles or permissions changed.
- [ ] Update DOCUMENT_ACCESS_MATRIX.md if document rules changed.
- [ ] Commit and push changes.

## Part 25 — Exact workflow for asking an AI agent to work safely

### Bad prompt

```
Build the next part of the app.
```

### Good prompt

```
You are working on GitHub issue #12 only. Read AGENTS.md, CLAUDE.md, docs/00-control/PROJECT_STATE.md, and the issue body. Do not change files outside the issue scope. Do not invent new core objects. Do not alter RLS, document release, scope logic, or permissions unless the issue specifically asks for it.

Before editing, summarize your plan and list the files you expect to change. After editing, provide session closeout with files changed, tests run, assumptions, risks, and docs updated.
```

### If the AI says it needs to decide something

Do not let it proceed. Have it create a decision item using this format:

```
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

## Part 26 — Tool-specific do and do not rules

| Tool | Do | Do not |
| --- | --- | --- |
| ChatGPT | Use for strategy, reasoning, edge-case review, ticket writing, and decision support. | Do not let ChatGPT be the only record of a decision. |
| GitHub | Use as source of truth and issue/PR/history system. | Do not treat it as a random upload folder. |
| GitHub Desktop | Use to commit, push, switch branches, and see file changes visually. | Do not commit secrets or real client data. |
| Cursor | Use to inspect repo and supervise AI changes. | Do not accept giant multi-module changes without review. |
| Lovable | Use for fast UI and controlled app surfaces. | Do not ask it to build the whole backend or invent permissions. |
| Supabase | Use for database/auth/storage/functions with RLS. | Do not create production data tables without RLS and tests. |
| Claude Code | Use as a strong repo worker on one issue at a time. | Do not let it change production or skip closeouts. |
| Codex | Use for GitHub-connected coding tasks and PRs. | Do not let it make business/legal/professional decisions. |
| Playwright | Use to test real user workflows. | Do not launch without access-denial tests. |
| GitHub Actions | Use to run automated gates. | Do not merge around failing checks unless you understand and document why. |

## Part 27 — Your first practical run-through

This is the first complete no-code practice loop. It teaches the workflow without risking app logic.

- [ ] Create GitHub issue: Fill PROJECT_STATE.md v1.
- [ ] Assign label: type:docs and ready-for-agent.
- [ ] Create a branch in GitHub Desktop called docs/project-state-v1.
- [ ] Open PROJECT_STATE.md in Cursor.
- [ ] Ask Cursor to draft content only for that file using AGENTS.md.
- [ ] Review the file manually.
- [ ] Commit in GitHub Desktop with message: Fill PROJECT_STATE v1.
- [ ] Push branch.
- [ ] Open pull request on GitHub.
- [ ] Review PR summary.
- [ ] Merge PR if correct.
- [ ] Pull/sync main in GitHub Desktop.

### Why this first

This teaches issue -> branch -> edit -> commit -> push -> PR -> review -> merge without touching code, schema, RLS, or client data.

## Part 28 — The first build slice after prep

Do not start with the whole monster. Start with the foundation vertical slice, because it proves the operating model.

```
Account -> User Role -> Facility -> Incident Request -> Admin Queue -> Document Upload -> Document Release -> Client View -> Audit Event
```

### Exact pieces the first slice proves

- [ ] An account can exist.
- [ ] A user can belong to an account.
- [ ] A user can have a role.
- [ ] A facility can belong to an account.
- [ ] A site user can submit an incident/request.
- [ ] An admin can review it.
- [ ] A document can be uploaded but not automatically released.
- [ ] A document can be released only through a release workflow.
- [ ] A client can see only released documents they are permitted to see.
- [ ] Every meaningful action creates an audit event.

## Part 29 — Troubleshooting beginner mistakes

| Problem | Likely cause | Fix |
| --- | --- | --- |
| GitHub Desktop shows no changes | Files were copied to the wrong folder. | Confirm you pasted into the actual local repo folder, not the parent AuxiliumOS folder. |
| GitHub says repository is empty | You committed locally but did not push. | Open GitHub Desktop and click Push origin. |
| Cursor cannot see files | You opened the wrong folder. | Use File -> Open Folder and select the repo folder that contains AGENTS.md. |
| AI ignores rules | It did not read AGENTS.md/PROJECT_STATE.md, or instructions were too broad. | Start each session with a read-and-summarize instruction. Narrow the ticket. |
| Lovable creates weird tables | Prompt allowed it to invent backend. | Stop, revert branch if needed, and rebuild from exact schema/ticket instructions. |
| Supabase keys got pasted into a file | Secrets discipline failed. | Remove the secret immediately, rotate the key, and check Git history. Do not just delete and move on. |
| You do not know what changed | Work happened outside issue/branch/PR process. | Stop and create a session closeout before continuing. |
| Everything feels too complicated | You are trying to build multiple modules at once. | Return to one issue, one branch, one vertical slice. |

## Part 30 — Prep completion checklist

- [ ] ChatGPT Project exists and has AuxiliumOS instructions.
- [ ] Private GitHub repo auxiliumos exists.
- [ ] Starter skeleton is committed and pushed.
- [ ] GitHub Desktop is installed and connected.
- [ ] GitHub labels exist.
- [ ] GitHub Project board exists.
- [ ] First 20 issues exist or are being entered.
- [ ] Node.js LTS is installed and verified.
- [ ] Cursor opens the repo and can summarize rules without editing.
- [ ] Lovable project exists with AuxiliumOS Project Knowledge.
- [ ] Supabase dev project exists and no secrets are committed.
- [ ] PROJECT_STATE.md is filled in.
- [ ] DECISION_LOG.md is filled in with decisions already made.
- [ ] OPEN_QUESTIONS.md lists unresolved founder decisions.
- [ ] ROLE_PERMISSION_MATRIX.md draft exists.
- [ ] DOCUMENT_ACCESS_MATRIX.md draft exists.
- [ ] You have performed one practice issue/branch/PR loop.
- [ ] You understand that no tool is allowed to work outside the repo/ticket/guardrail system.

## Appendix A — Current official references checked

- **ChatGPT Projects:** OpenAI Help describes Projects as workspaces that group chats, files, and custom instructions.
- **GitHub repositories:** GitHub docs describe creating repositories from the web UI and choosing visibility.
- **GitHub Desktop:** GitHub docs describe Desktop as a GUI for GitHub work such as cloning, pushing, pulling, committing, and creating PRs.
- **GitHub files:** GitHub docs describe browser file upload limits and commit/propose-change flow.
- **GitHub Actions:** GitHub docs describe custom CI workflows in repositories.
- **GitHub branch protection:** GitHub docs describe requiring reviews/status checks before merging to protected branches, with plan availability limits.
- **Node.js:** Node.js official download page lists the current LTS installer.
- **Supabase local/CLI:** Supabase docs describe CLI/local development, migrations, Docker-compatible runtimes, and npx supabase commands.
- **Supabase RLS:** Supabase docs state RLS should be enabled on exposed tables and used for granular authorization.
- **Supabase GitHub integration:** Supabase docs describe connecting Supabase to GitHub and setting the working directory.
- **Lovable Supabase integration:** Lovable docs describe connecting Lovable with Supabase for backend, auth, storage, real-time, and serverless functions.
- **Claude Code:** Claude Code docs describe install/login and CLAUDE.md persistent project memory.
- **Codex:** OpenAI Codex docs describe Codex web/cloud with GitHub-connected background tasks and AGENTS.md guidance.
- **Cursor Rules:** Cursor docs describe Project, Team, User Rules and AGENTS.md support.
- **Playwright:** Playwright docs describe installing Playwright and browser-based end-to-end testing.
## Appendix B — The short rule set to memorize

```
1. GitHub is the source of truth.
2. One issue, one branch, one controlled change.
3. No secrets in repo or AI chats.
4. No production data during prep.
5. No client-visible document without release workflow.
6. No chat message changes scope.
7. No RLS, no client-data table.
8. No AI-created professional/legal/business authority.
9. Every session ends with closeout.
10. Every important decision is written into the repo.
```
