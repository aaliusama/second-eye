import type { CheckName, ElementState, ElementType, Geometry, Id, Point, SenderRole, Slot, TaskType } from "@site/contracts";

// Owner: B. The whole simulated scenario in one place (see data/scenario.md). Simulated site data.
// build.ts turns this into floor.json, chat.json, replay.golden.json, labels.json and llm-cache/.
// The `x` on a message is the hand-written expected extraction until live extraction replaces it.

export const DAYS = { Thu: "2026-11-12", Fri: "2026-11-13", Sat: "2026-11-14" } as const;
export type DayName = keyof typeof DAYS;

export const START_TIME = "2026-11-10T08:00:00";
export const PROVENANCE = "hand-written expected extraction (lane B), not LLM output; see data/scenario.md";

// ---------- Floor ----------

export interface ElementDef {
  id: Id;
  type: ElementType;
  name: string;
  geometry: Geometry;
  state: ElementState;
  height?: number;
  /** Names from the drawing that crews use as-is. Unit nicknames are never here: the record learns them. */
  aliases?: string[];
}

const rect = (x0: number, y0: number, x1: number, y1: number): Geometry => ({
  kind: "polygon",
  points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
});
const seg = (from: Point, to: Point, thickness = 0.12): Geometry => ({ kind: "segment", from, to, thickness });
const pt = (x: number, y: number): Geometry => ({ kind: "point", at: [x, y] });

const units = [201, 202, 203, 204, 205, 206];
const corridorWallIds = ["W-02", "W-05", "W-08", "W-11", "W-15", "W-18"];

export const ELEMENTS: ElementDef[] = [
  { id: "corridor", type: "zone", name: "Level 2 corridor", aliases: ["corridor"], geometry: rect(0, 0, 30, 2), state: "built" },
  ...units.map((u, i): ElementDef => ({ id: `room-${u}`, type: "room", name: `Unit ${u}`, geometry: rect(i * 5, 2, i * 5 + 5, 10), state: "approved" })),
  ...units.map((u, i): ElementDef => ({
    id: corridorWallIds[i]!,
    type: "wall",
    name: `Unit ${u} corridor wall`,
    geometry: seg([i * 5, 2], [i * 5 + 5, 2], 0.2),
    height: 2.7,
    state: "planned",
  })),
  { id: "W-03", type: "wall", name: "Unit 201 bathroom east wall", geometry: seg([3, 2], [3, 5]), height: 2.7, state: "approved" },
  { id: "W-12", type: "wall", name: "Unit 204 bathroom east wall", geometry: seg([18, 2], [18, 5]), height: 2.7, state: "approved" },
  { id: "W-16", type: "wall", name: "Unit 205 bathroom east wall", geometry: seg([23, 2], [23, 5]), height: 2.7, state: "approved" },
  { id: "W-21", type: "wall", name: "Unit 206 kitchen partition", geometry: seg([25, 6], [28, 6]), height: 2.7, state: "approved" },
  { id: "W-22", type: "wall", name: "Unit 206 living room niche wall", geometry: seg([26, 8], [29, 8]), height: 2.7, state: "approved" },
  { id: "tile-205-bath", type: "fixture", name: "Unit 205 bathroom floor tile", geometry: pt(22, 4), state: "planned" },
  { id: "light-202-kitchen", type: "fixture", name: "Unit 202 kitchen light fixtures", geometry: pt(7, 8), state: "planned" },
  { id: "vanity-203", type: "fixture", name: "Unit 203 bathroom vanity", geometry: pt(11.5, 3.5), state: "planned" },
  { id: "light-206-bath", type: "fixture", name: "Unit 206 bathroom light", geometry: pt(27, 3.5), state: "planned" },
  { id: "paint-206-living", type: "fixture", name: "Unit 206 living room paint colour", geometry: pt(27.5, 9), state: "planned" },
  // Unit 204 in depth: what hangs on, or sits against, the bathroom east wall W-12 (drawing rev B positions).
  // Names avoid "bathroom" and "wall" so the query parser keeps resolving "the 204 bath" and "the east wall" to W-12.
  { id: "vanity-204", type: "fixture", name: "Unit 204 vanity", geometry: pt(17.5, 4.2), state: "approved" },
  { id: "socket-204-shaver", type: "fixture", name: "Unit 204 shaver socket", geometry: pt(17.85, 3.6), state: "planned" },
  { id: "tile-204-shower", type: "fixture", name: "Unit 204 shower tile", geometry: pt(16.2, 2.8), state: "planned" },
  { id: "window-204", type: "window", name: "Unit 204 living room window", geometry: seg([16, 10], [19, 10], 0.2), height: 1.5, state: "approved" },
  { id: "door-204", type: "door", name: "Unit 204 entrance door", geometry: pt(19.2, 2), state: "built" },
];

