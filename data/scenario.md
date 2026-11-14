# Scenario: Level 2, units 201-206

Owner: B. **Simulated site data.** Every name, message and drawing below is made up.
This sheet is the source for `data/chat.json`, `data/replay.golden.json`, `data/llm-cache/` and `data/labels.json`.
The labels were written from this sheet before the checks were run on the data.

## The floor

One floor of a multifamily building. A corridor runs east-west (y 0-2 m); six units sit north of it, 5 m wide each (y 2-10 m).
Units from west to east: 201 (x 0-5), 202, 203, 204, 205, 206 (x 25-30). Units: metres, x east, y north.

| Id | What | Start (drawing rev B) |
|---|---|---|
| `corridor` | Level 2 corridor | built |
| `room-201` ... `room-206` | Unit 201 ... Unit 206 | approved |
| `W-02`, `W-05`, `W-08`, `W-11`, `W-15`, `W-18` | corridor wall of unit 201, 202, 203, 204, 205, 206 | planned (studs, not closed) |
| `W-03` | Unit 201 bathroom east wall, x = 3 | approved |
| `W-12` | Unit 204 bathroom east wall, x = 18 | approved |
| `W-16` | Unit 205 bathroom east wall, x = 23 | approved |
| `W-21` | Unit 206 kitchen partition, y = 6 | approved |
| `W-22` | Unit 206 living room niche wall, y = 8 | approved |
| `tile-205-bath` | Unit 205 bathroom floor tile | planned |
| `light-202-kitchen` | Unit 202 kitchen light fixtures | planned |
| `vanity-203` | Unit 203 bathroom vanity | planned |
| `light-206-bath` | Unit 206 bathroom light | planned |
| `paint-206-living` | Unit 206 living room paint colour | planned |
| `vanity-204` | Unit 204 vanity (the reason for Rev C) | approved |
| `socket-204-shaver` | Unit 204 shaver socket, on the west face of W-12 | planned |
| `tile-204-shower` | Unit 204 shower tile, set out off W-12 | planned |
| `window-204` | Unit 204 living room window, north facade | approved |
| `door-204` | Unit 204 entrance door (the blue door sample) | built |

No unit starts with a nickname (the corridor carries its drawing name "corridor" as an alias, nothing more). Crews call Unit 204 "the blue room" (its door was painted blue as a sample); the record has to learn that.

## Crews and threads

A crew hears a change only if it was said in a thread it reads (or in a DM to it).

| Crew | Lead | Reads |
|---|---|---|
| `crew-plumbing` Novak Plumbing (P) | Marek | site-group |
| `crew-drywall` Walsh Drywall (D) | Sean | site-group |
| `crew-electrical` Brandt Electric (E) | Jonas | site-group |
| `crew-painting` Kovac Painting (A) | Ivana | site-group, office |
| `crew-tiling` Sorel Tiling (T) | Luca | site-group |

Others: Dana Pierce (superintendent, site-group), Lena Hofer (architect, office), Priya Shah (project office, office).

## Timeline

Chat runs Thursday 12 Nov and Friday 13 Nov 2026. Thursday's statements plan Friday; Friday's plan Saturday.
Evening rehearsals: Thu 20:00 plays Friday, Fri 20:00 plays Saturday.

## Planted cases (labelled)

Each row is one labelled case in `data/labels.json`. "Trigger" is the message key in `data/build/source.ts`.

| Case | Check | Day | What happens | Trigger |
|---|---|---|---|---|
| **LC1** | latest change | Sat | **The ghost wall.** Thu 14:02, office: the architect moves W-12 40 cm east (Rev C). Plumbing reads only site-group. Fri 17:40 plumbing: rough-in in the 204 bath along the east wall on Saturday morning. | `m-002` |
| LC2 | latest change | Fri | Thu 10:15, office: W-21 (206 kitchen partition) moves 30 cm north. Electrical plans the 206 kitchen circuits along it on Friday afternoon. | `lc2-elec` |
| LC3 | latest change | Fri | Thu 11:00, DM to drywall: W-03 (201 bath east wall) shifts 25 cm west. Plumbing plans the 201 bath supply lines along that wall on Friday afternoon. | `lc3-plumb` |
| LC4 | latest change | Fri | Thu 09:40, office: W-05 (202 corridor wall) moves 10 cm north. Drywall plans to close that wall on Friday afternoon. | `ow2-close` |
| SC1 | space clash | Sat | Electrical and painting both plan Unit 206 on Saturday morning. | `sc1-paint` |
| SC2 | space clash | Fri | Plumbing and electrical both plan rough-in in Unit 202 on Friday morning. | `sc2-elec` |
| SC3 | space clash | Sat | Drywall layout and electrical rough-in both in Unit 201 on Saturday afternoon. | `sc3-elec` |
| SC4 | space clash | Fri | Painting and tiling (measuring up) both in Unit 203 on Friday afternoon. | `sc4-tile` |
| OW1 | order of work | Sat | Drywall plans to close the 203 corridor wall (W-08) Saturday morning; the plumbing inspection for 203 is booked Saturday afternoon. | `ow1-close` |
| OW2 | order of work | Fri | Drywall plans to close the 202 corridor wall (W-05) Friday afternoon; no inspection for 202 is on record at all. | `ow2-close` |
| OW3 | order of work | Fri | Painting plans 205 on Friday morning; drywall finishes 205 on Friday afternoon. Paint before finish. | `ow3-paint` |
| OD1 | open decision | Sat | The 205 bath tile is only proposed (Thu, office). Tiling plans to start it Saturday, full day. | `od1-tile` |
| OD2 | open decision | Sat | The 202 kitchen light fixtures are only proposed. Electrical plans to hang them Saturday morning. | `od2-elec` |
| OD3 | open decision | Fri | The 203 vanity is only proposed. Plumbing plans to set it Friday morning. | `od3-plumb` |
| OD4 | open decision | Sat | The 206 living room paint colour is only proposed. Painting plans 206 on Saturday morning (same message as SC1). | `sc1-paint` |
| LC5 | latest change | Sat | Same Rev C move of W-12 as LC1. Electrical reads only site-group. Fri 19:20 electrical: the 204 shaver socket on the bathroom east wall, Saturday afternoon. | `lc5-elec` |
| LC6 | latest change | Sat | Same Rev C move of W-12. Tiling reads only site-group. Fri 19:31 tiling: the 204 shower tile, working off the east wall, Saturday afternoon. | `lc6-tile` |
| SC5 | space clash | Sat | Electrical and tiling both work the 204 bathroom east wall on Saturday afternoon. | `lc6-tile` |

