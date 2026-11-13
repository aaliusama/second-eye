import type {
  ChatMessage,
  CrewIntent,
  Element,
  ExtractResult,
  Finding,
  Fix,
  Geometry,
  LabelSet,
  Operation,
  PlanTask,
  Scene,
} from "../src/index";

/*
 * Fixtures: the ghost-wall case from TEAM.md, small enough to read in one go.
 * Build against these until the real pipeline is on main. Simulated site data.
 *
 * Floor: corridor along y = 0..2, units 201-206 north of it, 5 m wide each.
 * W-12 is the Unit 204 bathroom east wall. Rev C (office thread, Thu 14:02) moves it 0.4 m east.
 * Novak Plumbing only reads the site group, so it still works from the old line.
 */

export const W12_BEFORE: Geometry = { kind: "segment", from: [18, 2], to: [18, 5], thickness: 0.12 };
export const W12_AFTER: Geometry = { kind: "segment", from: [18.4, 2], to: [18.4, 5], thickness: 0.12 };

export const fixtureMessages: ChatMessage[] = [
  {
    id: "m-001",
    time: "2026-11-12T14:02:00",
    thread: "office",
    senderName: "Lena Hofer",
    senderRole: "architect",
    text: "Rev C: W-12 in the 204 bathroom moves 40 cm east so the vanity fits. Updated sheet A-201 attached.",
    kind: "text",
  },
  {
    id: "m-002",
    time: "2026-11-13T17:40:00",
    thread: "site-group",
    senderName: "Marek (Novak Plumbing)",
    senderRole: "crew_lead",
    crewId: "crew-plumbing",
    text: "tomorrow morning we rough in the 204 bath along the east wall",
    kind: "text",
  },
];

export const fixtureOperations: Operation[] = [
  {
    id: "op-001",
    type: "move",
    time: "2026-11-12T14:02:00",
    sourceMessageId: "m-001",
    thread: "office",
    confidence: 0.92,
    elementId: "W-12",
    to: W12_AFTER,
    note: "40 cm east",
  },
];

export const fixtureTask: PlanTask = {
  id: "task-001",
  crewId: "crew-plumbing",
  day: "2026-11-14",
  slot: "morning",
  order: 0,
  taskType: "rough_in_plumbing",
  description: "Rough in the 204 bathroom along the east wall",
  placeId: "room-204",
  elementIds: ["W-12"],
  status: "planned",
  sourceMessageId: "m-002",
  confidence: 0.88,
};

export const fixtureIntent: CrewIntent = {
  id: "intent-001",
  crewId: "crew-plumbing",
  time: "2026-11-13T17:40:00",
  sourceMessageId: "m-002",
  confidence: 0.88,
  day: "2026-11-14",
  slot: "morning",
  taskType: "rough_in_plumbing",
  description: "Rough in the 204 bathroom along the east wall",
  placeId: "room-204",
  elementIds: ["W-12"],
};

export const fixtureExtractResults: ExtractResult[] = [
  { messageId: "m-001", operations: fixtureOperations, intents: [] },
  {
    messageId: "m-002",
    operations: [
      {
        id: "op-002",
        type: "plan_task",
        time: "2026-11-13T17:40:00",
        sourceMessageId: "m-002",
        thread: "site-group",
        confidence: 0.88,
        task: fixtureTask,
      },
    ],
    intents: [fixtureIntent],
  },
];

const drawing = (time = "2026-11-10T08:00:00") =>
  ({ time, sourceMessageId: "drawing:rev-B", thread: "drawing", operationType: "add", confidence: 1 }) as const;

const elements: Element[] = [
  {
    id: "corridor",
    type: "zone",
    name: "Level 2 corridor",
    aliases: [],
    geometry: { kind: "polygon", points: [[0, 0], [30, 0], [30, 2], [0, 2]] },
    state: "built",
    version: 1,
    history: [{ ...drawing(), version: 1, state: "built" }],
  },
  {
    id: "room-203",
    type: "room",
    name: "Unit 203",
    aliases: [],
    geometry: { kind: "polygon", points: [[10, 2], [15, 2], [15, 10], [10, 10]] },
    state: "approved",
    version: 1,
    history: [{ ...drawing(), version: 1, state: "approved" }],
  },
  {
    id: "room-204",
    type: "room",
    name: "Unit 204",
    aliases: ["the blue room"],
    geometry: { kind: "polygon", points: [[15, 2], [20, 2], [20, 10], [15, 10]] },
    state: "approved",
    version: 1,
    history: [{ ...drawing(), version: 1, state: "approved" }],
  },
  {
    id: "W-08",
    type: "wall",
    name: "Unit 203 corridor wall",
    aliases: [],
    geometry: { kind: "segment", from: [10, 2], to: [15, 2], thickness: 0.2 },
    height: 2.7,
    state: "planned",
    version: 1,
    history: [{ ...drawing(), version: 1, state: "planned" }],
  },
  {
    id: "W-12",
    type: "wall",
    name: "Unit 204 bathroom east wall",
    aliases: [],
    geometry: W12_AFTER,
    height: 2.7,
    state: "approved",
    version: 2,
    history: [
      { ...drawing(), version: 1, geometry: W12_BEFORE, state: "approved" },
      {
        version: 2,
        time: "2026-11-12T14:02:00",
        sourceMessageId: "m-001",
        thread: "office",
        operationType: "move",
        geometry: W12_AFTER,
        confidence: 0.92,
      },
    ],
  },
];

/** Scene after m-001 and m-002 are applied. */
export const fixtureScene: Scene = {
  floorId: "level-2",
  name: "Level 2, units 201-206",
  time: "2026-11-13T17:40:00",
  elements,
  crews: [
    { id: "crew-plumbing", name: "Novak Plumbing", trade: "plumbing", letter: "P", threads: ["site-group"] },
    { id: "crew-drywall", name: "Walsh Drywall", trade: "drywall", letter: "D", threads: ["site-group"] },
  ],
  tasks: [fixtureTask],
};

/** The ghost wall: what the latest-change check should produce for m-002. */
export const fixtureFinding: Finding = {
  id: "f-001",
  check: "latest_change",
  trigger: "live",
  severity: "hold",
  time: "2026-11-13T17:40:00",
  sourceMessageId: "m-002",
  evidenceMessageIds: ["m-001"],
  crewIds: ["crew-plumbing"],
  elementIds: ["W-12"],
  taskIds: ["task-001"],
  summary:
    "Novak Plumbing plans to rough in along W-12 at its old line. Per the record it moved 0.4 m east on Thu 14:02 in the office thread, which the crew does not read.",
  ghost: { elementId: "W-12", geometry: W12_BEFORE, label: "0.4 m east" },
};

export const fixtureFix: Fix = {
  id: "fix-001",
  findingId: "f-001",
  kind: "notify_crew",
  description: "Send the rev C wall line to Novak Plumbing before they start.",
  messages: [
    {
      crewId: "crew-plumbing",
      text: "HOLD: W-12 in the 204 bathroom moved 0.4 m east (rev C, Thu 14:02). Rough in to the new line. Source: office thread.",
    },
  ],
  status: "pending",
  sourceMessageId: "m-002",
};

export const fixtureLabels: LabelSet = {
  cases: [
    {
      id: "case-001",
      check: "latest_change",
      triggerMessageId: "m-002",
      crewIds: ["crew-plumbing"],
      elementIds: ["W-12"],
      note: "Ghost wall demo case: W-12 moved in the office thread, plumbing never heard.",
    },
  ],
};
