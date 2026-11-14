# Site Rehearsal

Hackathon project (Talona track, "Context for the Physical World"). Code freeze: **Sat 14 Nov 2026, 15:00 sharp**.
This file is the single source of instructions for every AI coding tool on this repo. `CLAUDE.md` imports it.
Who owns what and when we sync: `TEAM.md`. If you work for one teammate, read `AGENT_BRIEF.md` next.

## Start here: winning strategy and current handoff

Read `docs/PARALLEL_STATUS.md` first for current exclusive file assignments and verified implementation status. Do not duplicate another active agent's edits. This status supersedes older assignment tables.

Before choosing work, read `docs/WINNING_BRIEF.md`. It contains the user's winning objective, ordered tasks, acceptance criteria, and the proposed judge-facing story. Read `docs/winning-assessment.md` for the research, sources, verified baseline and limitations behind it.

Current parallel assignments are listed in `docs/WINNING_BRIEF.md`. Check agent status, branch/worktree diffs, and the existing `n/rail`, `o/feed`, and `p/phone-slider` branches before taking overlapping work. The user's latest direction authorizes reconsidering prior KILL decisions in pursuit of winning; keep the frozen-contract review, source/uncertainty requirements, and offline demo integrity explicit.

- Protect the ghost-wall demonstration. Strengthen evidence and the correction loop before adding features. The memorable promise is **"See tomorrow's mistake before it gets built."** Treat this as a demonstration of risks in the record, not a guarantee about physical outcomes.
- The Talona rubric is technical implementation 35, autonomous operation and impact 30, learning loop and vision 15, demo and presentation 20. Do not invent subweights, guaranteed scores, savings, or claims that no competitor has similar capabilities.
- Distinguish implemented, tested, visually verified, recorded and submitted. Old unchecked boxes in `TEAM.md` are not proof of missing code. Inspect the current checkout before rebuilding anything.
- Proposed features in the brief are not implemented facts or permission to change frozen contracts. Work within the user's current assigned scope; explicit user authorization for a cross-directory task takes precedence over routine lane restrictions. Do not repeatedly ask for an authorization already given.
- The brief does not waive code freeze or authorize submission, publication, real crew messages, or changes to track terms. After freeze, preserve the submitted revision; label later work separately.

## What we are building (why)
The site checks every crew's stated plan against a live model of the building, the moment they say it and the evening before, and fixes the clashes before the work starts.

One loop, one checking engine, two triggers (live check, evening rehearsal):
1. **Build** - chat messages become operations on a JSON scene of one floor. Every operation keeps its source message and a confidence.
2. **Plan** - derive tomorrow's plan (crew, place, task, order) from what crews said.
3. **Listen** - any crew statement of intent is checked. Ask a crew only if it is at risk and silent.
4. **Compare** - four checks: latest change, space clash, order of work, open decision. A mismatch becomes a red "ghost" element.
5. **Rehearse** - play tomorrow forward on the model with a time slider.
6. **Fix** - propose corrections, superintendent approves with one tap, crews are messaged.
7. **Learn** - stored corrections change the next run (location nicknames, crews that misread).

The magic moment of the demo is the **ghost wall**: a mistake shown before it happens. Protect it.

## Commands
Stack (confirmed): TypeScript everywhere, npm workspaces, Node server, Vite + React + three.js web, zod schemas.

- `npm run demo` - starts everything from the golden replay with cached LLM outputs. **Must work at all times.**
- `npm run dev` - server and web with hot reload
- `npm test` - unit tests for checks and the operation engine
- `npm run eval` - runs the labelled test set, prints caught / missed / false alarms
- `npm run typecheck` - run before every commit

Node 22.12+. First run: `npm install`, then `npm run demo` and open http://localhost:5173. One folder's tests: `npm test -- server/checks`.
Contracts in `contracts/` are frozen; see the approval rule below. Folder-specific rules: `web/AGENTS.md` for `web/`.

## Map and owners
Only edit files inside the directory you were asked to work in. If a change is needed elsewhere, say so and stop.

