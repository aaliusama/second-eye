# Frontend guide (web/)

Read this before any task in `web/`. Root rules in `/AGENTS.md` still apply (frozen contracts, scope, honesty).
The frontend has one job: make a judge see a mistake before it is built, within 90 seconds.

## Stack (ASSUMPTION, confirm with the web owner)
React + TypeScript + Vite, `three` with `@react-three/fiber` (R3F) and `@react-three/drei`, `zustand` for state, WebGL renderer (not WebGPU: fewer surprises on a demo laptop). Check `web/package.json` for the installed versions and use only APIs that exist in them.

## Reference repositories
Clone these once into `.refs/` (gitignored) so you can read real code instead of guessing:
`git clone --depth 1 <url> .refs/<name>`

| Repo | Read it for |
|---|---|
| `pmndrs/react-three-fiber` | `docs/advanced/pitfalls` and `scaling-performance`: the rules in "3D rules" below come from here |
| `pmndrs/drei` | `CameraControls`, `Edges`, `Line`, `Html`, `Bounds`, `Outlines`: use these before writing your own |
| `yomotsu/camera-controls` | smooth camera moves: `setLookAt`, `fitToBox`, awaitable transitions |
| `pascalorg/editor` | a real 3D building editor in R3F: how walls, slabs and zones are generated from a node schema, zustand scene store, registry from data node to 3D object (`packages/core`, `packages/viewer`) |
| `pmndrs/zustand` | selectors and transient `subscribe` for values that change every frame |
| `pmndrs/maath` | `easing.damp` family for frame-rate independent smoothing |
| `emalorenzo/three-agent-skills` | `r3f-best-practices`: a rule set written for coding agents |
| `anthropics/skills` | `skills/frontend-design`: how to avoid generic generated UI |
| `vercel-labs/web-interface-guidelines` | checklist for focus, forms, motion, accessibility |

Use them for patterns, not for copy-paste. Pascal uses WebGPU and Next.js; do not import its setup. Every dependency you add goes in the README with its licence.

## Skills to install (one person installs, commits `.claude/skills/`, everyone pulls)
Install pattern: `npx skills add <owner>/<repo> --skill <name> --agent claude-code`. Check each README for the exact command, and read a skill before installing it: a skill is instructions the agent will follow.

| Skill | Repo | Use it when |
|---|---|---|
| `frontend-design` | `anthropics/skills` | starting any new screen or component |
| `emil-design-eng`, `animate`, `review-animations` | `emilkowalski/skills` | building or reviewing any motion; run `review-animations` on the ghost reveal before calling it done |
| `r3f-best-practices` | `emalorenzo/three-agent-skills` | writing or reviewing anything inside `<Canvas>` |
| `threejs-fundamentals`, `threejs-lighting`, `threejs-materials`, `threejs-interaction` | `CloudAI-X/threejs-skills` | scene setup, lights and shadows, materials, picking |
| `web-design-guidelines` | `vercel-labs/agent-skills` | final audit of a finished screen |
| `design-taste-frontend` | `Leonxlnx/taste-skill` | optional second opinion on layout and spacing |

Order for every frontend feature: (1) read the tokens and `docs/demo-script.md`, (2) build with the matching skill, (3) review motion with `review-animations`, (4) audit with `web-design-guidelines`, (5) look at a screenshot.
**The tokens and drawing conventions in this file override any skill's own style.** Skills supply craft, not a new look. Do not install more design skills than these; conflicting style advice produces a mixed result.

## Design direction (PROPOSAL, confirm once, then do not drift)
The visual language is a **construction drawing that came alive**, not a SaaS dashboard. Drafting conventions carry the meaning, so nothing is decoration.

Tokens (define once in `web/src/tokens.ts` and as CSS variables; never hard-code a colour or size elsewhere):

| Token | Value | Use |
|---|---|---|
| `paper` | `#EEF1F2` | background; light on purpose, it survives a projector |
| `ink` | `#1C2B3A` | lines, text, built elements |
| `ink-soft` | `#6B7A88` | secondary text, planned elements |
| `redline` | `#D4281C` | ghost and conflict ONLY. Never for buttons, badges or branding |
| `clear` | `#1F8A4C` | a check that passed, a clash that was fixed |
| `pending` | `#E0A100` | proposed or unconfirmed |

Type: one family, **Archivo** (variable width axis), self-hosted with `@fontsource-variable/archivo` so the demo works offline. Condensed width for labels inside the drawing, normal width for the interface. Numbers use `font-variant-numeric: tabular-nums`. No second typeface, no monospace for data.

Element states use drafting conventions, and always shape as well as colour:

| State | Drawn as |
|---|---|
| `planned` | thin `ink-soft` outline, no fill |
| `proposed` | dashed `pending` outline |
| `approved` | solid `ink` outline |
| `built` | solid `ink` fill |
| `unconfirmed` | `pending` diagonal hatch |
| `conflict` | `redline` outline, element pulses once then holds |
| ghost | translucent `redline` volume with dashed edges, offset from the true element, joined to it by a dimension line showing the difference ("2 ft east") |

