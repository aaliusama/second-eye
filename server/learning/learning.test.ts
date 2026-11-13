import { afterEach, describe, expect, it } from "vitest";
import { getContext, record, reset } from "./index";

afterEach(reset);

describe("learning", () => {
  it("a stored nickname reaches the next run", () => {
    record({
      kind: "location_alias",
      id: "c-1",
      time: "2026-11-13T18:00:00",
      sourceMessageId: "m-050",
      alias: "The Blue Room",
      elementId: "room-204",
    });
    expect(getContext().locationAliases["the blue room"]).toBe("room-204");
  });

  it("starts empty", () => {
    expect(getContext()).toEqual({ locationAliases: {}, crewNotes: {} });
  });
});
