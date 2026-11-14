# Designing for the person who lives this pain

14 November 2026. This replaces `SPAIN_FIELD_RESEARCH.md`. The user asked us to design for the person *who lives this pain*; that request was misheard as "who lives in Spain". There is no geographic persona. Nothing here comes from interviews or field validation; it is a design hypothesis drawn from the challenge brief and the product's own loop.

## The person

A superintendent (site manager) on a multi-trade fit-out floor. Several crews work from what they last heard in a group chat, a DM, a drawing revision or a morning talk. The superintendent is accountable when a crew builds against old information, and they find out only when the work is already in place.

## The morning that hurts

- 06:30, before the crews arrive. The superintendent has a phone, a coffee and about ten minutes.
- Yesterday the architect moved a wall 0.4 m. The plumbers were not in that thread. They will rough in against the old line at 07:00.
- The superintendent does not need another dashboard. They need one answer: **what must I resolve before this crew starts, and who do I tell?**
- Afterwards, the risk they carry is "I sent it, but did they see it?" Sent is not heard.

## What that person needs from the screen, in order

1. **Where, who, what.** A place they recognise (Unit 204 bathroom), the crew (Novak Plumbing) and the planned task (rough-in tomorrow morning), before any system vocabulary such as "finding", "operation" or a wall id.
2. **Why, in one picture.** The line the crew last heard and the line now on record, with the distance between them. Motion explains the change once, then stops.
3. **Proof at the moment of doubt.** The original message, sender and time, one tap away and next to the decision, not in a separate log.
4. **One action.** "Send correction to Novak Plumbing", with the exact message visible before it is sent.
5. **Closure they can trust.** Sent (amber, still held) is clearly different from confirmed (crew reply on record, rechecked). Neither claims the work was inspected or done.
6. **Nothing else shouting.** Other risks wait in a short, ordered list; the record and learning live one step away.

## Design consequences in the current build

| Need | In the UI |
|---|---|
| Lead with one decision | "Before work starts" list: at most three incidents, holds first, each led by place, crew and plain-language title |
| Why in one picture | Ghost on the plan with dimension; Earlier / Compare / Latest toggle shows each recorded position on its own |
| Proof beside the decision | Evidence disclosure quotes source messages with sender, place and time |
| One action | Primary button names the crew: "Send correction to …" |
| Sent is not confirmed | Amber "Reply or recheck pending" state; confirmations disclosure says "Sent is not confirmed" |
| Calm by default | Crew plan lanes folded under the timeline; crew chat docked in its own desk tab instead of floating over the plan |

## Limits

Do not present this person as an interviewed user, a pilot or a validated persona. Do not attach savings, deadlines or durations the record does not contain. A real test would ask a superintendent to explain the ghost in their own words, find its source, and tell sent from confirmed.
