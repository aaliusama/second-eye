# Pitch

Spoken scripts. Click-by-click steps live in `docs/demo-script.md`; the 3-minute timings match its twelve beats.

**Numbers rule.** Say only numbers that `npm run eval` and `npm run eval:challenge` printed, as they appear in the README table, and check them against the Numbers beat on the day. All site data is simulated, so none of them are field results. Measured distances (0.40 m, 0.60 m) are what the checks compute on the simulated record; say "per the record". If the README table gains a row (a later challenge run), use that row with its own label; do not mix rows.

Numbers as of this revision (README table, `eval/results*.json`):

| Say | Source |
|---|---|
| Golden replay: 15 of 15 caught, 0 missed, 0 false alarms, 190 messages | `npm run eval`, development and regression set |
| Live checks alone catch 14 of 15; the evening rehearsal catches the last one | `eval/results.detail.json`, per trigger |
| Challenge, first run: 6 of 14 caught, 5 false alarms, 64 messages, written before its first run | `npm run eval:challenge` |
| Challenge, second run: 8 of 14, 4 false alarms, after a calendar-prompt fix: **not unseen** | `--run=2` |
| Challenge, third run: 9 of 14, 2 false alarms, after general extraction rules: **not unseen** | `--run=3` |

## 90 seconds

*(Presenter on beat 3, the ghost wall; advance with → as you speak.)*

"A building site runs on group chats. On Thursday the architect moves a bathroom wall 40 centimetres, in the office thread. The plumbers don't read that thread. On Friday evening they say: tomorrow we rough in along the east wall.

Second Eye keeps one sourced record of the floor from those chats. *(Ghost wall.)* When the plumber states his plan, it checks it against the record and draws this: red is where plumbing will measure from, black is the wall per the record. Per the record, their rough-in would leave a 40 centimetre gap.

*(Why.)* This is the floor as Novak Plumbing knows it: each crew hears only its own threads.

*(How it decided.)* And every alert shows how it was decided. The language model only reads messages into facts. Below this line it's rules, measured in metres: same record, same answer.

*(Rehearse.)* Every evening, tomorrow is played forward as a dependency graph. Here's the critical path, and drywall is booked to close a wall before its inspection.

One tap sends the correction, and it stays amber until the crew confirms that exact revision.

On our simulated scenario, 190 messages: 15 of 15 caught, no false alarms. On a separate set written before the first run, the first run caught 6 of 14, and we publish every miss. See tomorrow's mistake before it gets built."

## 3 minutes, Talona jury

**0:00 Problem (15 s)**
"Thursday 14:02 the architect moves a bathroom wall 40 centimetres. Rev C goes into the office thread. The plumbers aren't in that thread. Friday evening the plumbing lead writes in the site group: tomorrow morning we rough in the 204 bath along the east wall. Nobody did anything wrong, and on Monday someone pays for it. Everything you'll see is simulated site data, and it says so on every screen."

**0:15 Build (15 s)** *(the record as of Thursday 14:02, inspector on the wall)*
"Second Eye reads the chats the site already uses. Every message becomes a change to one record of the floor, and every change keeps the message and the thread it came from. This is the wall the architect moved, quoting him."

