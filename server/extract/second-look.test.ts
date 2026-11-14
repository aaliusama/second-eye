import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@site/contracts";
import { missedCues } from "./llm";
import type { MessageFacts } from "./facts";

const msg = (text: string): ChatMessage => ({ id: "x", time: "2026-11-12T09:00:00", thread: "office", senderName: "Lena", senderRole: "architect", kind: "text", text }) as ChatMessage;
const empty: MessageFacts = { id: "x", plans: [], changes: [] };

describe("second look: rules audit the model's reply for unanswered cues", () => {
  it("re-asks when a distance and a direction got no move", () => {
    expect(missedCues(msg("the 203 bath north wall goes 25cm north"), empty)).toHaveLength(1);
    expect(missedCues(msg("west side, 1.2 m"), empty)).toHaveLength(1);
  });

  it("re-asks when a decision word got no status", () => {
    expect(missedCues(msg("owner signed off the 206 vanity"), empty)).toHaveLength(1);
  });

  it("stays quiet when the reply already has that kind of fact, or there is no cue", () => {
    const moved: MessageFacts = { ...empty, changes: [{ kind: "move", elementId: "W-1", direction: "north", metres: 0.25, confidence: 0.9 }] };
    expect(missedCues(msg("the 203 bath north wall goes 25cm north"), moved)).toEqual([]);
    expect(missedCues(msg("lift working again"), empty)).toEqual([]);
    expect(missedCues(msg("we're on the east side tomorrow"), empty)).toEqual([]);
  });
});