export const CREWS = [
  { id: "crew-plumbing", name: "Novak Plumbing", trade: "plumbing", letter: "P", threads: ["site-group"] },
  { id: "crew-drywall", name: "Walsh Drywall", trade: "drywall", letter: "D", threads: ["site-group"] },
  { id: "crew-electrical", name: "Brandt Electric", trade: "electrical", letter: "E", threads: ["site-group"] },
  { id: "crew-painting", name: "Kovac Painting", trade: "painting", letter: "A", threads: ["site-group", "office"] },
  { id: "crew-tiling", name: "Sorel Tiling", trade: "tiling", letter: "T", threads: ["site-group"] },
] as const;

// ---------- People ----------

interface Person {
  senderName: string;
  senderRole: SenderRole;
  crewId?: Id;
  /** Where this person usually writes. */
  thread: string;
}

export const PEOPLE = {
  dana: { senderName: "Dana Pierce", senderRole: "superintendent", thread: "site-group" },
  lena: { senderName: "Lena Hofer", senderRole: "architect", thread: "office" },
  priya: { senderName: "Priya Shah", senderRole: "office", thread: "office" },
  marek: { senderName: "Marek (Novak Plumbing)", senderRole: "crew_lead", crewId: "crew-plumbing", thread: "site-group" },
  tomek: { senderName: "Tomek (Novak Plumbing)", senderRole: "crew", crewId: "crew-plumbing", thread: "site-group" },
  sean: { senderName: "Sean (Walsh Drywall)", senderRole: "crew_lead", crewId: "crew-drywall", thread: "site-group" },
  kev: { senderName: "Kev (Walsh Drywall)", senderRole: "crew", crewId: "crew-drywall", thread: "site-group" },
  jonas: { senderName: "Jonas (Brandt Electric)", senderRole: "crew_lead", crewId: "crew-electrical", thread: "site-group" },
  ana: { senderName: "Ana (Brandt Electric)", senderRole: "crew", crewId: "crew-electrical", thread: "site-group" },
  ivana: { senderName: "Ivana (Kovac Painting)", senderRole: "crew_lead", crewId: "crew-painting", thread: "site-group" },
  luca: { senderName: "Luca (Sorel Tiling)", senderRole: "crew_lead", crewId: "crew-tiling", thread: "site-group" },
} satisfies Record<string, Person>;
export type Who = keyof typeof PEOPLE;

// ---------- Expected extraction ----------

/** A crew states a plan: one plan_task operation plus one crew intent. No place: intent only, never guessed. */
export interface PlanX {
  plan: { day: "Fri" | "Sat"; slot: Slot; task: TaskType; place?: Id; els?: Id[]; desc: string; order?: number };
  conf?: number;
}
export interface MoveX {
  move: Id;
  to: Geometry;
  note: string;
  conf?: number;
}
export interface StatusX {
  status: Id;
  state: ElementState;
  conf?: number;
}
/** A crew reports a planned task as done: the task again with status "done". */
export interface DoneX {
  done: string;
  conf?: number;
}
export type X = PlanX | MoveX | StatusX | DoneX;

export interface Msg {
  /** Stable name used by labels and done-references. m-001 and m-002 keep their slice-1 ids. */
  key?: string;
  /** "Thu 14:02" */
  at: string;
  by: Who;
  thread?: string;
  text: string;
  voice?: boolean;
  x?: X[];
}

const W03_NEW = seg([2.75, 2], [2.75, 5]);
const W05_NEW = seg([5, 2.1], [10, 2.1], 0.2);
const W12_NEW = seg([18.4, 2], [18.4, 5]);
const W16_NEW = seg([23.2, 2], [23.2, 5]);
const W21_NEW = seg([25, 6.3], [28, 6.3]);
const W22_NEW = seg([26, 7.85], [29, 7.85]);

