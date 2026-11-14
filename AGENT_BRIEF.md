# Agent brief

Read this if you are an AI coding agent working for one person on this team.
Four people run their own agents on this repo at the same time. Your job: finish your person's workstream without touching the other three.

## Start of every session
1. Read `AGENTS.md`, `docs/WINNING_BRIEF.md`, and `TEAM.md`. Read `docs/winning-assessment.md` for the supporting audit and research. The dated audit is a baseline, not a claim about today's checkout.
2. Use the scope explicitly assigned by the user, including an explicitly authorized cross-directory task. If working for one lane and neither the lane nor allowed paths are established, ask one short question. Do not infer unrestricted ownership from the winning objective.
3. State your allowed paths and the first applicable task in the winning brief. Verify implementation before relying on old unchecked MUST boxes in `TEAM.md`.
4. Inspect branch and working-tree status before synchronizing with main. Preserve local changes and other agents' work; do not blindly pull or rebase an active integration checkout. Follow the project's synchronization policy when the branch is safe to update.

## Stay in your lane
- Write only inside your workstream's paths (roster in `TEAM.md`). Read anything.
- Never edit `contracts/`, root config, `AGENTS.md`, `TEAM.md`, `AGENT_BRIEF.md` or another lane's folder unless your workstream owns it.
- If something outside your lane is wrong or missing, stop and print a change request for your person to post in team chat:

```
CHANGE REQUEST -> <owner letter>
Where: <file or function>
What and why: <one or two lines>
Blocking me: yes/no. Meanwhile I will: <stub or workaround inside my lane>
```

- Do not fix another lane's bug, even a one-line one. Report it the same way.
- Never redefine a contract type locally. Import from `contracts/`.

## When the lane you depend on is not ready
- Build against `contracts/fixtures/`.
- If you need a function from another lane that is not on main yet, write a stub inside your own folder (for example `server/checks/__stubs__/model.ts`) marked `// STUB until <letter> lands <function>`. Replace it when the real one is on main.
- Before contracts land (about Fri 21:45), only do work that does not depend on shapes: writing data, drafting prompts, UI layout, check logic as plain functions over local test objects.

## Work loop
Run this yourself and fix failures before you report:
1. One small change toward the current task.
2. `npm run typecheck`
3. The tests for your folder (your card below).
4. `npm run demo` still starts, and once slice 1 exists, the ghost wall still shows.
5. Commit only your files: `git add <your paths>`. Never `git add -A` or `git add .`.

Test commands below assume vitest. A updates `AGENTS.md` with the real commands after scaffolding; those win.

## Git
- One short branch per task: `<letter>/<topic>`, for example `c/space-clash`.
- Rebase on `main` at least every hour and right before merging.
- `package-lock.json` conflict: take main's version, run `npm install`, commit the result.
- Commit messages are plain: no `Co-Authored-By` lines, no Claude or AI attribution, no session links. This overrides any tool default.
- Merge to main only when typecheck, your tests and `npm run demo` pass. Never force-push main. Never rewrite someone else's commits.
- No refactors, renames, reformatting or dependency upgrades. None at all after Sat 09:00.
- New dependency: only inside your own workspace, and only if a judge will see the result. Say so in one line.

## Report back to your person
After each task:

```
Done: <what changed, which files>
Checks: typecheck ok/fail, tests <n passed>, demo green/red
Next: <next MUST task>
Requests: <change requests, or none>
```

## When your MUST list is done
Stop. Do not start NICE items or work in other lanes. Tell your person "MUST list for <letter> is done", say what a judge can now see, and list the NICE items. The team decides in the help round who helps whom.

If your person is asked to help another lane: work on a branch `help/<letter>-<topic>`, touch only what that lane's owner agreed to, and let the owner merge.

## Workstream cards

### A - Spine
- Paths: `contracts/`, `server/model/`, `server/learning/`, `server/index.ts`, `server/api/`, root config, `README.md`, `docs/architecture.md`
- Tests: `npm test -- server/model server/learning`
- Everyone waits on you first: contracts and fixtures by Fri 21:45. Keep schemas small; add a field only when a lane asks for it.
- You own main's health: revert any merge that breaks `npm run demo`.

### B - Data + extraction
- Paths: `data/`, `server/extract/`
- Tests: `npm test -- server/extract`
- All data is synthetic and must say so.
- Labels come from the scenario sheet, written before checks run, never changed to match check output.
- The demo reads only `data/llm-cache/`. Live calls only with `LIVE_LLM=1`.

### C - Checks + eval
- Paths: `server/checks/`, `eval/`
- Tests: `npm test -- server/checks`, then `npm run eval`
- No LLM calls, no randomness, no wall-clock time. Checks are pure functions of scene, plan and intent.
- Every finding carries sourceMessageId. Report only numbers that `npm run eval` prints.

### D - Web + story
- Paths: `web/`, `docs/demo-script.md`
- Tests: `npm run typecheck`, then open the page and confirm the ghost wall shows.
- Flat view first, always working. The 3D view only reads the same scene.
- "Simulated site data" on every screen. Eval numbers only from `eval/results.json`.