Crews get a letter badge and a hue from one muted set in `tokens.ts`; the letter must be enough without the colour.

Layout: the model is the page.
```
+--------------------------------------------+-----------------+
|                                            | Needs approval  |
|        MODEL (3D or flat, >= 65% width)    | (queue, newest  |
|                                            |  on top)        |
|  [Flat | 3D]              Simulated site data  |             |
+--------------------------------------------+-----------------+
| Today 07:00 ----o--------------- Tomorrow 17:00   crew lanes |
+--------------------------------------------------------------+
```
The crew phone is its own route, `/phone`, sized for a real phone a judge can hold, plus a small inset on the main screen.

## Do not produce generic generated UI
Never use: purple or blue gradient washes, glassmorphism, a grid of identical rounded cards with soft grey shadows, an all-caps tracked label above every heading, emoji as icons, a trailing arrow on buttons, a dark near-black theme with one neon accent, a fade-and-slide-up entrance on every panel, hover animations on everything, a chat window as the main view.
Before finishing a UI task, ask: if this screenshot had no logo, would it look like any other dashboard? If yes, remove decoration until only the drawing conventions remain.

## Motion
- Spend motion in one place: **the ghost reveal**. Sequence: camera eases to frame the element (600 ms), true element outline draws, ghost volume grows from the true position to the wrong one (500 ms, ease-out), dimension line and label appear, then everything holds still. Nothing else on screen moves during it.
- All other motion answers a user action (approve, scrub, switch view) and lasts 150-250 ms.
- Rehearsal playback is a pure function of replay time `t`. Scrubbing the slider to the same `t` must always draw the same frame. No timers or wall-clock inside scene components.
- Respect `prefers-reduced-motion`: jump to the end state.

## 3D rules (from the R3F pitfalls docs)
- Never call `setState` inside `useFrame`. Mutate refs. Read fast-changing values with `store.getState()` or a transient `subscribe`.
- Create geometries and materials once and share them. One material per state, defined in one file.
- Do not mount and unmount meshes to show or hide them. Toggle `visible`. Use instancing for repeated fixtures.
- No `new THREE.Vector3()` or `.clone()` inside `useFrame`. Reuse module-level temporaries.
- `<Canvas frameloop="demand">` and call `invalidate()` on change, so an idle scene costs nothing. Switch to continuous only while an animation runs.
- Select from zustand with narrow selectors so a chat message does not re-render the scene.
- Use drei `CameraControls` for every camera move; never set `camera.position` directly.
- Build the floor as a cut-away architectural model: walls at about 1.2 m so rooms are visible from above, matte white surfaces, `ink` edges with drei `Edges`.
- **Premium comes from light, depth and camera work, not from effects.** The whole budget is these five things, done well: (1) one soft key light with soft shadows plus gentle ambient occlusion so the model reads as a physical object, (2) a drafting ground plane with a fine grid and lettered and numbered gridline bubbles, (3) an opening camera move that settles on the floor once, at load, (4) hover and selection outlines that respond within one frame, (5) the ghost reveal. Tune each until it looks deliberate.
- Still not allowed: textures, HDR environment maps, bloom, depth of field, imported furniture models, particles. Photoreal 3D is on the KILL list.
- The scene is rendered from the scene JSON in `contracts/` and nothing else. One function maps a scene element to its mesh props; both views use it.
- The flat view is SVG, not WebGL. It must work if WebGL fails.
- Target 60 fps on a laptop without a discrete GPU. If a change drops it, undo the change.

## Feature notes
- **Element inspector:** clicking an element shows its history as a short list (who, what, when) with the source message quoted. No source, no row.
- **Approval queue:** each item states the problem, proposed fix and an action named for what it does. Sending a latest-change correction leaves the risk open and amber; only an explicit reply for the current revision triggers the confirmation/recheck flow. Never turn a geometry risk green just because a message was sent.
- **Time slider:** crew lanes below it show who is where; a clash marks the slider track in `redline` at that time, so the problem is visible before scrubbing.
- **Phone:** a plain message thread. Replies from the system lead with HOLD or CLEAR, then one reason, then the source.
- **Label:** "Simulated site data" stays visible on every view.

## Words on screen
Sentence case. Plain verbs. Name things as a superintendent would ("Unit 3 east wall", not "W3-2" alone or "element"). One name per action through the whole flow. Errors say what happened and what to do; they do not apologise. Wording never claims the model shows verified reality: say "per the record".

## Done means
1. `npm run demo` still runs and the ghost reveal plays from the golden replay.
2. You looked at a screenshot of the result (flat and 3D) and checked it against the tokens and the generic-UI list.
3. Keyboard focus is visible, and reduced motion works.
4. No new colour, font, shadow or radius outside `tokens.ts`.
