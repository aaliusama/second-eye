# Second Eye — project copy

Prepared for review. This file does not update GitHub settings or submit an entry.

## Repository description

Construction coordination intelligence: turn crew messages into a versioned spatial record, detect conflicting plans with deterministic checks, and track corrections through revision-specific confirmation.

## Professional project description

Second Eye is a construction coordination prototype that transforms site communications into a traceable model of one floor. It combines language-model extraction with deterministic spatial and scheduling checks to identify discrepancies between crew intent and the latest project record. Source-linked findings, measured geometry and dependency analysis help superintendents inspect risks and coordinate corrections before work begins.

The system maintains a versioned scene, exposes the evidence behind each finding, and tracks corrections through explicit confirmation of the relevant revision. A React workspace, crew phone interface and read-only MCP server share the same underlying record. The prepared demonstration runs offline using cached extraction and simulated site data; optional live extraction supports new wording. It does not verify physical construction or certify site safety.

## One sentence

Second Eye shows a construction superintendent where tomorrow's crew plans disagree with the latest site record, before work starts.

## Short pitch

A wall moves in the office chat. The plumber still plans from the old line. Second Eye puts both versions on the floor plan and reveals the difference as a red ghost wall—with the messages that explain it. The superintendent reviews a correction, sends it, and tracks the crew's confirmation of that exact revision. The same engine checks plans as crews state them and again the evening before. This hackathon prototype uses simulated site data; it checks the record, not the physical building.

## Submission overview

Construction changes travel through different conversations. The latest instruction may reach the office while the crew's plan still depends on an older version. Second Eye makes that information gap visible at the place where work is about to happen.

Messages update a sourced model of one floor. Four rule-based checks compare intended work with recorded changes, shared work areas, prerequisites and open decisions. A red ghost wall exposes a conflicting line; measured geometry and a “How it decided” trace let the superintendent inspect the evidence. Tomorrow's timeline shows dependencies and which crews a delay would block.

The correction loop keeps human review explicit: approve a message, wait for a simulated crew confirmation of the current revision, then recheck the record. Stored location corrections help the next run understand the same nickname. Web, phone and a read-only agent interface use the same underlying record.

The prepared demonstration runs offline without an API key. Live language-model extraction is optional. The golden evaluation detects 15 of 15 labelled risks with no false alarms, while the third challenge run detects 9 of 14 with two false alarms. Both datasets are synthetic; the challenge rerun is not an unseen benchmark. These results show a working demonstration and remaining extraction gaps, not field performance or guaranteed savings.

## Suggested repository topics

`construction-tech`, `spatial-context`, `crew-coordination`, `typescript`, `react`, `threejs`, `mcp`, `hackathon`

## Links and submission fields

| Field | Prepared value / status |
|---|---|
| Name | Second Eye |
| Tagline | See tomorrow's mistake before it gets built. |
| Track | Talona — Context for the Physical World |
| Demo | https://site-rehearsal.onrender.com |
| Pitch deck | [PDF](deck/deck.pdf) |
| Setup | `npm install`, then `npm run demo` |
| Detailed submission draft | [submission.md](submission.md) |
| Final shareable video | Not found in the submission draft; confirm the selected recording and link |
| Organizer-confirmed submission destination | Not found in the submission draft |
| Team eligibility and judge access | Confirm before submitting |

Use the existing [demo script](demo-script.md) for the presentation. This copy does not replace its timings or claim that submission is complete.
