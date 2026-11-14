# Premium UI pass: design direction

> **Update 14 Nov, afternoon: the dark theme was rejected.** It did not fit the superintendent we design for. The light construction-drawing palette in `web/AGENTS.md` and `web/src/tokens.ts` is the theme. The "Ground", "Ink" and HUD glass colour values below are retired; meaning colours use the light tokens (`redline`, `pending`, `clear`). Persona, typography, dimension-line signature, motion and anti-slop rules still apply.

14 Nov 2026, branch `ui/premium-pass`. Every web agent on this pass follows this file. It refines `web/AGENTS.md` for a dark theme; drafting conventions there still hold.

## Who we design for

A superintendent on a multi-trade fit-out floor, 06:30, phone and coffee, ten minutes before crews arrive (`docs/SITE_MANAGER_PAIN.md`). Practical, plain-spoken, accountable when a crew builds on old information. Distrusts dashboards and anything that looks like marketing. Wants one answer: **what must I resolve before this crew starts, and who do I tell?** Then: "I sent it, but did they see it?"

## Who judges it

Talona (talona.ai): two engineer founders who "know construction from the inside", build "the agent a superintendent texts at 6 am", and write plain, confident, honest copy ("Catch every change before it costs you", "The record holds what people share. It cannot verify work that nobody documented."). They will reward precision and honesty, and punish fluff.

## The look: a drafting table at night

A precise field instrument, not a SaaS template. Think surveyor's equipment, aircraft instrument panel, an architect's drawing set reversed out on dark. Premium comes from restraint and exactness, not effects.

- **Ground:** `#090D16`, faint drafting grid (dots or 1px lines at ~4% white) on the plan canvas only. Panels one step up (`#0F1522`, `#151C2B`). Hairline rules `rgba(255,255,255,0.08)`.
- **Ink:** text `#E6EAF0`, secondary `#94A3B8`. Contrast at least 4.5:1 for all text.
- **Meaning colours, never decoration:** conflict and ghost `#EF4444`; sent / unconfirmed / open decision `#F59E0B`; confirmed / clear `#10B981`. Red appears only where something is wrong. A screen with no conflict has no red.
- **Type:** Archivo only (already self-hosted). Interface at normal width; labels, kickers and dimension text in condensed width, uppercase, letter-spacing 0.06–0.1em, small. Big numbers (0.40 m, counts, times) large, tabular-nums, tight. Clear hierarchy: one display line per screen.
- **Signature element:** the dimension line. Distances drawn as drafting dimensions (ticks, extension lines, the value), on the plan and echoed in cards. This is our visual identity, use it consistently.
- **Shape:** small radii (4–6 px), 1px borders, almost no shadows except floating HUD panels over the canvas (glass: `rgba(15,23,42,0.8)`, `backdrop-filter: blur(12px)`, 1px `rgba(255,255,255,0.1)` border).
- **Motion:** purposeful and short (150–250 ms, ease-out). The ghost pulses to draw the eye, then settles; lists glide when they change; amber to green transitions when a confirmation lands. Nothing loops forever except a very subtle glow on an active, unresolved ghost. Respect `prefers-reduced-motion`.
- **Icons:** `lucide-react`, 16 px, stroke 1.5, only where they speed recognition (phone, check, alert, clock, source). Never decorative.

## Anti-slop rules (reject on sight)

No purple or blue-violet gradients, no gradient text, no neon glow on everything, no emoji, no rounded 16–24 px card soup with drop shadows, no glassmorphism on regular panels (HUD only), no "AI sparkle" icons, no lorem-style marketing copy, no centred hero blocks inside the tool, no fake numbers. Words stay in site language: place, crew, task, time, before system words.

## Honesty that must survive the restyle

"Simulated site data" visible on every screen. Confidence numbers visible. Sent is visibly different from confirmed; confirmed means received, not work done. Missing values say "not found".

## Process for each agent

Invoke the `frontend-design:frontend-design` skill before building. Read `web/src/tokens.ts` and use `var(--…)` tokens for neutrals. Take a screenshot of your screen, look at it critically against this file, fix, repeat once.