// prettier-ignore
export const MESSAGES: Msg[] = [
  // ---------------- Thursday 12 Nov ----------------
  { at: "Thu 06:28", by: "dana", text: "Morning all. Lift booked for the electrical delivery 7-8, stairs only till then" },
  { at: "Thu 06:31", by: "marek", text: "👍" },
  { at: "Thu 06:35", by: "sean", text: "morning. 2 lads on 202 layout check, rest of us boarding 205" },
  { at: "Thu 06:40", by: "jonas", text: "truck is 10 min out" },
  { at: "Thu 06:44", by: "ivana", text: "morning" },
  { at: "Thu 06:52", by: "luca", text: "morning, running 15 late, traffic on the ring road" },
  { at: "Thu 07:01", by: "dana", text: "Reminder: hard hats past the hoarding, no exceptions. Insurer was round yesterday" },
  { at: "Thu 07:03", by: "kev", text: "yes boss" },
  { at: "Thu 07:14", by: "jonas", text: "delivery in, cable drums on L2 by the stair core" },
  { at: "Thu 07:17", by: "dana", text: "Thanks. Corridor clear by 9 please, fire marshal walk at 10" },
  { at: "Thu 07:29", by: "tomek", text: "who has the key for the riser cupboard" },
  { at: "Thu 07:32", by: "kev", text: "hook in the site office" },
  { at: "Thu 07:33", by: "tomek", text: "cheers" },
  { at: "Thu 07:41", by: "ana", text: "which outlet is live on L2, my charger is dead" },
  { at: "Thu 07:44", by: "jonas", text: "the yellow 110 box by 201, the other one tripped again" },
  { key: "n-w16", at: "Thu 07:50", by: "dana", text: "All: W-16, the 205 bath east wall, moves 20 cm east per the architect. Set-out re-marked on the floor. Tiling and plumbing note it",
    x: [{ move: "W-16", to: W16_NEW, note: "20 cm east", conf: 0.93 }] },
  { at: "Thu 07:52", by: "luca", text: "noted" },
  { at: "Thu 07:58", by: "marek", text: "seen" },
  { at: "Thu 08:06", by: "priya", text: "Good morning. Owner walk-through moved to Monday 10:00." },
  { at: "Thu 08:09", by: "lena", text: "Thanks Priya, I'll bring the finishes board" },
  { at: "Thu 08:22", by: "sean", text: "anyone got a spare chalk line" },
  { at: "Thu 08:24", by: "ana", text: "in the van, give me 5" },
  { at: "Thu 08:31", by: "dana", text: "Skip swap at 11, don't park on the ramp" },
  { key: "od1-propose", at: "Thu 08:45", by: "lena", text: "205 bath floor: proposing grey porcelain 60x60, sample going to the owner. Not approved yet",
    x: [{ status: "tile-205-bath", state: "proposed", conf: 0.9 }] },
  { at: "Thu 08:47", by: "priya", text: "Logged as pending owner decision" },
  { at: "Thu 08:58", by: "dana", text: "Fire marshal walk moved to 10:30" },
  { at: "Thu 09:05", by: "tomek", text: "ok" },
  { at: "Thu 09:12", by: "kev", text: "lunch run at 12 if anyone wants" },
  { at: "Thu 09:20", by: "ivana", text: "can someone tell me if 203 is dry enough to prime next week" },
  { at: "Thu 09:26", by: "sean", text: "should be, we taped it monday" },
  { key: "lc4-move", at: "Thu 09:40", by: "lena", text: "Rev C detail: W-05, the 202 corridor wall, moves 10 cm north to clear the new sprinkler main. Sheet A-202.",
    x: [{ move: "W-05", to: W05_NEW, note: "10 cm north", conf: 0.92 }] },
  { at: "Thu 09:44", by: "priya", text: "Got it" },
  { at: "Thu 09:55", by: "jonas", text: "Brandt all here today, 4 of us" },
  { at: "Thu 10:02", by: "dana", text: "Good. Water off on L2 13:00-13:30 for the riser tie-in" },
  { at: "Thu 10:04", by: "marek", text: "that's us, we'll be quick" },
  { key: "lc2-move", at: "Thu 10:15", by: "lena", text: "W-21, the 206 kitchen partition, moves 30 cm north so the fridge column fits. Updated plan to follow.",
    x: [{ move: "W-21", to: W21_NEW, note: "30 cm north", conf: 0.92 }] },
  { at: "Thu 10:19", by: "priya", text: "Noted, updating the change log" },
  { at: "Thu 10:31", by: "ivana", text: "paint delivery tomorrow 7am, need the lift 20 min" },
  { at: "Thu 10:33", by: "dana", text: "ok, put it on the board" },
  { at: "Thu 10:38", by: "luca", text: "here now, sorry" },
  { key: "od2-propose", at: "Thu 10:45", by: "lena", text: "202 kitchen lights: suggesting the slim LED track, waiting on owner sign-off",
    x: [{ status: "light-202-kitchen", state: "proposed", conf: 0.88 }] },
  { key: "n-w22", at: "Thu 10:50", by: "lena", text: "W-22, niche wall in the 206 living room, comes 15 cm south. Minor.",
    x: [{ move: "W-22", to: W22_NEW, note: "15 cm south", conf: 0.9 }] },
  { key: "lc3-move", at: "Thu 11:00", by: "dana", thread: "dm:crew-drywall", text: "Sean, heads up: W-03, the 201 bath east wall, shifts 25 cm west. Re-mark before you board it.",
    x: [{ move: "W-03", to: W03_NEW, note: "25 cm west", conf: 0.9 }] },
  { at: "Thu 11:04", by: "sean", thread: "dm:crew-drywall", text: "ok will do" },
  { at: "Thu 11:08", by: "kev", text: "skip lorry is on the ramp anyway lol" },
  { at: "Thu 11:21", by: "tomek", text: "fire marshal is here" },
  { at: "Thu 11:46", by: "dana", text: "Marshal happy. One extinguisher missing on the L2 east stair, replacing today" },
  { at: "Thu 11:50", by: "kev", text: "lunch orders in 10" },
  { at: "Thu 11:53", by: "ana", text: "chicken wrap x2" },
  { at: "Thu 11:54", by: "luca", text: "same" },
  { at: "Thu 12:05", by: "kev", text: "going now" },
  { at: "Thu 12:38", by: "ana", text: "anyone parked in the loading bay? grey transit" },
  { at: "Thu 12:41", by: "luca", text: "mine sorry, moving" },
  { at: "Thu 12:58", by: "dana", text: "Water off now" },
  { key: "n-insp-206", at: "Thu 13:10", by: "marek", text: "inspector booked fri 8am for the 206 rough-in",
    x: [{ plan: { day: "Fri", slot: "morning", task: "inspection", place: "room-206", desc: "Plumbing inspection of the 206 rough-in" }, conf: 0.9 }] },
  { at: "Thu 13:12", by: "dana", text: "great" },
  { at: "Thu 13:27", by: "marek", text: "water back on" },
  { key: "od3-propose", at: "Thu 13:35", by: "lena", text: "203 vanity: owner still choosing between two models, treat it as proposed",
    x: [{ status: "vanity-203", state: "proposed", conf: 0.87 }] },
  { key: "n-light206-propose", at: "Thu 13:50", by: "lena", text: "206 bath light: proposing the IP44 round, owner to confirm",
    x: [{ status: "light-206-bath", state: "proposed", conf: 0.88 }] },
  { key: "m-001", at: "Thu 14:02", by: "lena", text: "Rev C: W-12 in the 204 bathroom moves 40 cm east so the vanity fits. Updated sheet A-201 attached.",
    x: [{ move: "W-12", to: W12_NEW, note: "40 cm east", conf: 0.92 }] },
  { at: "Thu 14:05", by: "priya", text: "Thanks Lena, logged as Rev C" },
  { at: "Thu 14:12", by: "tomek", voice: true, text: "uh the 202 bath drain is lower than the drawing, marek can you have a look when you're up" },
  { at: "Thu 14:15", by: "marek", text: "on my way" },
  { at: "Thu 14:20", by: "sean", text: "205 boarding going well, should finish the ceiling today" },
  { at: "Thu 14:31", by: "jonas", text: "need the scissor lift after 3 for the corridor cable tray" },
  { at: "Thu 14:33", by: "dana", text: "yours after 3" },
  { at: "Thu 14:40", by: "marek", text: "202 drain fine, just the screed is high" },
  { key: "n-light206-approve", at: "Thu 14:50", by: "lena", text: "Owner confirmed the IP44 round for the 206 bath light. Approved.",
    x: [{ status: "light-206-bath", state: "approved", conf: 0.93 }] },
  { key: "od4-propose", at: "Thu 15:00", by: "lena", text: "206 living room colour: owner leaning to Harbour Grey, not confirmed yet",
    x: [{ status: "paint-206-living", state: "proposed", conf: 0.86 }] },
  { at: "Thu 15:10", by: "tomek", text: "anyone seen my level, yellow stabila" },
  { at: "Thu 15:12", by: "kev", text: "in the blue room on the window sill" },
  { at: "Thu 15:13", by: "tomek", text: "legend" },
  { at: "Thu 15:25", by: "dana", text: "Please put your plans for tomorrow in here before 6, rehearsal tonight" },
  { key: "sc2-plumb", at: "Thu 15:40", by: "marek", text: "fri morning we rough in the 202 bathroom",
    x: [{ plan: { day: "Fri", slot: "morning", task: "rough_in_plumbing", place: "room-202", desc: "Rough in the 202 bathroom" }, conf: 0.9 }] },
  { at: "Thu 15:45", by: "dana", text: "ok" },
  { at: "Thu 15:52", by: "ana", text: "scissor lift battery is flat, who had it last" },
  { at: "Thu 15:55", by: "kev", text: "not us" },
  { key: "sc2-elec", at: "Thu 16:05", by: "jonas", text: "Friday morning electrical rough in 202, whole unit",
    x: [{ plan: { day: "Fri", slot: "morning", task: "rough_in_electrical", place: "room-202", desc: "Electrical rough-in, all of 202" }, conf: 0.91 }] },
  { key: "lc2-elec", at: "Thu 16:10", by: "jonas", text: "and fri arvo we run the 206 kitchen circuits along the kitchen partition",
    x: [{ plan: { day: "Fri", slot: "afternoon", task: "rough_in_electrical", place: "room-206", els: ["W-21"], desc: "Run the 206 kitchen circuits along the kitchen partition" }, conf: 0.88 }] },
  { key: "n-light206", at: "Thu 16:12", by: "jonas", text: "also hang the 206 bath light fri afternoon",
    x: [{ plan: { day: "Fri", slot: "afternoon", task: "install_fixtures", place: "room-206", els: ["light-206-bath"], desc: "Hang the 206 bathroom light", order: 1 }, conf: 0.86 }] },
  { key: "ow3-paint", at: "Thu 16:20", by: "ivana", text: "we'll prime 205 friday morning",
    x: [{ plan: { day: "Fri", slot: "morning", task: "paint", place: "room-205", desc: "Prime Unit 205" }, conf: 0.89 }] },
  { at: "Thu 16:25", by: "dana", text: "thanks all, keep them coming" },
  { at: "Thu 16:33", by: "tomek", text: "is the hoist running tomorrow" },
  { at: "Thu 16:36", by: "dana", text: "yes from 7" },
  { key: "ow2-close", at: "Thu 16:45", by: "sean", text: "fri afternoon we close up the 202 corridor wall",
    x: [{ plan: { day: "Fri", slot: "afternoon", task: "close_wall", place: "room-202", els: ["W-05"], desc: "Close the 202 corridor wall" }, conf: 0.9 }] },
  { key: "ow3-finish", at: "Thu 16:50", by: "sean", text: "and finish the 205 drywall fri afternoon, tape and mud",
    x: [{ plan: { day: "Fri", slot: "afternoon", task: "finish_drywall", place: "room-205", desc: "Tape and mud Unit 205", order: 1 }, conf: 0.9 }] },
  { key: "od3-plumb", at: "Thu 17:00", by: "marek", text: "fri morning we set the vanity in 203 as well",
    x: [{ plan: { day: "Fri", slot: "morning", task: "install_fixtures", place: "room-203", els: ["vanity-203"], desc: "Set the 203 bathroom vanity", order: 1 }, conf: 0.87 }] },
  { key: "lc3-plumb", at: "Thu 17:05", by: "marek", text: "then fri afternoon supply lines in the 201 bath along the east wall",
    x: [{ plan: { day: "Fri", slot: "afternoon", task: "rough_in_plumbing", place: "room-201", els: ["W-03"], desc: "Supply lines in the 201 bathroom along the east wall" }, conf: 0.88 }] },
  { at: "Thu 17:11", by: "kev", text: "205 ceiling done" },
  { at: "Thu 17:13", by: "sean", text: "good job lads" },
  { key: "n-tile-stage", at: "Thu 17:20", by: "luca", text: "fri morning we stage the tile in the corridor, ok?",
    x: [{ plan: { day: "Fri", slot: "morning", task: "other", place: "corridor", desc: "Stage tile in the corridor" }, conf: 0.85 }] },
  { at: "Thu 17:22", by: "dana", text: "ok but keep a 1.2 m path" },
  { key: "sc4-paint", at: "Thu 17:30", by: "ivana", text: "friday afternoon we start the 203 walls",
    x: [{ plan: { day: "Fri", slot: "afternoon", task: "paint", place: "room-203", desc: "Paint the 203 walls", order: 1 }, conf: 0.87 }] },
  { at: "Thu 17:36", by: "ana", text: "found the lift charger, it was in 206" },
  { key: "sc4-tile", at: "Thu 17:45", by: "luca", text: "fri arvo i'll measure up the 203 bath for tile",
    x: [{ plan: { day: "Fri", slot: "afternoon", task: "other", place: "room-203", desc: "Measure up the 203 bathroom for tile", order: 1 }, conf: 0.84 }] },
  { at: "Thu 17:58", by: "dana", text: "Site closes 18:30 tonight, alarm engineer is in" },
  { at: "Thu 18:04", by: "tomek", text: "left the van keys at the gate hut, collect tomorrow" },
  { at: "Thu 18:10", by: "kev", text: "whoever left the radio on in 204 it's still going" },
  { at: "Thu 18:12", by: "ana", text: "sorry mine" },
  { at: "Thu 18:25", by: "dana", text: "All out, locking up" },
  { at: "Thu 19:05", by: "priya", text: "Weekly report sent to the owner." },

  // ---------------- Friday 13 Nov ----------------
  { at: "Fri 06:20", by: "dana", text: "Morning. Rain from 11, cover the L2 window openings with poly before lunch" },
  { at: "Fri 06:24", by: "luca", text: "will do" },
  { at: "Fri 06:31", by: "sean", text: "morning" },
  { at: "Fri 06:39", by: "ivana", text: "paint truck is here" },
  { at: "Fri 06:41", by: "dana", text: "lift is yours" },
  { at: "Fri 06:50", by: "jonas", text: "3 of us today, one off sick" },
  { at: "Fri 06:55", by: "tomek", text: "got the keys from the gate hut thanks" },
  { at: "Fri 07:02", by: "marek", text: "inspector here for 206" },
  { at: "Fri 07:06", by: "tomek", text: "202 bath rough in starting" },
  { at: "Fri 07:08", by: "ana", text: "we're in 202 too, bit tight in there" },
  { at: "Fri 07:11", by: "dana", text: "Sort it between you, see the board" },
  { at: "Fri 07:14", by: "tomek", text: "we'll take the bath end" },
  { at: "Fri 07:20", by: "luca", text: "tile pallets going up now, corridor east end" },
  { at: "Fri 07:24", by: "dana", text: "keep the fire door clear" },
  { at: "Fri 07:35", by: "kev", text: "who moved my step ladder from 205" },
  { at: "Fri 07:36", by: "ivana", text: "sorry, needed it for the ceiling cut in, it's back" },
  { at: "Fri 07:52", by: "priya", text: "Reminder: timesheets by 4 today" },
  { at: "Fri 08:05", by: "jonas", text: "ana can you bring the 2.5 twin and earth up" },
  { at: "Fri 08:07", by: "ana", text: "on it" },
  { at: "Fri 08:20", by: "dana", text: "Coffee van is at the gate" },
  { at: "Fri 08:22", by: "kev", text: "best news all week" },
  { at: "Fri 08:40", by: "lena", text: "Site visit Tuesday 9:00, I'll check the Rev C set-outs" },
  { at: "Fri 08:44", by: "priya", text: "Added to the calendar" },
  { key: "n-insp-206-done", at: "Fri 09:10", by: "marek", text: "206 inspection passed 👍",
    x: [{ done: "n-insp-206", conf: 0.9 }] },
  { at: "Fri 09:12", by: "dana", text: "great stuff" },
  { at: "Fri 09:25", by: "dana", text: "Hoist out of action 10-11 for its service" },
  { at: "Fri 09:31", by: "tomek", text: "ok we'll carry" },
  { at: "Fri 09:48", by: "sean", voice: true, text: "kev the 205 corners need another coat before the painters go near it" },
  { at: "Fri 09:50", by: "kev", text: "yep" },
  { at: "Fri 10:02", by: "priya", text: "Owner approved the Rev C package." },
  { at: "Fri 10:15", by: "ana", text: "power off on the 206 circuit for 10 min" },
  { at: "Fri 10:27", by: "ana", text: "back on" },
  { at: "Fri 10:40", by: "luca", text: "anyone got a 10 mm notched trowel spare" },
  { at: "Fri 10:43", by: "luca", text: "nvm found one" },
  { at: "Fri 10:58", by: "dana", text: "Rain is early, poly up now please" },
  { at: "Fri 11:03", by: "kev", text: "202 and 203 done" },
  { at: "Fri 11:06", by: "luca", text: "204 and 205 done" },
  { at: "Fri 11:09", by: "ana", text: "206 done" },
  { at: "Fri 11:10", by: "dana", text: "thanks all" },
  { at: "Fri 11:30", by: "tomek", text: "the blue room door sample got splashed, who's painting near it" },
  { at: "Fri 11:33", by: "ivana", text: "not us, we're in 205" },
  { at: "Fri 11:45", by: "kev", text: "lunch run 12" },
  { at: "Fri 11:47", by: "jonas", text: "2 bacon rolls" },
  { at: "Fri 11:48", by: "marek", text: "same + tea" },
  { at: "Fri 12:30", by: "dana", text: "Leak at the 2nd floor east window, someone grab a bucket" },
  { at: "Fri 12:32", by: "kev", text: "got it" },
  { at: "Fri 12:50", by: "dana", text: "Sealant guy coming Monday for that window" },
  { at: "Fri 13:05", by: "ivana", text: "205 prime done, coat 2 monday" },
  { at: "Fri 13:12", by: "jonas", text: "202 rough in 80%, finishing monday morning" },
  { at: "Fri 13:20", by: "tomek", text: "202 bath rough in done" },
  { at: "Fri 13:31", by: "ana", text: "scissor lift is stuck on the ramp, needs a jump" },
  { at: "Fri 13:40", by: "dana", text: "Mechanic on his way" },
  { at: "Fri 13:58", by: "luca", text: "corridor staging done, path is 1.2 clear" },
  { at: "Fri 14:05", by: "dana", text: "Checked, thanks Luca" },
  { at: "Fri 14:16", by: "priya", text: "Insurance certificate for the hoist renewed." },
  { at: "Fri 14:30", by: "kev", text: "anyone got a spare 25 mm screws box" },
  { at: "Fri 14:31", by: "sean", text: "van, left side" },
  { at: "Fri 14:45", by: "dana", text: "Plans for tomorrow in here before 6 please, same as yesterday" },
  { at: "Fri 14:52", by: "jonas", text: "sat is a half day for us, out by 3" },
  { key: "ow1-insp", at: "Fri 15:10", by: "marek", text: "inspection for 203 booked saturday 1pm",
    x: [{ plan: { day: "Sat", slot: "afternoon", task: "inspection", place: "room-203", desc: "Plumbing inspection for Unit 203" }, conf: 0.9 }] },
  { at: "Fri 15:14", by: "dana", text: "noted" },
  { at: "Fri 15:22", by: "tomek", text: "lift working again" },
  { key: "sc1-elec", at: "Fri 15:30", by: "jonas", text: "Saturday morning we rough in 206",
    x: [{ plan: { day: "Sat", slot: "morning", task: "rough_in_electrical", place: "room-206", desc: "Electrical rough-in in Unit 206" }, conf: 0.9 }] },
  { key: "od2-elec", at: "Fri 15:35", by: "jonas", text: "and sat morning ana hangs the 202 kitchen lights",
    x: [{ plan: { day: "Sat", slot: "morning", task: "install_fixtures", place: "room-202", els: ["light-202-kitchen"], desc: "Hang the 202 kitchen lights", order: 1 }, conf: 0.87 }] },
  { at: "Fri 15:41", by: "ana", text: "ok" },
  { at: "Fri 15:50", by: "kev", text: "who's got the hoover, 204 is a dust bowl" },
  { at: "Fri 15:52", by: "tomek", text: "203" },
  { key: "sc1-paint", at: "Fri 16:00", by: "ivana", text: "sat morning we paint the 206 living room, niche wall first",
    x: [{ plan: { day: "Sat", slot: "morning", task: "paint", place: "room-206", els: ["W-22", "paint-206-living"], desc: "Paint the 206 living room, niche wall first" }, conf: 0.88 }] },
  { at: "Fri 16:05", by: "dana", text: "👍" },
  { key: "od1-tile", at: "Fri 16:15", by: "luca", text: "saturday we start tiling the 205 bath floor, full day, east wall side first",
    x: [{ plan: { day: "Sat", slot: "full_day", task: "tile", place: "room-205", els: ["tile-205-bath", "W-16"], desc: "Tile the 205 bathroom floor, east wall side first" }, conf: 0.89 }] },
  { at: "Fri 16:20", by: "priya", text: "Timesheets: still missing Walsh and Sorel" },
  { at: "Fri 16:24", by: "sean", text: "sent" },
  { key: "ow1-close", at: "Fri 16:30", by: "sean", text: "sat morning we close the 203 corridor wall",
    x: [{ plan: { day: "Sat", slot: "morning", task: "close_wall", place: "room-203", els: ["W-08"], desc: "Close the 203 corridor wall" }, conf: 0.9 }] },
  { key: "n-close-206", at: "Fri 16:35", by: "sean", text: "sat afternoon close up the 206 corridor wall",
    x: [{ plan: { day: "Sat", slot: "afternoon", task: "close_wall", place: "room-206", els: ["W-18"], desc: "Close the 206 corridor wall" }, conf: 0.9 }] },
  { key: "sc3-dry", at: "Fri 16:40", by: "sean", text: "and kev does layout in 201 sat afternoon",
    x: [{ plan: { day: "Sat", slot: "afternoon", task: "layout", place: "room-201", desc: "Layout in Unit 201", order: 1 }, conf: 0.86 }] },
  { at: "Fri 16:42", by: "kev", text: "sound" },
  { key: "n-tile-201", at: "Fri 16:55", by: "luca", text: "sat morning one of mine starts the 201 bath walls",
    x: [{ plan: { day: "Sat", slot: "morning", task: "tile", place: "room-201", desc: "Tile the 201 bathroom walls", order: 1 }, conf: 0.86 }] },
  { at: "Fri 17:00", by: "luca", text: "timesheet sent too" },
  { key: "sc3-elec", at: "Fri 17:10", by: "jonas", text: "sat arvo we're in 201 for the rough in",
    x: [{ plan: { day: "Sat", slot: "afternoon", task: "rough_in_electrical", place: "room-201", desc: "Electrical rough-in in Unit 201", order: 2 }, conf: 0.87 }] },
  { at: "Fri 17:18", by: "dana", text: "Thanks. Marek, plumbing for tomorrow?" },
  { at: "Fri 17:25", by: "tomek", text: "he's on the phone, 2 min" },
  { key: "m-002", at: "Fri 17:40", by: "marek", text: "tomorrow morning we rough in the 204 bath along the east wall",
    x: [{ plan: { day: "Sat", slot: "morning", task: "rough_in_plumbing", place: "room-204", els: ["W-12"], desc: "Rough in the 204 bathroom along the east wall" }, conf: 0.88 }] },
  { at: "Fri 17:43", by: "dana", text: "thanks, rehearsal tonight as usual" },
  { at: "Fri 17:55", by: "kev", text: "anyone working sunday?" },
  { at: "Fri 17:57", by: "dana", text: "No, site closed Sunday" },
  { at: "Fri 18:06", by: "ana", text: "left the 110 transformer charging in 202, don't unplug" },
  { at: "Fri 18:15", by: "dana", text: "Locking up at 18:30" },
  { at: "Fri 18:31", by: "dana", text: "All out. Have a good evening" },
  { at: "Fri 19:12", by: "priya", text: "Owner sends thanks for the Rev C turnaround." },
  // Unit 204 in depth: two more trades plan work against W-12. Appended last so earlier message ids, and the
  // LLM cache entries keyed by them, stay where they are.
  { key: "lc5-elec", at: "Fri 19:20", by: "jonas", text: "forgot one: sat arvo ana sets the 204 shaver socket on the bathroom east wall",
    x: [{ plan: { day: "Sat", slot: "afternoon", task: "rough_in_electrical", place: "room-204", els: ["W-12", "socket-204-shaver"], desc: "Set the 204 shaver socket on the bathroom east wall", order: 1 }, conf: 0.87 }] },
  { key: "lc6-tile", at: "Fri 19:31", by: "luca", text: "sat afternoon we start the 204 shower tile, working off the east wall",
    x: [{ plan: { day: "Sat", slot: "afternoon", task: "tile", place: "room-204", els: ["W-12", "tile-204-shower"], desc: "Start the 204 shower tile, working off the east wall" }, conf: 0.86 }] },
  { at: "Fri 19:36", by: "dana", text: "thanks both, rehearsal at 8" },
];

