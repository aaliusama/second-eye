import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Element, Fix, PlanTask, Scene } from "@site/contracts";
import { W12_AFTER, fixtureFix, fixtureMessages, fixtureScene, fixtureTask } from "@site/contracts/fixtures";
import { answerQuery, elementsAt, type QueryState } from "./answer";
import { briefing, digest } from "./briefing";
import { CACHE_DIR } from "./cache";
import { ask, handleQueryRoute, parseQuestion } from "./index";
import { cacheKey, dayFrom, guard, isDecision, keywordParse, normalise } from "./parse";
import { Answer, QueryCacheEntry, type Question, type StructuredQuery } from "./schema";

// Simulated site data. Friday evening, Saturday 2026-11-14 is "tomorrow".
const T = "2026-11-13T20:30:00";
const SAT = "2026-11-14";

const task = (over: Partial<PlanTask>): PlanTask => ({ ...fixtureTask, ...over });
const room = (id: string, name: string, x: number): Element => ({
  id,
  type: "room",
  name,
  aliases: [],
  geometry: { kind: "polygon", points: [[x, 2], [x + 5, 2], [x + 5, 10], [x, 10]] },
  state: "approved",
  version: 1,
  history: [{ version: 1, time: "2026-11-10T08:00:00", sourceMessageId: "drawing:rev-B", thread: "drawing", operationType: "add", state: "approved", confidence: 1 }],
});

/** The ghost-wall fixture, plus unit 206, electrical and painting crews, and the blue room alias removed. */
function scene(extra: Partial<Scene> = {}): Scene {
  const s = structuredClone(fixtureScene);
  s.elements = s.elements.map((e) => (e.id === "room-204" ? { ...e, aliases: [] } : e));
  s.elements.push(room("room-206", "Unit 206", 25));
  s.crews.push(
    { id: "crew-electrical", name: "Berger Electric", trade: "electrical", letter: "E", threads: ["site-group"] },
    { id: "crew-painting", name: "Kraus Painting", trade: "painting", letter: "A", threads: ["site-group"] },
  );
  return { ...s, ...extra };
}

const state = (s: Scene = scene(), fixes: Fix[] = []): QueryState => ({ t: T, scene: s, findings: [], messages: fixtureMessages, fixes });
const question = (text: string, crewId?: string): Question => ({ id: `q-${cacheKey(text, crewId)}`, time: T, text, ...(crewId ? { crewId } : {}) });

/** The plumbing crew heard rev C by DM: W-12's latest geometry now sits in a thread they read. */
function heardScene(): Scene {
  const s = scene();
  const w12 = s.elements.find((e) => e.id === "W-12")!;
  w12.version = 3;
  w12.history.push({ version: 3, time: "2026-11-13T19:00:00", sourceMessageId: "sent-fix-001-crew-plumbing", thread: "dm:crew-plumbing", operationType: "move", geometry: W12_AFTER, confidence: 1 });
  return s;
}

