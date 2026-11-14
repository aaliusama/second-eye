// Owner: B. node data/challenge/build.mjs
// The challenge set: a second, separate run on the same floor and crews. Simulated site data.
// Written BEFORE the system was run on it (see README.md). This file is the source; it writes
// replay.json (same shape as replay.golden.json), labels.json (same shape as data/labels.json)
// and expected.json (the facts a careful reader takes from each message, and which messages each
// labelled case rests on). Nothing here is tuned to what the extraction or the checks produce.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DAYS = { Mon: "2026-11-16", Tue: "2026-11-17", Wed: "2026-11-18" };

const PEOPLE = {
  dana: { senderName: "Dana Pierce", senderRole: "superintendent" },
  lena: { senderName: "Lena Hofer", senderRole: "architect" },
  priya: { senderName: "Priya Shah", senderRole: "office" },
  marek: { senderName: "Marek (Novak Plumbing)", senderRole: "crew_lead", crewId: "crew-plumbing" },
  tomek: { senderName: "Tomek (Novak Plumbing)", senderRole: "crew", crewId: "crew-plumbing" },
  sean: { senderName: "Sean (Walsh Drywall)", senderRole: "crew_lead", crewId: "crew-drywall" },
  kev: { senderName: "Kev (Walsh Drywall)", senderRole: "crew", crewId: "crew-drywall" },
  jonas: { senderName: "Jonas (Brandt Electric)", senderRole: "crew_lead", crewId: "crew-electrical" },
  ana: { senderName: "Ana (Brandt Electric)", senderRole: "crew", crewId: "crew-electrical" },
  ivana: { senderName: "Ivana (Kovac Painting)", senderRole: "crew_lead", crewId: "crew-painting" },
  luca: { senderName: "Luca (Sorel Tiling)", senderRole: "crew_lead", crewId: "crew-tiling" },
};
const OFFICE = new Set(["lena", "priya"]);

// Expected facts, one string each:
//   move <element> <n> cm <direction>
//   status <element> <state>
//   plan <crew> <day> <slot> <taskType> <place | (no place)>
//   on <crew> <day> <element>          the plan names this wall or fixture
//   cancel <crew> <day> <slot> <place> the crew withdraws that plan
const plan = (crew, day, slot, task, place, ...els) => [
  `plan ${crew} ${DAYS[day]} ${slot} ${task} ${place ?? "(no place)"}`,
  ...els.map((e) => `on ${crew} ${DAYS[day]} ${e}`),
];

