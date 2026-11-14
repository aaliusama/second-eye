# README refresh and readiness review

14 November 2026. Reviewed local branch `win/integration` after pulling `origin/main` at `946b998`. Nothing pushed or submitted in this pass.

## Delivered

- README now opens with the site problem and a plain-language ghost-wall story, followed by the correction loop, product screenshot, guided tour and local setup. Technical geometry and graph detail remains available in a disclosure.
- Added an original four-panel animation, labelled as an explanatory illustration rather than a product recording. It plays once, has descriptive alternative text and links to a still. Source: `docs/assets/readme/build-story.ps1`; rebuilding requires Windows System.Drawing and ffmpeg.
- Added reusable repository description, short pitch, submission overview and metadata in [project-description.md](project-description.md).
- Removed unsupported competitor generalizations and clarified that thread access is a proxy, the floor starts from seeded geometry, and rehearsal is not construction physics.

## Repository update

Fetched remote branches and fast-forwarded this working branch by 51 commits to `946b998`. No remote branch was changed. Historical status notes saying the geometry/graph/story work is unmerged are superseded by this commit's ancestry.

The pull's automatic restoration of old phone edits conflicted with the newer phone code. Retained the complete upstream phone and styles, which already implement confirmation cards, and preserved the original edits in autostash `0dafcd0` (`git stash list` / `git stash show -p 0dafcd0`). Do not blindly reapply it: it duplicates state and confirmation handlers in the newer implementation. Existing untracked `data/challenge/llm-cache-run4/` and `video/film/` were left intact.

## What remains

| Priority | Item | Evidence / next action |
|---|---|---|
| Release | Select the final revision and rehearse it on the presentation machine | Automated checks below pass after installing the pulled dependencies. A fresh `npm run demo` start and human-paced visual rehearsal were not repeated in this pass. |
| Submission | Confirm the final video and shareable URL | The latest story handoff reports a recorded, frame-reviewed twelve-beat take. This pass did not review that take; `docs/submission.md` still has no final video URL. Confirm the artifact instead of assuming no recording exists. |
| Submission | Confirm destination, team eligibility and judge access | These remain unverified in the submission draft. No submission or organizer contact was performed. |
| Evidence | Finish and score any fourth challenge run | An untracked run-4 cache exists, but no corresponding tracked evaluation report was found. Do not publish a run-4 score from cache presence alone. |
| Product | Improve unfamiliar-message extraction | The retained third challenge report has 9 caught, 5 missed and 2 false alarms. Live observations also include rate limits and extraction failures; see `live-latency.md`. |
| Documentation | Reconcile older handoffs and submission results | `TEAM.md` and older status sections still describe earlier revisions; the submission draft quotes challenge run 2 while the README links run 3. Use current code/reports as evidence. |
| Validation | Obtain practitioner feedback | A one-floor shadow-mode trial is a proposal, not a customer deployment. No verified feedback or impact measurement was found in this review. |

## Validation in this pass

- Installed the dependencies already declared by the pulled commits; no package manifest or lockfile changes.
- Typecheck passed; 392 root unit tests, 24 HTTP demo tests and 35 MCP tests passed.
- Web production build passed, with bundle-size warnings for the main and optional 3D chunks.
- Golden evaluation rerun: **15 caught, 0 missed, 0 false alarms**; live alone 14, rehearsal 15. Tracked result files unchanged.
- Animation exported at 1200 × 520; still visually inspected for legibility and clipping. Asset sizes are approximately 50 KB GIF and 30 KB PNG.
- Local links/assets in all three edited documents resolve; `git diff --check` passed. GitHub rendering and hosted-demo availability were not rechecked.
- No live extraction, final recording review or external submission performed.

This is a documentation/readiness pass, not a claim that every release gate or deployed screen was revalidated.