describe("parse", () => {
  it("normalises and keys like the live chat cache", () => {
    expect(normalise("  Any  Changes in 204?? ")).toBe("any changes in 204");
    expect(cacheKey("any changes in 204?", "crew-plumbing")).toBe(cacheKey("Any changes in 204", "crew-plumbing"));
    expect(cacheKey("any changes in 204", "crew-plumbing")).not.toBe(cacheKey("any changes in 204", "crew-drywall"));
    expect(cacheKey("x")).toMatch(/^[0-9a-f]{10}$/);
  });

  it("resolves days from when the question was asked", () => {
    expect(dayFrom("tomorrow morning", T)).toBe(SAT);
    expect(dayFrom("sat am", T)).toBe(SAT);
    expect(dayFrom("on saturday", T)).toBe(SAT);
    expect(dayFrom("today", T)).toBe("2026-11-13");
    expect(dayFrom("monday", T)).toBe("2026-11-16");
    expect(dayFrom("where is the wall", T)).toBeUndefined();
  });

  it("parses each kind with keywords", () => {
    const s = scene();
    const p = (text: string, crewId = "crew-plumbing") => keywordParse(question(text, crewId), s);
    expect(p("where is W-12 now")).toEqual({ kind: "where_is", elementId: "W-12" });
    expect(p("any changes in 204?")).toEqual({ kind: "what_changed", placeId: "room-204" });
    expect(p("who's in 206 sat morning", "crew-electrical")).toEqual({ kind: "who_is_in", placeId: "room-206", day: SAT, slot: "morning" });
    expect(p("what's planned in 204 tomorrow")).toEqual({ kind: "whats_planned", placeId: "room-204", day: SAT });
    expect(p("can we start in 204 tomorrow morning")).toEqual({
      kind: "can_i_start",
      crewId: "crew-plumbing",
      taskType: "rough_in_plumbing",
      placeId: "room-204",
      day: SAT,
      slot: "morning",
    });
  });

  it("uses learned nicknames, and does not know them before they are learned", () => {
    const s = scene();
    const q = question("anything changed in the blue room?", "crew-plumbing");
    expect(keywordParse(q, s)).toBeNull();
    expect(keywordParse(q, s, { locationAliases: { "the blue room": "room-204" }, crewNotes: {} })).toEqual({ kind: "what_changed", placeId: "room-204" });
  });

  it("never guesses: no place, two places or no pattern -> null", () => {
    const s = scene();
    expect(keywordParse(question("can we start tomorrow", "crew-plumbing"), s)).toBeNull();
    expect(keywordParse(question("who is in 204 or 206 sat", "crew-plumbing"), s)).toBeNull();
    expect(keywordParse(question("lol the coffee machine is broken again", "crew-plumbing"), s)).toBeNull();
    expect(keywordParse(question("where is the wall", "crew-plumbing"), s)).toBeNull();
  });

  it("guard drops ids not in the record and forces decisions to escalate", () => {
    const s = scene();
    const q = question("who is in 209", "crew-plumbing");
    expect(guard({ kind: "who_is_in", placeId: "room-209", day: SAT }, q, s)).toBeNull();
    expect(guard({ kind: "where_is", elementId: "W-99" }, q, s)).toBeNull();
    const d = question("can we move the vanity wall back 40cm?", "crew-plumbing");
    expect(isDecision(d.text)).toBe(true);
    // Even if a model said where_is, a design-change question is escalated.
    expect(guard({ kind: "where_is", elementId: "W-12" }, d, s)?.kind).toBe("decision_needed");
    // can_i_start always asks for the sender's own crew.
    const c = guard({ kind: "can_i_start", crewId: "crew-drywall", taskType: "close_wall", placeId: "room-203", day: SAT, slot: "morning" }, question("ok to start 203", "crew-plumbing"), s);
    expect(c && c.kind === "can_i_start" && c.crewId).toBe("crew-plumbing");
  });
});

