/// <reference lib="dom" />
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ExtractResult } from "@site/contracts";
import { fixtureFinding, fixtureFix } from "@site/contracts/fixtures";
import { dataPath } from "@site/server/paths";
import { liveCacheId } from "../server/api/live-id";
import { resolvedFindingIds } from "../web/src/derive";
import { isPlaceholder, PHONE } from "../web/src/present/beats";

describe("presenter uses the real cached script", () => {
  it.each([PHONE.plumbingIntent, PHONE.blueRoom])("has an offline intent for $crewId", async (phone) => {
    expect(isPlaceholder(phone.text)).toBe(false);
    const cacheId = liveCacheId(phone.text, phone.crewId);
    const cached = ExtractResult.parse(JSON.parse(await readFile(dataPath("llm-cache", `${cacheId}.json`), "utf8")));
    expect(cached.intents.some((intent) => intent.crewId === phone.crewId)).toBe(true);
  });

  it("keeps warning and unanswered-question findings visible after their messages are sent", () => {
    const warning = { ...fixtureFinding, severity: "warn" as const };
    const sent = { ...fixtureFix, findingId: warning.id, status: "approved" as const };
    expect(resolvedFindingIds([sent], [warning]).has(warning.id)).toBe(false);
    expect(resolvedFindingIds([{ ...sent, kind: "ask_crew" }], [fixtureFinding]).has(warning.id)).toBe(false);
    expect(resolvedFindingIds([sent], [fixtureFinding]).has(warning.id)).toBe(false);
  });
});