// [at, by, text, { key, thread, voice, x }]
const M = [
  // ---------------- Monday 16 Nov: statements plan Tuesday ----------------
  ["Mon 06:35", "dana", "Morning. Hoist is down till 9, use the north stairs"],
  ["Mon 06:41", "sean", "ok"],
  ["Mon 06:58", "jonas", "delivery of cable drums at 8, need the gate open"],
  ["Mon 07:02", "dana", "gate will be open"],
  ["Mon 07:30", "luca", "anyone seen my laser level"],
  ["Mon 07:33", "kev", "its in the 203 corridor by the window"],
  ["Mon 08:40", "lena", "Bulletin 4 item 1: the niche wall in the 206 living room comes 25 cm south, joinery needs the depth", { key: "w22-rev1", x: ["move W-22 25 cm south"] }],
  ["Mon 08:50", "lena", "Bulletin 4 item 2: bathroom east wall in 204 has to go 20 cm west, riser clash", { key: "w12-move", x: ["move W-12 20 cm west"] }],
  ["Mon 09:10", "lena", "item 3, the 205 bath east partition shifts 15cm to the west, shower tray didnt fit", { key: "w16-move", x: ["move W-16 15 cm west"] }],
  ["Mon 09:12", "priya", "thanks Lena, logging bulletin 4"],
  ["Mon 09:30", "dana", "FYI all: 206 kitchen partition moves 20 cm south per the architect. Sparks and boarders take note", { key: "w21-site", x: ["move W-21 20 cm south"] }],
  ["Mon 09:31", "jonas", "noted"],
  ["Mon 10:05", "lena", "one more: 201 bath east wall goes 30cm east, client wants the bigger shower", { key: "w03-move", x: ["move W-03 30 cm east"] }],
  ["Mon 10:40", "dana", "Marek heads up, the 201 bath east wall moved 30 cm east this morning (Lena, bulletin 4). Work to the new line", { key: "w03-dm", thread: "dm:crew-plumbing", x: ["move W-03 30 cm east"] }],
  ["Mon 10:42", "marek", "got it thx", { thread: "dm:crew-plumbing" }],
  ["Mon 10:50", "priya", "heads up the vanity for the 203 bath is back with the owner, they didnt like the oak one. no decision yet", { key: "vanity-open", x: ["status vanity-203 proposed"] }],
  ["Mon 11:15", "tomek", "we roughed in the 202 bath this morning, all capped"],
  ["Mon 11:20", "priya", "206 bath light: supplier offered an alternative fitting, sent to the owner for sign off, nothing agreed", { key: "light206-open", x: ["status light-206-bath proposed"] }],
  ["Mon 11:45", "priya", "202 kitchen lights, electrician suggested a different pendant, waiting on the owner", { key: "light202-open", x: ["status light-202-kitchen proposed"] }],
  ["Mon 12:00", "dana", "all: the niche wall in the 206 living room moved 25cm south this morning, bulletin 4 is in the site office", { key: "w22-site", x: ["move W-22 25 cm south"] }],
  ["Mon 12:05", "ivana", "lunch van is here"],
  ["Mon 12:30", "kev", "who moved the wall of plasterboard in the 204 corridor? need it back by the lift"],
  ["Mon 13:00", "marek", "inspector confirmed for the 204 rough in, wednesday 10am", { key: "insp204", x: plan("crew-plumbing", "Wed", "morning", "inspection", "room-204") }],
  ["Mon 13:20", "jonas", "are the tilers in 201 tomorrow or not?"],
  ["Mon 13:25", "dana", "not that I know of"],
  ["Mon 14:00", "luca", "we measure up the 203 bath tomorrow morning", { key: "tile203", x: plan("crew-tiling", "Tue", "morning", "other", "room-203") }],
  ["Mon 14:10", "ivana", "we'll be in 202 all day tuesday, ceilings then walls", { key: "paint202", x: plan("crew-painting", "Tue", "full_day", "paint", "room-202") }],
  ["Mon 14:30", "luca", "change of plan, we're not doing 203 tomorrow, van is in the garage. thursday instead", { key: "tile203-cancel", x: ["cancel crew-tiling 2026-11-17 morning room-203"] }],
  ["Mon 15:00", "jonas", "tomorrow afternoon rough in on the 206 kitchen partition", { key: "elec206", x: plan("crew-electrical", "Tue", "afternoon", "rough_in_electrical", "room-206", "W-21") }],
  ["Mon 15:20", "ana", "2moro arvo first fix on the 204 bath east wall, sockets + shaver point", { key: "elec204", x: plan("crew-electrical", "Tue", "afternoon", "rough_in_electrical", "room-204", "W-12") }],
  ["Mon 15:35", "sean", "Kev tapes and muds 202 tomorrow arvo", { key: "tape202", x: plan("crew-drywall", "Tue", "afternoon", "finish_drywall", "room-202") }],
  ["Mon 15:50", "jonas", "tomorrow morning we pull cable in 203", { key: "elec203", x: plan("crew-electrical", "Tue", "morning", "rough_in_electrical", "room-203") }],
  ["Mon 16:05", "sean", "tomorrow first thing we board up the 204 corridor wall", { key: "close204", x: plan("crew-drywall", "Tue", "morning", "close_wall", "room-204", "W-11") }],
  ["Mon 16:10", "tomek", "tmrw arvo me and marek fit the vanity in the 203 bath", { key: "vanity203", x: plan("crew-plumbing", "Tue", "afternoon", "install_fixtures", "room-203", "vanity-203") }],
  ["Mon 16:20", "luca", "tmrw am we're on the 205 bathroom, setting out off the east partition", { key: "tile205", x: plan("crew-tiling", "Tue", "morning", "layout", "room-205", "W-16") }],
  ["Mon 16:30", "kev", "tomorrow morning we board the corner unit", { key: "corner", x: plan("crew-drywall", "Tue", "morning", "finish_drywall", null) }],
  ["Mon 16:45", "marek", "tomorrow morning supply lines in the 201 bath on the east wall", { key: "supply201", x: plan("crew-plumbing", "Tue", "morning", "rough_in_plumbing", "room-201", "W-03") }],
  ["Mon 16:50", "dana", "plumbers are in 201 tomorrow morning, keep the corridor clear for them"],
  ["Mon 17:10", "ivana", "we primed the 201 hall today, looks good"],
  ["Mon 17:40", "dana", "locking up 18:00"],
  // ---------------- Tuesday 17 Nov: statements plan Wednesday ----------------
  ["Tue 06:40", "dana", "Morning. Hoist is back. Skip swap at 10, keep the yard clear"],
  ["Tue 06:52", "marek", "👍"],
  ["Tue 07:15", "kev", "painting the town red on friday lads, who's in"],
  ["Tue 07:16", "sean", "ha. me"],
  ["Tue 08:20", "dana", "Jonas, the 203 corridor wall is moving 15cm north to clear the riser, Lena confirmed it last night", { key: "w08-dm", thread: "dm:crew-electrical", x: ["move W-08 15 cm north"] }],
  ["Tue 08:22", "jonas", "ok will adjust the boxes", { thread: "dm:crew-electrical" }],
  ["Tue 09:00", "priya", "owner signed off the 202 kitchen pendants, approved", { key: "light202-ok", x: ["status light-202-kitchen approved"] }],
  ["Tue 09:30", "lena", "the 202 corridor wall will probably have to shift a bit, waiting on the structural engineer. tbc", { key: "w05-maybe", x: ["status W-05 unconfirmed"] }],
  ["Tue 10:00", "marek", "203 rough in inspection is booked tomorrow 8am", { key: "insp203", x: plan("crew-plumbing", "Wed", "morning", "inspection", "room-203") }],
  ["Tue 10:15", "lena", "sorry all, niche wall in 206 living again: another 10 cm south, the joinery drawing was wrong", { key: "w22-rev2", x: ["move W-22 10 cm south"] }],
  ["Tue 11:00", "marek", "202 inspection passed this morning, inspector was happy", { key: "insp202-pass" }],
  ["Tue 11:30", "luca", "need 2 more boxes of spacers if anyone is at the merchants"],
  ["Tue 12:30", "sean", "wed arvo Kev finishes the tape in 205", { key: "tape205", x: plan("crew-drywall", "Wed", "afternoon", "finish_drywall", "room-205") }],
  ["Tue 13:10", "ivana", "wednesday morning we cut in 205", { key: "paint205", x: plan("crew-painting", "Wed", "morning", "paint", "room-205") }],
  ["Tue 13:40", "luca", "wed morning we tile the 205 bath", { key: "tile205b", x: plan("crew-tiling", "Wed", "morning", "tile", "room-205") }],
  ["Tue 14:00", "dana", "Ivana, Luca is in 205 wed morning, can you shift?"],
  ["Tue 14:20", "ivana", "ok we move 205 to wednesday afternoon instead", { key: "paint205-move", x: [...plan("crew-painting", "Wed", "afternoon", "paint", "room-205"), "cancel crew-painting 2026-11-18 morning room-205"] }],
  ["Tue 14:30", "sean", "wed arvo we close up the 203 corridor wall", { key: "close203", x: plan("crew-drywall", "Wed", "afternoon", "close_wall", "room-203", "W-08") }],
  ["Tue 15:00", "sean", "tomorrow morning we close the 202 corridor wall", { key: "close202", x: plan("crew-drywall", "Wed", "morning", "close_wall", "room-202", "W-05") }],
  ["Tue 15:10", "jonas", "wed morning we fit the 206 bathroom light", { key: "light206", x: plan("crew-electrical", "Wed", "morning", "install_fixtures", "room-206", "light-206-bath") }],
  ["Tue 15:40", "sean", "wed afternoon we tape the 206 niche wall", { key: "tape206", x: plan("crew-drywall", "Wed", "afternoon", "finish_drywall", "room-206", "W-22") }],
  ["Tue 16:00", "jonas", "wed afternoon we hang the 202 kitchen lights", { key: "light202", x: plan("crew-electrical", "Wed", "afternoon", "install_fixtures", "room-202", "light-202-kitchen") }],
  ["Tue 16:30", "ana", "we finished the 204 bath first fix today, photos in the group"],
  ["Tue 17:00", "dana", "good day all. locking up 18:00"],
];

