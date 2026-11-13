import type { Trade } from "@site/contracts";

// Owner: E. Questions crews text during the demo. Simulated. The cache holds their parses.
// Each names the crew by trade and the rooms it needs, so the cache is only built against a floor
// that has them (lane B owns data/floor.json and the crew ids).

/** All cached parses resolve "tomorrow" etc. from this time: Friday evening, after the golden replay. */
export const ASKED_AT = "2026-11-13T20:30:00";

export interface DemoQuestion {
  trade: Trade;
  text: string;
  /** Room numbers that must exist on the floor. */
  rooms: string[];
  /** What it should parse to, for the reader (not enforced on the LLM). */
  expect: string;
}

export const DEMO_QUESTIONS: DemoQuestion[] = [
  { trade: "plumbing", text: "where's the east wall in the 204 bath now?", rooms: ["204"], expect: "where_is W-12 -> HOLD, old line" },
  { trade: "plumbing", text: "can we start rough in at 204 tomorrow morning?", rooms: ["204"], expect: "can_i_start -> HOLD (ghost wall)" },
  { trade: "plumbing", text: "any changes in 204?", rooms: ["204"], expect: "what_changed room-204 -> W-12 moved 0.4 m east" },
  { trade: "plumbing", text: "what's planned in 204 tomorrow", rooms: ["204"], expect: "whats_planned room-204" },
  { trade: "plumbing", text: "can we move the vanity wall back 40cm so our pipes fit?", rooms: ["204"], expect: "decision_needed -> escalated" },
  { trade: "drywall", text: "ok to close up the walls in 203 tomorrow?", rooms: ["203"], expect: "can_i_start close_wall -> HOLD, inspection" },
  { trade: "electrical", text: "who else is in 206 saturday morning?", rooms: ["206"], expect: "who_is_in room-206 -> clash with painting" },
  { trade: "painting", text: "what's on for us tomorrow?", rooms: [], expect: "whats_planned crew" },
  { trade: "tiling", text: "which tile do we use in the 205 bath?", rooms: ["205"], expect: "decision_needed -> escalated, open decision" },
  { trade: "tiling", text: "can we start tiling 205 saturday?", rooms: ["205"], expect: "can_i_start tile -> HOLD, open decision" },
];