/** Evening rehearsals: replay time and the day they play. */
export const REHEARSALS = [
  { at: "Thu 20:00", day: "Fri" },
  { at: "Fri 20:00", day: "Sat" },
] as const;

// ---------- Phone script (live posts; cache key from words + crew) ----------

export interface PhoneText {
  name: string;
  crewId: Id;
  text: string;
  /** Replay time stamped into the cached operations; the session restamps the message itself. */
  at: string;
  x: X[];
}

export const PHONE: PhoneText[] = [
  { name: "plumbingIntent", crewId: "crew-plumbing", at: "Fri 20:01", text: "tomorrow morning we rough in the 204 bath along the east wall",
    x: [{ plan: { day: "Sat", slot: "morning", task: "rough_in_plumbing", place: "room-204", els: ["W-12"], desc: "Rough in the 204 bathroom along the east wall" }, conf: 0.88 }] },
  { name: "blueRoom", crewId: "crew-drywall", at: "Fri 20:02", text: "tmrw afternoon we start boarding the blue room, ceiling first",
    x: [{ plan: { day: "Sat", slot: "afternoon", task: "finish_drywall", desc: "Board \"the blue room\", ceiling first (place not on record)" }, conf: 0.62 }] },
];

// ---------- Labelled cases (written from data/scenario.md, before the checks ran) ----------