const REHEARSALS = [
  ["Mon 20:00", "Tue"],
  ["Tue 20:00", "Wed"],
];

// Labelled cases: what a superintendent reading the chat would want flagged. `needs` lists the
// messages a case rests on, so a miss can be told apart: extraction failure or check miss.
const CASES = [
  { id: "CH-LC1", check: "latest_change", trigger: "tile205", crews: ["crew-tiling"], elements: ["W-16"], needs: ["w16-move", "tile205"], kind: "unseen phrasing of a real incident", note: "W-16 moved 15 cm west in the office thread; tiling sets out the 205 bath off that wall on Tuesday." },
  { id: "CH-LC2", check: "latest_change", trigger: "tape206", crews: ["crew-drywall"], elements: ["W-22"], needs: ["w22-rev1", "w22-site", "w22-rev2", "tape206"], kind: "second revision after an earlier correction", note: "W-22 moved 25 cm (relayed to the site group), then another 10 cm in the office thread only; drywall tapes it Wednesday knowing only the first move." },
  { id: "CH-LC3", check: "latest_change", trigger: "close203", crews: ["crew-drywall"], elements: ["W-08"], needs: ["w08-dm", "close203"], kind: "unseen phrasing of a real incident", note: "W-08 moved 15 cm north in a DM to electrical; drywall closes the 203 corridor wall Wednesday." },
  { id: "CH-LC4", check: "latest_change", trigger: "elec204", crews: ["crew-electrical"], elements: ["W-12"], needs: ["w12-move", "elec204"], kind: "unseen phrasing of a real incident", note: "W-12 moved 20 cm west in the office thread; electrical first-fixes the 204 bath east wall Tuesday (crew member, shorthand)." },
  { id: "CH-SC1", check: "space_clash", trigger: "tape202", crews: ["crew-drywall", "crew-painting"], elements: ["room-202"], needs: ["paint202", "tape202"], kind: "unseen phrasing of a real incident", note: "Painting is in 202 all day Tuesday; drywall tapes 202 Tuesday afternoon." },
  { id: "CH-SC2", check: "space_clash", trigger: "tile205b", crews: ["crew-painting", "crew-tiling"], elements: ["room-205"], needs: ["paint205", "tile205b"], kind: "unseen phrasing of a real incident", note: "Painting and tiling both in 205 Wednesday morning." },
  { id: "CH-SC3", check: "space_clash", trigger: "paint205-move", crews: ["crew-drywall", "crew-painting"], elements: ["room-205"], needs: ["tape205", "paint205-move"], kind: "plan correction that creates a different clash", note: "Painting moves 205 to Wednesday afternoon to clear tiling, and lands on drywall taping 205 that afternoon." },
  { id: "CH-OW1", check: "order_of_work", trigger: "paint202", crews: ["crew-painting", "crew-drywall"], elements: ["room-202"], needs: ["paint202", "tape202"], kind: "unseen phrasing of a real incident", note: "Painting 202 all day Tuesday while drywall only tapes and muds it Tuesday afternoon: paint before finish." },
  { id: "CH-OW2", check: "order_of_work", trigger: "close204", crews: ["crew-drywall"], elements: ["room-204", "W-11"], needs: ["close204"], kind: "unseen phrasing of a real incident", note: "Drywall boards up the 204 corridor wall Tuesday morning; the 204 inspection is only on Wednesday." },
  { id: "CH-OW3", check: "order_of_work", trigger: "paint205", crews: ["crew-painting", "crew-drywall"], elements: ["room-205"], needs: ["tape205", "paint205"], kind: "unseen phrasing of a real incident", note: "Painting cuts in 205 Wednesday morning; drywall finishes the tape there Wednesday afternoon." },
  { id: "CH-OW4", check: "order_of_work", trigger: "paint205-move", crews: ["crew-painting", "crew-drywall"], elements: ["room-205"], needs: ["tape205", "paint205-move"], kind: "plan correction that creates a different clash", note: "After the move, painting 205 is in the same slot as the taping: still not after it." },
  { id: "CH-OD1", check: "open_decision", trigger: "light206", crews: ["crew-electrical"], elements: ["light-206-bath"], needs: ["light206-open", "light206"], kind: "unseen phrasing of a real incident", note: "The 206 bath light is with the owner, nothing agreed; electrical fits it Wednesday morning." },
  { id: "CH-OD2", check: "open_decision", trigger: "close202", crews: ["crew-drywall"], elements: ["W-05"], needs: ["w05-maybe", "close202"], kind: "uncertain move", note: "W-05 will probably shift, to be confirmed; drywall closes it Wednesday morning. Expected as a warning to confirm, not a hold." },
  { id: "CH-OD3", check: "open_decision", trigger: "vanity203", crews: ["crew-plumbing"], elements: ["vanity-203"], needs: ["vanity-open", "vanity203"], kind: "unseen phrasing of a real incident", note: "The 203 vanity is back with the owner; plumbing fits it Tuesday afternoon (crew member, shorthand)." },
];

