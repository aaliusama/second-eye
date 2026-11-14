# Pitch

Spoken scripts. Click-by-click steps live in `docs/demo-script.md`; the timings here match its eleven beats.
Numbers: say only what `npm run eval` (and, if used, the challenge report) printed on the day. `[[...]]` = fill from the final run.

## 3 minutes, Talona jury

**0:00 Problem (20 s)**
"Thursday 14:02 the architect moves a bathroom wall 40 centimetres. Rev C goes into the office thread. The plumbers aren't in that thread. Friday evening the plumbing lead writes in the site group: tomorrow morning we rough in the 204 bath along the east wall. Saturday they run pipe to a line that isn't there any more. Nobody did anything wrong, and on Monday someone pays for it. Everything you'll see is simulated site data, and it says so on every screen."

**0:20 Build (20 s)** *(the record as of Thursday 14:02, inspector on the wall)*
"Site Rehearsal reads the chats the site already uses. Every message becomes a change to one live record of the floor, and every change keeps the message it came from. This is the wall the architect moved, quoting him."

**0:40 Ghost wall (30 s)** *(phone sends the plumber's text)*
"Now the plumber sends his plan for tomorrow." *(Pause on the reveal.)*
"Red is where plumbing will measure from. Black is where the wall is, per the record. Forty centimetres. The phone already answered him: hold, with the reason and the source."

**1:10 Why (15 s)** *(inspector on the ghost)*
"Why? The change was said in the office thread, and plumbing doesn't read it. Two messages, both quoted. That's the whole case."

**1:25 Rehearse (20 s)** *(slider)*
"Every evening it plays tomorrow forward. Drywall plans to close a wall in 203 before the inspection. Electrical installs fixtures nobody has approved. The 06:30 huddle card puts the things you can't undo first: three, not thirty."

**1:45 Send (15 s)**
"One tap sends the correction. It doesn't go green. Sent isn't heard. It stays amber until the crew confirms this exact revision."

**2:00 Confirm (15 s)** *(simulated crew reply)*
"The crew replies. That reply is a message in the record, tied to revision 2 of this wall. If the wall moves again, this confirmation doesn't count. Now the record is rechecked. That proves the information arrived, not that the pipe is in the right place."

**2:15 Ask (10 s)**
"Crews text a question and get an answer from the record, with sources. Decisions still go to the superintendent."

**2:25 Learn and Run 2 (20 s)**
"Crews call 204 'the blue room'. The first time, the record doesn't guess. The superintendent maps it once. Next run, same words, it knows. Learning here is stored decisions you can see and undo, not a retrained model."

**2:45 Numbers and close (15 s)**
"On [[n]] simulated messages and [[cases]] labelled cases: [[caught]] caught, [[missed]] missed, [[false alarms]] false alarms. Live checking alone misses one; the evening rehearsal catches it. That's why there are two triggers. [[If the challenge set ran: On [[m]] cases we wrote after building it, read live: [[result]].]] The language model reads messages. Rules decide. See tomorrow's mistake before it gets built."

## 60 seconds, 16:00 finals (VCs, founders, tech leads)

"A building site runs on group chats. A decision made in one thread doesn't reach the crew in another. A 2018 PlanGrid and FMI survey of about 600 construction leaders attributed 48 percent of rework to poor communication and poor project information.

Site Rehearsal reads the chats the site already uses and keeps one record of the building: who said what, which revision, who has it. Every time a crew says what it will do tomorrow, we check it against that record. *(Ghost wall on screen.)* This red line is where the plumbers will measure from. The wall moved 40 centimetres on Thursday, in a thread they don't read. We show it the evening before.

The superintendent sends the correction with one tap, and it stays open until the crew confirms the exact revision. Every decision cites its message, so when the argument starts about who told whom, there's a receipt.

The language model only reads messages. Rules decide, so it's explainable and repeatable. On our simulated test set: [[caught]] of [[cases]] caught, [[false alarms]] false alarms. Built for Talona's users: superintendents at mid-size general contractors building multifamily housing."

## Questions we expect

- **Is this real data?** No. Simulated, labelled on every screen. Say so first.
- **What if a crew types something new?** `npm run demo:live` reads unseen text with the LLM; the recorded demo uses the cache so it is repeatable. [[Quote the live challenge result exactly, including misses.]]
- **How do you know who heard it?** Two bases, and we show which one: what the crew said about the sheet revision it holds ("we're on A-201 rev B"), otherwise which threads it reads. Reading a thread is a proxy, not proof.
- **Does confirmation mean it's safe?** No. It means the crew confirmed receiving the revision. Rechecking the record never certifies physical work.
- **Won't superintendents drown in alerts?** The huddle shows three, ranked by what can't be undone; a dismissal with a reason is stored for that exact incident and comes back if the evidence changes.
- **Robots and agents?** The same record is readable over MCP. "Clear" means no conflict found in the record, never permission to enter.

## Words to avoid

"revolutionary", "seamless", "AI-powered", "game changer", "real-time digital twin", "guarantees", any money saved, and any number not printed by `npm run eval`. Never say "the model shows what was built". Say "per the record".