describe("answers", () => {
  const run = (text: string, query: StructuredQuery | null, s = state(), crewId = "crew-plumbing") => {
    const a = answerQuery(question(text, crewId), query, s);
    expect(Answer.safeParse(a).success).toBe(true);
    return a;
  };

  it("can_i_start: HOLD on the ghost wall, with the change as source", () => {
    const a = run("can we start", { kind: "can_i_start", crewId: "crew-plumbing", taskType: "rough_in_plumbing", placeId: "room-204", day: SAT, slot: "morning" });
    expect(a.text.startsWith("HOLD:")).toBe(true);
    expect(a.sourceMessageIds).toContain("m-001");
    expect(a.findings?.some((f) => f.check === "latest_change" && f.ghost?.label === "0.4 m east")).toBe(true);
    expect(a.escalation?.to).toBe("superintendent");
  });

  it("can_i_start: CLEAR once the crew heard the change", () => {
    const a = run(
      "can we start",
      { kind: "can_i_start", crewId: "crew-plumbing", taskType: "rough_in_plumbing", placeId: "room-204", day: SAT, slot: "morning" },
      state(heardScene()),
    );
    expect(a.text.startsWith("CLEAR:")).toBe(true);
    expect(a.findings).toEqual([]);
    expect(a.sourceMessageIds).toContain("m-002");
  });

  it("can_i_start: HOLD when drywall closes 203 with no inspection on record", () => {
    const a = run(
      "ok to close 203",
      { kind: "can_i_start", crewId: "crew-drywall", taskType: "close_wall", placeId: "room-203", day: SAT, slot: "full_day" },
      state(),
      "crew-drywall",
    );
    expect(a.text.startsWith("HOLD:")).toBe(true);
    expect(a.findings?.[0]?.check).toBe("order_of_work");
  });

  it("can_i_start: HOLD on a space clash in 206", () => {
    const s = scene({ tasks: [fixtureTask, task({ id: "task-paint", crewId: "crew-painting", taskType: "paint", placeId: "room-206", elementIds: [], description: "Paint unit 206", sourceMessageId: "m-050" })] });
    const a = run("can we start in 206", { kind: "can_i_start", crewId: "crew-electrical", taskType: "rough_in_electrical", placeId: "room-206", day: SAT, slot: "morning" }, state(s), "crew-electrical");
    expect(a.text.startsWith("HOLD:")).toBe(true);
    expect(a.findings?.map((f) => f.check)).toContain("space_clash");
    expect(a.sourceMessageIds).toContain("m-050");
  });

  it("where_is warns the crew that has the old line", () => {
    const a = run("where is W-12", { kind: "where_is", elementId: "W-12" });
    expect(a.text).toMatch(/^HOLD: Per the record, Unit 204 bathroom east wall runs from \(18.4, 2\)/);
    expect(a.text).toContain("0.4 m east");
    expect(a.sourceMessageIds).toEqual(["m-001"]);
    const heard = run("where is W-12", { kind: "where_is", elementId: "W-12" }, state(heardScene()));
    expect(heard.text.startsWith("Per the record")).toBe(true);
  });

  it("what_changed lists the move with its source and flags the unread thread", () => {
    const a = run("any changes in 204", { kind: "what_changed", placeId: "room-204" });
    expect(a.text).toContain("Unit 204 bathroom east wall moved 0.4 m east (m-001");
    expect(a.text).toContain("not in a thread you read");
    expect(a.sourceMessageIds).toEqual(["m-001"]);
    const none = run("any changes in 203", { kind: "what_changed", placeId: "room-203" });
    expect(none.text).toBe("Per the record, nothing changed in Unit 203.");
    expect(none.sourceMessageIds).toEqual([]);
  });

  it("elementsAt counts a wall on the room's edge", () => {
    expect(elementsAt(scene(), "room-204").map((e) => e.id)).toEqual(["room-204", "W-12"]);
  });

  it("who_is_in names both crews and flags the overlap", () => {
    const s = scene({
      tasks: [
        task({ id: "t-e", crewId: "crew-electrical", taskType: "rough_in_electrical", placeId: "room-206", elementIds: [], description: "Pull wire in 206", sourceMessageId: "m-040" }),
        task({ id: "t-p", crewId: "crew-painting", taskType: "paint", placeId: "room-206", elementIds: [], description: "Paint 206", sourceMessageId: "m-050" }),
      ],
    });
    const a = run("who is in 206", { kind: "who_is_in", placeId: "room-206", day: SAT, slot: "morning" }, state(s), "crew-electrical");
    expect(a.text).toMatch(/^HOLD: Per the record, 2 crews in Unit 206/);
    expect(a.sourceMessageIds).toEqual(["m-040", "m-050"]);
    const empty = run("who is in 206 monday", { kind: "who_is_in", placeId: "room-206", day: "2026-11-16" }, state(s));
    expect(empty.text).toBe("Per the record, no crew is planned in Unit 206 on Mon 16 Nov.");
  });

  it("whats_planned lists tasks with sources", () => {
    const a = run("what's planned in 204", { kind: "whats_planned", placeId: "room-204", day: SAT });
    expect(a.text).toContain("Novak Plumbing: Rough in the 204 bathroom along the east wall in Unit 204 (m-002)");
    expect(a.sourceMessageIds).toContain("m-002");
  });

  it("decision_needed is escalated and never decided", () => {
    const s = scene();
    s.elements.push({ ...room("tile-205", "Unit 205 bath tile choice", 20), type: "fixture", state: "proposed", history: [{ version: 1, time: "2026-11-12T09:00:00", sourceMessageId: "m-010", thread: "office", operationType: "add", state: "proposed", confidence: 0.9 }] });
    const a = run("which tile?", { kind: "decision_needed", topic: "which tile in 205" }, state(s), "crew-tiling");
    expect(a.kind).toBe("escalated");
    expect(a.escalation).toEqual({ to: "superintendent", reason: "which tile in 205" });
    expect(a.text).not.toMatch(/^(CLEAR|HOLD)/);
    expect(a.text).toContain("Unit 205 bath tile choice (m-010)");
    expect(a.sourceMessageIds).toEqual(["m-010"]);
  });

  it("not_found never invents: no ids, fixed text, forwarded", () => {
    const a = run("blah", null);
    expect(a).toEqual({
      questionId: question("blah", "crew-plumbing").id,
      kind: "not_found",
      text: "I could not tell what you asked; forwarded to the superintendent.",
      sourceMessageIds: [],
      elementIds: [],
      escalation: { to: "superintendent", reason: "question not understood" },
    });
  });

  it("is deterministic", () => {
    const query: StructuredQuery = { kind: "can_i_start", crewId: "crew-plumbing", taskType: "rough_in_plumbing", placeId: "room-204", day: SAT, slot: "morning" };
    expect(run("x", query)).toEqual(run("x", query));
  });
});