// Planted non-cases: nothing should be flagged. A finding sourced from one of these is a false alarm.
const NON_CASES = [
  { keys: ["w21-site", "elec206"], kind: "unambiguous harmless look-alike", why: "W-21 moved in the site group, which electrical reads: electrical heard it." },
  { keys: ["w03-move", "w03-dm", "supply201"], kind: "already informed crew", why: "W-03 moved in the office thread, and the superintendent told plumbing in a DM before they planned the work." },
  { keys: ["tile203", "tile203-cancel", "elec203"], kind: "cancellation", why: "Tiling withdrew its 203 visit before electrical planned 203 for the same morning: no clash." },
  { keys: ["corner"], kind: "ambiguous room nickname", why: "\"the corner unit\" could be 201 or 206. No place may be guessed; it goes to the superintendent as unresolved." },
  { keys: ["light202-open", "light202-ok", "light202"], kind: "unambiguous harmless look-alike", why: "The 202 kitchen lights were proposed, then approved before electrical planned to hang them." },
  { keys: ["insp203", "close203"], kind: "unambiguous harmless look-alike", why: "203 inspection Wednesday morning, wall closed Wednesday afternoon: right order. (The moved wall is CH-LC3, not an order problem.)" },
  { keys: ["insp202-pass", "close202"], kind: "unambiguous harmless look-alike", why: "The 202 inspection passed on Tuesday, so closing the wall Wednesday is in order. (The uncertain move is CH-OD2.)" },
];

