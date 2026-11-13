# Pitch

Spoken scripts. Click-by-click steps live in `docs/demo-script.md`; the timings here match it.
Numbers: say only what `eval/results.json` says on the day. `[[...]]` = fill from the final run.

## 3 minutes, Talona jury

**0:00 Problem (20 s)**
"Thursday afternoon the architect moves a bathroom wall 40 centimetres. He posts it in the office thread. The plumbers aren't in that thread. Friday evening the plumbing lead writes in the site group: tomorrow morning we rough in the 204 bath along the east wall. Saturday they run pipe to a wall that isn't there any more. That's rework, and nobody did anything wrong."

**0:20 Build (20 s)**
"Site Rehearsal reads the chats the site already uses. Every message becomes a change to a live model of the floor, and each change remembers which message it came from and how sure we are. This is one floor: six units, five crews, two days of chat. It's all simulated, and it says so on the screen."

**0:40 Live check, the ghost wall (35 s)**
"Now the plumber sends the message he sent on Friday." *(Send it from the phone.)*
"The red outline is where plumbing thinks the wall is. The black line is where it is per the record. Forty centimetres east, changed in the office thread, which plumbing doesn't read. We caught it before anyone picked up a pipe." *(Click the ghost: source messages m-001 and m-002.)*

**1:15 Rehearse (30 s)**
"Every evening it plays tomorrow forward." *(Drag the slider.)*
"Saturday morning, electrical and painting are both booked in 206. In 203, drywall plans to close a wall before the plumbing inspection. In 205, tiling starts on a tile choice nobody has approved. Each one points to the messages it comes from."

**1:45 Fix (20 s)**
"The superintendent gets a queue, not a dashboard. One tap." *(Approve.)*
"Plumbing gets: HOLD, the wall moved 40 centimetres, here's the message. The ghost is gone. If a crew at risk has gone quiet, it doesn't give them an order, it asks them a question."

**2:05 Learn (25 s)**
"Crews call 204 'the blue room'. The first time, we don't guess. We ask the superintendent once." *(Map it, then run again.)*
"Second run, it knows. Approved fixes and crews that misread change the next run."

**2:30 Beyond the chat (15 s)** *[[only if lanes E and F land]]*
"Crews can text a question and get an answer from the record. And an agent or a robot can ask the same record whether unit 204 is clear tomorrow morning."

**2:45 Numbers and close (15 s)**
"On [[n]] simulated messages with [[cases]] labelled cases written before the checks ran: [[caught]] caught, [[missed]] missed, [[false alarms]] false alarms. The LLM reads the messages. The rules decide. Site Rehearsal finds the mistake the evening before it gets built."

## 60 seconds, 16:00 finals (VCs, founders, tech leads)

"A building site runs on WhatsApp groups. Decisions made in one thread don't reach the crew in another, and the case book puts the cost of bad data and miscommunication in construction at an estimated 1.85 trillion dollars in 2020.

Site Rehearsal reads the chats the site already uses and keeps one live model of the building: who said what, what changed, who heard it. Every time a crew says what they'll do tomorrow, we check it against that model. *(Ghost wall on screen.)* This red wall is where the plumbers think the wall is. It moved 40 centimetres on Thursday, in a thread they don't read. We show it the evening before, and the superintendent fixes it with one tap.

The language model only reads messages. The decisions are rules, so they're explainable and repeatable, and every one of them cites the message it comes from. It learns the site's own words, and robots and agents can query the same record.

On our simulated test set: [[caught]] of [[cases]] caught, [[false alarms]] false alarms. We built this for Talona, for the superintendents of mid-size general contractors building multifamily housing."

## Words to avoid

"revolutionary", "seamless", "AI-powered", "game changer", "real-time digital twin", and any number that isn't in `eval/results.json`. Never say "the model shows what was built". Say "per the record".