describe("briefing and digest", () => {
  it("morning briefing: plumbing is on hold for W-12 and sees the change it missed", () => {
    const b = briefing(state(), "crew-plumbing", SAT);
    expect(b.tasks).toHaveLength(1);
    expect(b.tasks[0].holds[0]).toMatchObject({ check: "latest_change", severity: "hold" });
    expect(b.tasks[0].holds[0].sourceMessageIds).toContain("m-001");
    expect(b.changes).toEqual([expect.objectContaining({ elementId: "W-12", sourceMessageId: "m-001", heard: false })]);
    expect(b.lastPosted).toBe("2026-11-13T17:40:00");
    expect(b.text).toContain("HOLD morning: Rough in the 204 bathroom along the east wall in Unit 204 (m-002)");
  });

  it("morning briefing: CLEAR after the crew heard it", () => {
    const b = briefing(state(heardScene()), "crew-plumbing", SAT);
    expect(b.tasks[0].holds).toEqual([]);
    expect(b.text).toContain("CLEAR morning");
  });

  it("evening digest: counts, open decisions, pending fixes", () => {
    const d = digest(state(scene(), [fixtureFix]), SAT);
    expect(d.counts.latest_change).toEqual({ hold: 1, warn: 0 });
    expect(d.pendingFixes).toEqual([{ fixId: "fix-001", kind: "notify_crew", description: fixtureFix.description }]);
    expect(d.silentCrews).toEqual([]); // plumbing posted m-002 after the change m-001
    expect(d.text.split("\n")[0]).toBe("Evening digest for Sat 14 Nov, per the record: 1 hold, 0 warnings.");
  });

  it("evening digest: a crew that said nothing since the change is silent", () => {
    const d = digest({ ...state(), messages: fixtureMessages.filter((m) => m.id === "m-001") }, SAT);
    expect(d.silentCrews).toEqual([{ crewId: "crew-plumbing", name: "Novak Plumbing", since: "2026-11-12T14:02:00" }]);
  });
});

describe("ask", () => {
  let live: string | undefined;
  beforeEach(() => {
    live = process.env.LIVE_LLM;
    delete process.env.LIVE_LLM;
  });
  afterEach(() => {
    if (live !== undefined) process.env.LIVE_LLM = live;
  });

  it("reads the cache first (LLM-written entry for the ghost-wall question)", async () => {
    const q = question("can we start rough in at 204 tomorrow morning?", "crew-plumbing");
    const a = await ask(q, { state: state() });
    expect(a.via).toBe("cache");
    expect(a.text.startsWith("HOLD:")).toBe(true);
  });

  it("falls back to keywords, then to not_found, with no network call", async () => {
    const k = await ask(question("who's in 206 sat morning?", "crew-electrical"), { state: state() });
    expect(k.via).toBe("keywords");
    const n = await parseQuestion(question("is the pizza here", "crew-plumbing"), { state: state() });
    expect(n).toEqual({ query: null, via: "none" });
  });

  it("every cache file is valid and keyed by its own text", async () => {
    const files = (await readdir(CACHE_DIR)).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const e = QueryCacheEntry.parse(JSON.parse(await readFile(join(CACHE_DIR, f), "utf8")));
      expect(`${cacheKey(e.text, e.crewId)}.json`).toBe(f);
    }
  });
});

describe("handleQueryRoute", () => {
  it("serves ask, briefing and digest, and ignores other routes", async () => {
    const s = state();
    const server = createServer(async (req, res) => {
      if (!(await handleQueryRoute(req, res, async () => s))) {
        res.writeHead(418);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const ask = await fetch(`${base}/api/ask`, { method: "POST", body: JSON.stringify({ crewId: "crew-plumbing", text: "where is W-12" }) });
      expect(ask.status).toBe(200);
      expect(((await ask.json()) as { text: string }).text.startsWith("HOLD:")).toBe(true);
      expect((await fetch(`${base}/api/ask`, { method: "POST", body: "{}" })).status).toBe(400);
      expect((await fetch(`${base}/api/briefing?crew=crew-plumbing&day=${SAT}`)).status).toBe(200);
      expect((await fetch(`${base}/api/briefing?crew=nobody`)).status).toBe(404);
      const dg = (await (await fetch(`${base}/api/digest`)).json()) as { day: string };
      expect(dg.day).toBe(SAT);
      expect((await fetch(`${base}/api/digest?day=bad`)).status).toBe(400);
      expect((await fetch(`${base}/api/state`)).status).toBe(418);
    } finally {
      server.close();
    }
  });
});