Unit 204 in depth: one office change (Rev C) reaches three trades who never read the office thread. Plumbing (morning) is the scripted ghost wall; electrical and tiling (afternoon) show the same ghost from their side. Tiling after the plumbing rough-in is the right order, so no order-of-work finding there. The 204 messages are the last of Friday so earlier message ids and their LLM cache entries do not move; their cache entries are hand-written.

## Planted non-cases (no finding expected)

These measure false alarms. A finding on any of them counts against us.

| Key | Why nothing is wrong |
|---|---|
| `n-insp-206`, `n-close-206` | 206 plumbing inspection is Friday morning, drywall closes the 206 corridor wall Saturday afternoon. Right order. |
| `n-w22`, `sc1-paint` | W-22 moved in the office thread, but painting reads office: painting heard it. |
| `n-w16`, `od1-tile` | W-16 moved in site-group: tiling heard it. (The tile itself is still an open decision: that is OD1, not a latest-change.) |
| `n-light206-approve`, `n-light206` | The 206 bath light was proposed, then approved before electrical plans to hang it. |
| `n-tile-201` | Tiling plans the 201 bath Saturday morning, after plumbing's Friday afternoon rough-in there. |
| `n-tile-stage` | Tiling stages material in the corridor Friday morning. Nobody else is there. |
| Phone `blueRoom` | Run 2: drywall boards Unit 204 Saturday afternoon. Plumbing is there in the morning only. |

Plus about 150 everyday messages (deliveries, lift, weather, safety, banter) that carry no plan at all.

## Learning: "the blue room"

Run 1: drywall texts from the phone that it boards "the blue room" tomorrow afternoon. The record has no such place, so the intent has no place and goes to the superintendent as unresolved (never guessed).
The superintendent maps it to Unit 204 once. Run 2: the same words resolve to Unit 204 on their own.
The golden replay never states a plan in "the blue room"; two everyday messages mention it in passing, so the nickname reads as real site talk.

## Phone script

The presenter types only these texts (exact words; the cache key comes from the words and the crew).

| Beat | Crew | Text |
|---|---|---|
| 3 Ghost wall | Novak Plumbing (`crew-plumbing`) | `tomorrow morning we rough in the 204 bath along the east wall` |
| 7 Ask | Novak Plumbing (`crew-plumbing`) | `can we start the 204 bath tomorrow morning?` (answered by `/api/ask`, lane E) |
| 8 Learn, 9 Run 2 | Walsh Drywall (`crew-drywall`) | `tmrw afternoon we start boarding the blue room, ceiling first` |

## How the files are made

1. `npx tsx data/build/build.ts` writes `floor.json`, `chat.json`, `replay.golden.json`, `labels.json` and the hand-written expected extraction `expected/<id>.json` from `data/build/source.ts`. It fills `llm-cache/` with the expectation only where no LLM entry exists yet, so the demo runs offline before the live run.
2. `npx tsx server/extract/build-cache.ts [--force]` (needs `GROQ_API_KEY` in `.env`) sends every replay message and phone text to Groq in batches of 8, in time order, and writes `llm-cache/<id>.json`. Each entry keeps `provenance` ("llm: groq <model>") and the model's raw `facts`. It then compares the LLM output with `expected/` and writes `extraction-report.json`.

To refresh specific omissions without rerunning the whole chat, use `node --import tsx server/extract/build-cache.ts --force --only=m-043,m-177`. Only those entries are sent to Groq and rewritten; the builder still advances the scene through the existing record and regenerates the comparison report. Unknown requested ids fail before any model call. Never copy `expected/` into an LLM-labelled cache entry.

The demo reads only `llm-cache/`. Check `provenance` in any entry to see whether it came from the LLM or by hand.