**0:30 Ghost wall (25 s)** *(phone sends the plumber's text)*
"Now the plumber sends his plan for tomorrow." *(Pause on the reveal.)*
"Red is where plumbing will measure from. Black is where the wall is, per the record. Forty centimetres. The engine measured it from the wall face they work on: their rough-in would leave a 40 centimetre gap, and the trade needs 60 clear to work. The phone already answered him: hold, with the reason and the source."

**0:55 Why (15 s)** *(the floor as Novak Plumbing knows it)*
"Why? Each crew only hears its own threads, so each works from its own version of the floor. This is Novak Plumbing's. The change was said in the office thread; they don't read it. The matrix shows every change against every crew."

**1:10 How it decided (15 s)** *(trace on the desk)*
"Every alert shows how it was decided. Above the line, the language model: it read two messages into facts, each with a confidence and its source. Below the line, rules, no language model: here is the rule in plain words, and the measured result. The thresholds sit in one rules file, each with its reason. Same record, same result."

**1:25 Rehearse (20 s)** *(crew plan open under the plan)*
"Every evening, tomorrow is played forward as a dependency graph: rough-in, inspection, close the wall, finish. Arrows are what must finish first. This is the critical path: the 203 inspection, then drywall closing that wall, and drywall has it booked the morning before, so the edge is red. If the inspection slips, drywall can't start. Where two crews' work zones overlap, the shared floor is hatched with its area. What can't be undone comes first."

**1:45 Send (15 s)**
"One tap sends the correction. It doesn't go green. Sent isn't heard. It stays amber until the crew confirms this exact revision."

**2:00 Confirm (15 s)** *(simulated crew reply)*
"The crew replies. That reply is a message in the record, tied to revision 2 of this wall. If the wall moves again, this confirmation doesn't count. Now the record is rechecked. That proves the information arrived, not that the pipe is in the right place."

**2:15 Ask (10 s)**
"Crews text a question and get an answer from the record, with sources. Decisions still go to the superintendent."

**2:25 Learn and Run 2 (20 s)**
"Crews call 204 'the blue room'. The first time, the record doesn't guess. The superintendent maps it once. Next run, same words, it knows. Learning here is stored decisions you can see and undo, not a retrained model."

**2:45 Numbers and close (15 s)**
"On 190 simulated messages and 15 labelled cases: 15 caught, none missed, no false alarms. Live checking alone catches 14; the evening rehearsal catches the last one. That's why there are two triggers. On a separate set of 14 cases written before its first run, that first run caught 6, with 5 false alarms. We fixed what it taught us and reached 9 of 14 with 2 false alarms on the third run, which is no longer unseen. Every miss is in the report: cancellations, future plans, uncertain prerequisites. The language model reads messages. Rules decide. See tomorrow's mistake before it gets built."

## Questions we expect

- **Is this real data?** No. Simulated, labelled on every screen. Say so first.
- **Where do 0.60 m and 13 mm come from?** `server/checks/geometry-rules.ts`: one line of justification per value, a building code where one applies (fixtures: IPC 405.3.1), otherwise marked as a working assumption. They were set from construction practice, not tuned to the labelled cases; the golden results did not change when the checks became geometric.
- **What if a crew types something new?** `npm run demo:live` reads unseen text with the language model; the recorded demo uses the cache so it is repeatable. Challenge set, written before its first run: 6 of 14 with 5 false alarms on run 1; 8 of 14 with 4 on run 2 and 9 of 14 with 2 on run 3, both after fixes, so not unseen. Misses: cancellations, future plans, uncertain prerequisites. In live mode a message with a distance and a direction but no extracted move gets a second reading; that step is unit-tested but not yet scored on the challenge set. Free-tier rate limits can fail a burst of messages; the phone says so instead of hanging.
- **How do you know who heard it?** Two bases, and we show which one: what the crew said about the sheet revision it holds ("we're on A-201 rev B"), otherwise which threads it reads. Reading a thread is a proxy, not proof.
- **Is the critical path a real schedule?** It is tomorrow's stated plan in half-day slots from one prerequisite table, without a working calendar. It shows which stated tasks wait on which, not a programme.
- **Does confirmation mean it's safe?** No. It means the crew confirmed receiving the revision. Rechecking the record never certifies physical work.
- **Won't superintendents drown in alerts?** The desk shows three, ranked by what can't be undone; a dismissal with a reason is stored for that exact incident and comes back if the evidence changes.
- **Robots and agents?** The same record is readable over MCP. "Clear" means no conflict found in the record, never permission to enter.

## Words to avoid

"revolutionary", "seamless", "AI-powered", "game changer", "real-time digital twin", "guarantees", any money saved, and any number not printed by `npm run eval` or `npm run eval:challenge`. Never call a challenge run after a fix "unseen". Never say "the model shows what was built". Say "per the record".
