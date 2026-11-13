import { describe, expect, it } from "vitest";
import { fixtureFinding, fixtureLabels } from "@site/contracts/fixtures";
import { score } from "./score";

describe("score", () => {
  it("counts a matching finding as caught", () => {
    const r = score("fixture", fixtureLabels, [fixtureFinding]);
    expect(r.total).toEqual({ caught: 1, missed: 0, falseAlarms: 0 });
  });

  it("counts a missing finding as missed", () => {
    expect(score("fixture", fixtureLabels, []).total).toEqual({ caught: 0, missed: 1, falseAlarms: 0 });
  });

  it("counts an unlabelled finding as a false alarm", () => {
    const stray = { ...fixtureFinding, id: "f-x", sourceMessageId: "m-999" };
    expect(score("fixture", fixtureLabels, [fixtureFinding, stray]).total.falseAlarms).toBe(1);
  });
});