export interface CaseDef {
  id: string;
  check: CheckName;
  trigger: string;
  crews: Id[];
  elements: Id[];
  note: string;
}

export const CASES: CaseDef[] = [
  { id: "LC1", check: "latest_change", trigger: "m-002", crews: ["crew-plumbing"], elements: ["W-12"], note: "Ghost wall: W-12 moved 40 cm east in the office thread; plumbing plans the 204 bath on the old line." },
  { id: "LC2", check: "latest_change", trigger: "lc2-elec", crews: ["crew-electrical"], elements: ["W-21"], note: "W-21 moved 30 cm north in the office thread; electrical runs the 206 kitchen circuits on it." },
  { id: "LC3", check: "latest_change", trigger: "lc3-plumb", crews: ["crew-plumbing"], elements: ["W-03"], note: "W-03 moved 25 cm west in a DM to drywall; plumbing runs the 201 supply lines along it." },
  { id: "LC4", check: "latest_change", trigger: "ow2-close", crews: ["crew-drywall"], elements: ["W-05"], note: "W-05 moved 10 cm north in the office thread; drywall closes it Friday." },
  { id: "SC1", check: "space_clash", trigger: "sc1-paint", crews: ["crew-electrical", "crew-painting"], elements: ["room-206"], note: "Electrical and painting both in 206 Saturday morning." },
  { id: "SC2", check: "space_clash", trigger: "sc2-elec", crews: ["crew-plumbing", "crew-electrical"], elements: ["room-202"], note: "Plumbing and electrical rough-in both in 202 Friday morning." },
  { id: "SC3", check: "space_clash", trigger: "sc3-elec", crews: ["crew-drywall", "crew-electrical"], elements: ["room-201"], note: "Drywall layout and electrical rough-in both in 201 Saturday afternoon." },
  { id: "SC4", check: "space_clash", trigger: "sc4-tile", crews: ["crew-painting", "crew-tiling"], elements: ["room-203"], note: "Painting and tiling both in 203 Friday afternoon." },
  { id: "OW1", check: "order_of_work", trigger: "ow1-close", crews: ["crew-drywall", "crew-plumbing"], elements: ["room-203", "W-08"], note: "Drywall closes the 203 corridor wall Saturday morning; the 203 inspection is Saturday afternoon." },
  { id: "OW2", check: "order_of_work", trigger: "ow2-close", crews: ["crew-drywall"], elements: ["room-202", "W-05"], note: "Drywall closes the 202 corridor wall with no inspection on record." },
  { id: "OW3", check: "order_of_work", trigger: "ow3-paint", crews: ["crew-painting", "crew-drywall"], elements: ["room-205"], note: "Painting primes 205 Friday morning; drywall finishes 205 Friday afternoon." },
  { id: "OD1", check: "open_decision", trigger: "od1-tile", crews: ["crew-tiling"], elements: ["tile-205-bath"], note: "Tiling starts the 205 bath floor while the tile is only proposed." },
  { id: "OD2", check: "open_decision", trigger: "od2-elec", crews: ["crew-electrical"], elements: ["light-202-kitchen"], note: "Electrical hangs the 202 kitchen lights while they are only proposed." },
  { id: "OD3", check: "open_decision", trigger: "od3-plumb", crews: ["crew-plumbing"], elements: ["vanity-203"], note: "Plumbing sets the 203 vanity while it is only proposed." },
  { id: "LC5", check: "latest_change", trigger: "lc5-elec", crews: ["crew-electrical"], elements: ["W-12"], note: "Same Rev C move as LC1: electrical only reads site-group and sets the 204 shaver socket on the old W-12 line." },
  { id: "LC6", check: "latest_change", trigger: "lc6-tile", crews: ["crew-tiling"], elements: ["W-12"], note: "Same Rev C move as LC1: tiling only reads site-group and sets out the 204 shower tile off the old W-12 line." },
  { id: "SC5", check: "space_clash", trigger: "lc6-tile", crews: ["crew-electrical", "crew-tiling"], elements: ["room-204"], note: "Electrical and tiling both work the 204 bathroom east wall on Saturday afternoon." },
  { id: "OD4", check: "open_decision", trigger: "sc1-paint", crews: ["crew-painting"], elements: ["paint-206-living"], note: "Painting paints the 206 living room while the colour is only proposed." },
];
