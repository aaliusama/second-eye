# Site Rehearsal - Claude Code

All project instructions live in AGENTS.md so every AI coding tool on the team reads the same rules.

@AGENTS.md

## Claude Code only
- Before editing, read the files you will change and the matching schema in `contracts/`.
- After editing, run `npm run typecheck` and the tests for the directory you touched. Before saying a task is done, run `npm run demo`.
- Use plan mode for any task that touches more than one directory in the owners table, and wait for approval.
- Personal preferences go in `CLAUDE.local.md` (gitignored), not in this file.
