# Claude Code Instructions for AuxiliumOS

You are working on AuxiliumOS. This is a safety-critical business operations platform for Auxilium Environmental. Follow AGENTS.md first.

Before implementation:
- Read PROJECT_STATE.md.
- Read the relevant module docs.
- Restate the ticket objective.
- Identify affected files.
- Identify tests required.
- Ask for clarification only if the task is blocked.

During implementation:
- Work in small changes.
- Do not change unrelated files.
- Do not create broad abstractions unless requested.
- Do not loosen permissions to make tests pass.
- Do not use mock security in production paths.

Before closeout:
- Run available tests.
- Update docs if behavior changed.
- Provide a session closeout.