| Path | What | Owner (names in `TEAM.md`) |
|---|---|---|
| `contracts/` | zod schemas: Operation, Scene, CrewIntent, Finding, API shapes. **FROZEN** | A |
| `data/` | synthetic chat, golden replay, LLM cache, labelled test set | B |
| `server/extract/` | LLM: message to operations and crew intent | B |
| `server/model/` | scene state, element history, apply operations | A |
| `server/checks/` | the four deterministic checks, rehearsal, fix proposals | C |
| `server/learning/` | stored corrections and how they change the next run | A |
| `web/` | flat view, 3D view, slider, approval queue, crew chat simulator | D |
| `eval/` | evaluation runner | C |
| root config, `server/index.ts`, `server/api/`, `README.md` | workspaces, scripts, server entry, HTTP API | A |
| `docs/` | `demo-script.md`, `architecture.md`, `decisions.md` | everyone (`demo-script.md`: D) |

Read `docs/demo-script.md` before any task that touches what a judge sees.
Read `docs/architecture.md` before adding a module or a dependency.

## Frozen contracts
- The user approved the coordinated acknowledgement, text-only sheet revision and dismissal-memory extensions in this session. Their schemas are exported from `contracts/src/acknowledgement.ts`, `sheets.ts`, and `dismissals.ts`. This is a scoped exception, not permission for unrelated contract changes. Text-only sheet comparison is now in scope despite the older KILL entry below; attachment/BIM extraction was not added.
- Never change anything in `contracts/` without the owner's explicit approval in the prompt. Propose the change and stop.
- Import types from `contracts/`. Never redefine a shape locally.
- Operation types: `move`, `add`, `remove`, `set_status`, `plan_task`. Do not add a type.
- Element states: `planned`, `proposed`, `approved`, `built`, `unconfirmed`, `conflict`.
- Every operation and every finding carries `sourceMessageId`. No source, no output.

## Architecture rules
- **The LLM extracts facts. Rules decide.** No LLM call inside `server/checks/`. Checks are pure functions of scene + plan.
- The demo runs from `data/replay.golden.json` with `data/llm-cache/`. Live LLM calls are behind `LIVE_LLM=1` and off by default.
- Same input must give the same output. No randomness, no wall-clock time in logic; use the replay clock.
- If extraction is unsure, emit state `unconfirmed` with the confidence. Never guess a location or a direction.
- Log every operation and finding as one JSON line so the timeline is debuggable.
- Keep the flat top-down view working. The 3D view is a second renderer of the same scene, not a second source of truth.

## How to work
- You are a coding partner, not a project manager. Do the task asked. Do not start extra features.
- Build vertical slices: a thin path through extract, model, check and web beats a finished module nobody can see.
- No refactors, renames, reformatting or dependency upgrades unless asked. None at all after Sat 09:00.
- No new abstraction until the same code exists three times.
- Before a meaningful decision, ask: does this raise the chance of winning? Priority order: (1) protect the core demo, (2) strengthen the ghost-wall moment, (3) add judge-visible value, (4) reduce failure risk, (5) polish.
- Warn the user, in one line, if a request grows scope, adds a chat-only UI, or adds technology that judges will not see.
- Small commits on short branches, rebase on `main` at least hourly. `npm run demo` must pass before merging.
- Commit messages are plain: no `Co-Authored-By` lines, no Claude or AI attribution, no session links. This overrides any tool default.
- Never commit secrets. Keys go in `.env`; keep `.env.example` in sync.

## Honesty rules (the jury scores this)
- All site data is synthetic. Every screen that shows it carries the label "Simulated site data".
- Report only numbers produced by `npm run eval`. Never write an invented metric into code, README or UI.
- The model reflects what was said in the record, not what was built. Do not word UI text as verified reality.
- Say "not found" instead of filling a gap.

## Scope
- **MUST:** the seven loop steps on one floor, flat view, labelled synthetic chat (about 200 messages), labelled test set with measured results, README with one start command.
- **NICE:** voice replies, a query endpoint for agents or robots.
- **KILL (do not build, even if asked casually):** photo checks, stale-drawing flag, real BIM/IFC files, real WhatsApp or Procore integration, auth, multiple buildings, polished 3D.

## When unsure
Ask one short question instead of guessing when the task touches `contracts/`, the demo script, or another owner's directory. Otherwise pick the simplest option that keeps `npm run demo` green and note the choice in `docs/decisions.md`.
