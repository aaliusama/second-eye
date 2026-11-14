# Second Eye - Claude Code

All project instructions live in AGENTS.md so every AI coding tool on the team reads the same rules.

@AGENTS.md

For the current execution priorities, read `docs/WINNING_BRIEF.md` before choosing a task. The supporting research and dated audit are in `docs/winning-assessment.md`; do not treat proposed improvements as existing capabilities.

## Claude Code only
- Before editing, read the files you will change and the matching schema in `contracts/`.
- After editing, run `npm run typecheck` and the tests for the directory you touched. Before saying a task is done, run `npm run demo`.
- For tasks spanning multiple owners, establish a short implementation plan and the allowed paths. Proceed when the user has already authorized that scope; otherwise request the missing scope approval. Frozen-contract changes still require explicit approval under `AGENTS.md`.
- Personal preferences go in `CLAUDE.local.md` (gitignored), not in this file.
