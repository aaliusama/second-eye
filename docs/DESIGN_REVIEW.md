# README and site desk design pass

14 November 2026. Presentation changes only; extraction, checks and confirmation contracts are unchanged.

## Direction and choices

An architectural working drawing with a superintendent's desk alongside it. Keep the existing paper/ink/redline language and self-hosted Archivo; add a white desk surface, stronger type hierarchy and more deliberate spacing. Red remains reserved for conflicts. No decorative gradients, stock imagery, new dependencies or animation library.

The plan is the primary workspace. Today contains the huddle and decisions; Record contains sheets, activity, messages and evaluation; Learning contains location corrections and reversible reviews. Supporting tools remain mounted, so switching sections does not erase an in-progress form. Presenter focus opens the appropriate desk section. During the ghost/why beats, the desk explains the two positions instead of showing unrelated risks.

The full floor is visible on ordinary startup. Presenter story framing and selected-detail framing remain available. Huddle source metadata is disclosed on request. Confirmation is separately expandable and opens automatically during Send/Confirm. Sending remains amber; explicit confirmation rechecks the record.

README leads with the problem and an actual app screenshot, then runnable entry points, correction loop, honest evaluation evidence and architecture. Advanced configuration is folded away. There is no unverified video link, invented badge, promised score or new integration claim.

## Sources applied

- [GitHub README guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes): purpose, getting started and deeper documentation links.
- [Excalidraw repository](https://github.com/excalidraw/excalidraw) and [xyflow repository](https://github.com/xyflow/xyflow): product-first README presentation and clear paths to usage/docs. These are examples, not a claim that a repository has an objectively best design.
- [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md): subject-specific visual language, hierarchy and restraint. Applied with the repository's existing drawing conventions taking priority.
- [Vercel interface guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md): native controls, visible focus, skip navigation, mobile overflow, reduced motion and clear action labels.
- [Emil Kowalski motion review](https://github.com/emilkowalski/skills/tree/main/skills/review-animations): retain explanatory motion and avoid repeated decorative entrances. Read the accompanying standards; no third-party code or skill package was installed.

## Motion review

| Before | After | Why |
|---|---|---|
| Ordinary startup zoomed into a ghost, cropping the floor | Full floor on ordinary startup; detail/story framing is intentional | Preserve spatial context before asking the user to inspect a risk |
| Existing ghost sequence | Retained: frame, true outline, ghost offset, dimension, then still | Motion explains the geometric mismatch rather than decorate the workspace |
| Potential tab/panel entrance effects | Instant section switching; no animated list cascade | Repeated navigation should not delay work |

Verdict for this pass: approve the restrained motion changes. No claim of a measured frame-rate benchmark. Existing reduced-motion handling jumps the ghost to its final state; the interface does not introduce new moving effects.

## Verification and continuation

- 311 root tests and 24 HTTP demo tests pass; typecheck and web build pass. Existing optional 3D bundle-size warning remains.
- Headless Edge exercised all eleven presenter beats without page errors. Screenshots are in `docs/assets/design-review/`; this is a visual smoke run, not a reviewed three-minute recording.
- Inspected desktop flat view, ghost, pending receipt, confirmed receipt, 3D, mobile workspace and phone. A long alert-select overflow was found and fixed; 390px viewport horizontal overflow check passes.
- Reduced-motion browser emulation was checked; ghost framing remains stable after state settles. Native keyboard-focus styling and section buttons remain available.
- Preview launched on API 8795 / web 5178 with live calls off and no persistent learning file, isolated from other demo processes.

Claude: preserve the section navigation and the confirmation distinction. Keep backend/extraction evaluation work independent. On any presenter change, rerun the eleven beats and verify the intended section becomes visible. Remaining work includes a human-paced video review, real-device touch testing and resolving challenge-set extraction failures; these are not completed by visual polish.