// ---------- Build ----------

function time(at) {
  const [day, hm] = at.split(" ");
  return `${DAYS[day]}T${hm}:00`;
}

const idOf = new Map();
const messages = M.map(([at, by, text, opt = {}], i) => {
  const id = `c-${String(i + 1).padStart(3, "0")}`;
  if (opt.key) {
    if (idOf.has(opt.key)) throw new Error(`duplicate key ${opt.key}`);
    idOf.set(opt.key, id);
  }
  const p = PEOPLE[by];
  return {
    message: {
      id,
      time: time(at),
      thread: opt.thread ?? (OFFICE.has(by) ? "office" : "site-group"),
      senderName: p.senderName,
      senderRole: p.senderRole,
      ...(p.crewId ? { crewId: p.crewId } : {}),
      text,
      kind: opt.voice ? "voice" : "text",
    },
    key: opt.key,
    x: opt.x ?? [],
  };
});
for (let i = 1; i < messages.length; i++) {
  if (messages[i].message.time < messages[i - 1].message.time) throw new Error(`out of time order at ${messages[i].message.id}`);
}
const msgId = (key) => {
  const id = idOf.get(key);
  if (!id) throw new Error(`unknown key ${key}`);
  return id;
};

const events = [
  ...messages.map((m) => ({ kind: "message", message: m.message })),
  ...REHEARSALS.map(([at, day]) => ({ kind: "rehearse", time: time(at), day: DAYS[day] })),
].sort((a, b) => {
  const ta = a.kind === "message" ? a.message.time : a.time;
  const tb = b.kind === "message" ? b.message.time : b.time;
  return ta < tb ? -1 : ta > tb ? 1 : 0;
});

const write = (name, value) => writeFileSync(join(HERE, name), JSON.stringify(value, null, 2) + "\n");

write("replay.json", { id: "challenge", events });
write("labels.json", {
  cases: CASES.map((c) => ({ id: c.id, check: c.check, triggerMessageId: msgId(c.trigger), crewIds: c.crews, elementIds: c.elements, note: c.note })),
});
write("expected.json", {
  note: "Simulated site data. Hand-written before any extraction run: the facts a careful reader takes from each message. Messages not listed carry no fact.",
  facts: Object.fromEntries(messages.filter((m) => m.x.length > 0).map((m) => [m.message.id, [...m.x].sort()])),
  cases: Object.fromEntries(CASES.map((c) => [c.id, { kind: c.kind, needs: c.needs.map(msgId) }])),
  nonCases: NON_CASES.map((n) => ({ kind: n.kind, why: n.why, messageIds: n.keys.map(msgId) })),
});

console.log(`challenge: ${messages.length} messages, ${CASES.length} labelled cases, ${NON_CASES.length} planted non-cases`);
