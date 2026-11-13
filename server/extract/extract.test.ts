import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractResult, type ChatMessage, type LearningContext } from "@site/contracts";
import { fixtureScene, W12_AFTER } from "@site/contracts/fixtures";
import { extract, extractLive } from "./index";
import { groqCall, MISSING_KEY, systemPrompt } from "./llm";

// No network: fetch is always mocked.

const ctx: LearningContext = { locationAliases: { "the blue room": "room-204" }, crewNotes: {} };

const message: ChatMessage = {
  id: "m-test-1",
  time: "2026-11-13T17:40:00",
  thread: "site-group",
  senderName: "Marek (Novak Plumbing)",
  senderRole: "crew_lead",
  crewId: "crew-plumbing",
  text: "tomorrow morning we rough in the 204 bath along the east wall",
  kind: "text",
};

const reply = (content: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 200 ? JSON.stringify({ choices: [{ message: { content } }] }) : content, { status, headers });

const intent = {
  crewId: "crew-plumbing",
  day: "2026-11-14",
  slot: "morning",
  taskType: "rough_in_plumbing",
  description: "Rough in the 204 bathroom along the east wall",
  placeId: "room-204",
  elementIds: ["W-12"],
  confidence: 0.88,
};

let fetchMock: ReturnType<typeof vi.fn>;
let logs: Record<string, unknown>[];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GROQ_API_KEY", "test-key");
  vi.stubEnv("LIVE_LLM", "1");
  logs = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    for (const line of String(chunk).split("\n").filter(Boolean)) {
      try {
        logs.push(JSON.parse(line));
      } catch {
        // not a log line
      }
    }
    return true;
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("extractLive", () => {
  it("parses a valid reply into an ExtractResult", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        JSON.stringify({
          operations: [{ type: "plan_task", confidence: 0.88, task: { ...intent, order: 0, status: "planned", confidence: undefined } }],
          intents: [intent],
        }),
      ),
    );
    const { result, error } = await extractLive(message, ctx, fixtureScene);
    expect(error).toBeUndefined();
    expect(ExtractResult.parse(result)).toEqual(result);
    expect(result.operations).toHaveLength(1);
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]!.placeId).toBe("room-204");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.messages[0].content).toContain("W-12");
    expect(body.messages[0].content).toContain('"the blue room" = room-204');
    expect(body.messages[1].content).toContain(message.text);
  });

  it("forces ids, time, thread and source from the message, not the model", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        JSON.stringify({
          operations: [
            {
              type: "move",
              id: "evil",
              time: "1999-01-01T00:00:00",
              sourceMessageId: "m-other",
              thread: "office",
              elementId: "W-12",
              to: W12_AFTER,
              confidence: 0.9,
            },
          ],
          intents: [{ ...intent, id: "x", crewId: "crew-drywall", time: "1999-01-01T00:00:00", sourceMessageId: "m-other" }],
        }),
      ),
    );
    const { result } = await extractLive(message, ctx, fixtureScene);
    const op = result.operations[0]!;
    expect(op).toMatchObject({ id: "op-m-test-1-1", time: message.time, sourceMessageId: message.id, thread: "site-group" });
    expect(result.intents[0]).toMatchObject({
      id: "intent-m-test-1-1",
      time: message.time,
      sourceMessageId: message.id,
      crewId: "crew-plumbing",
    });
    expect(result.messageId).toBe(message.id);
  });

  it("drops operations on unknown elements and logs one line per rejection", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        JSON.stringify({
          operations: [
            { type: "set_status", elementId: "W-99", state: "unconfirmed", confidence: 0.4 },
            { type: "remove", elementId: "room-777", confidence: 0.5 },
            { type: "set_status", elementId: "W-12", state: "unconfirmed", confidence: 0.4 },
          ],
          intents: [{ ...intent, placeId: "room-999", elementIds: ["W-12", "W-77"] }],
        }),
      ),
    );
    const { result } = await extractLive(message, ctx, fixtureScene);
    expect(result.operations.map((o) => o.type === "set_status" && o.elementId)).toEqual(["W-12"]);
    // Unknown place is left out, never guessed; unknown element ids are trimmed.
    expect(result.intents[0]!.placeId).toBeUndefined();
    expect(result.intents[0]!.elementIds).toEqual(["W-12"]);
    const rejected = logs.filter((l) => l.kind === "extract.rejected");
    expect(rejected.map((r) => r.detail).sort()).toEqual(["W-77", "W-99", "room-777", "room-999"]);
    expect(rejected.every((r) => r.messageId === message.id)).toBe(true);
  });

  it("allows add with a new id but not with an existing one", async () => {
    const element = { type: "fixture", name: "Vanity", aliases: [], geometry: { kind: "point", at: [18, 3] }, state: "proposed" };
    fetchMock.mockResolvedValueOnce(
      reply(
        JSON.stringify({
          operations: [
            { type: "add", element: { ...element, id: "F-new" }, confidence: 0.7 },
            { type: "add", element: { ...element, id: "W-12" }, confidence: 0.7 },
            { type: "set_status", elementId: "F-new", state: "approved", confidence: 0.7 },
          ],
          intents: [],
        }),
      ),
    );
    const { result } = await extractLive(message, ctx, fixtureScene);
    expect(result.operations.map((o) => o.type)).toEqual(["add", "set_status"]);
  });

  it("retries once on invalid JSON, then returns an empty result with a logged error", async () => {
    fetchMock.mockResolvedValueOnce(reply("not json {")).mockResolvedValueOnce(reply("still not json"));
    const { result, error } = await extractLive(message, ctx, fixtureScene);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body).messages.at(-1).content).toContain("invalid");
    expect(result).toEqual({ messageId: message.id, operations: [], intents: [] });
    expect(error).toMatch(/invalid twice/);
    expect(logs.some((l) => l.kind === "extract.error" && l.messageId === message.id)).toBe(true);
  });

  it("recovers when the retry is valid", async () => {
    fetchMock.mockResolvedValueOnce(reply("oops")).mockResolvedValueOnce(reply(JSON.stringify({ operations: [], intents: [intent] })));
    const { result, error } = await extractLive(message, ctx, fixtureScene);
    expect(error).toBeUndefined();
    expect(result.intents).toHaveLength(1);
  });

  it("never throws on a server error", async () => {
    fetchMock.mockResolvedValueOnce(reply("boom", 500));
    const { result, error } = await extractLive(message, ctx, fixtureScene);
    expect(result.operations).toEqual([]);
    expect(error).toMatch(/500/);
  });

  it("says clearly that the key is missing and makes no call", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const { result, error } = await extractLive(message, ctx, fixtureScene);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.operations).toEqual([]);
    expect(error).toBe(MISSING_KEY);
    expect(error).toContain("GROQ_API_KEY");
    expect(logs.find((l) => l.kind === "extract.error")?.error).toBe(MISSING_KEY);
    expect(JSON.stringify(logs)).not.toContain("test-key");
  });
});

