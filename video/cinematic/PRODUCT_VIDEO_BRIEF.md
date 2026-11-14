# Product video brief: Second Eye

Taken from `AGENTS.md`, `docs/demo-script.md` and the running app on 14 Nov 2026. Nothing here is a new claim.

## The product

- **Name:** Second Eye.
- **Promise:** "See tomorrow's mistake before it gets built." It shows risks in the record, not what was built.
- **For:** a site superintendent preparing tomorrow's work, before 07:00.
- **Problem:** site decisions live in several group chats. A change said in one thread does not reach a crew that reads another, and that crew builds from the old position.
- **What it does:** it checks every crew's stated plan against one record of the floor, the moment they say it and the evening before, and proposes the correction.

## What the film shows, all of it in the app today

1. Chat messages become changes to one record of the floor; each keeps its source message.
2. The ghost wall: the Unit 204 bathroom east wall moved 0.4 m east in the office thread; three crews plan work from the old line. Earlier position, Compare and Latest record, in the flat plan and in 3D.
3. The floor as one crew knows it, and the table of who heard what.
4. How a finding was decided: the language model reads messages into facts, a fixed rule decides.
5. Tomorrow rehearsed: what must finish first, and the critical path.
6. One tap sends the correction; it stays open until the crew confirms that revision.
7. A crew asks a question and gets HOLD or CLEAR from the record, with sources.
8. A site nickname ("the blue room") is mapped once and resolved on the next run.
9. Measured results from `npm run eval`: 18 labelled cases, 18 caught, 0 missed, 0 false alarms, on a synthetic labelled scenario.

## Look

The app's own language: a construction drawing. Paper `#EEF1F2`, ink `#1C2B3A`, redline `#D4281C` for the ghost only, Archivo, the drafting dot field. Motion is one camera per scene and soft cuts; nothing flies in.

## Left out on purpose

- Savings, customer names, comparisons with other products: none exist.
- Any wording that the model shows verified reality.
- Sound. There is no licensed music in the repo.