describe("groqCall", () => {
  it("waits and retries on 429", async () => {
    fetchMock
      .mockResolvedValueOnce(reply("Rate limit reached. Please try again in 1.5s.", 429))
      .mockResolvedValueOnce(reply('{"operations":[],"intents":[]}'));
    const sleep = vi.fn(async () => {});
    expect(await groqCall([{ role: "user", content: "x" }], sleep)).toBe('{"operations":[],"intents":[]}');
    expect(sleep).toHaveBeenCalledWith(2500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("prompt", () => {
  it("comes from prompts/extract.md and lists elements, crews and the five operation types", () => {
    const p = systemPrompt(fixtureScene, ctx);
    expect(p).not.toContain("{{");
    for (const t of ["move", "add", "remove", "set_status", "plan_task"]) expect(p).toContain(`"type":"${t}"`);
    expect(p).toContain("crew-plumbing");
    expect(p).toContain("unconfirmed");
  });
});

describe("extract (demo mode)", () => {
  it("reads data/llm-cache and makes no network call", async () => {
    vi.stubEnv("LIVE_LLM", "0");
    const result = await extract({ ...message, id: "m-001" }, ctx);
    expect(result.messageId).toBe("m-001");
    expect(ExtractResult.parse(result)).toEqual(result);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing on a cache miss, logged, with no network call", async () => {
    vi.stubEnv("LIVE_LLM", "0");
    const result = await extract({ ...message, id: "m-no-such-entry" }, ctx);
    expect(result).toEqual({ messageId: "m-no-such-entry", operations: [], intents: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.some((l) => l.kind === "extract.cache_miss")).toBe(true);
  });

  it("live mode still prefers a cache entry", async () => {
    const result = await extract({ ...message, id: "m-001" }, ctx, fixtureScene);
    expect(result.messageId).toBe("m-001");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
