import { afterEach, describe, expect, it } from "vitest";
import { fixtureScene } from "@site/contracts/fixtures";
import { all, applyToScene, getContext, record, remove, reset, version } from "./index";

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

  it("remove undoes one correction by id and leaves the rest", () => {
    const base = { kind: "location_alias", time: "2026-11-13T18:00:00", sourceMessageId: "m-050" } as const;
    record({ ...base, id: "c-1", alias: "the blue room", elementId: "room-204" });
    record({ ...base, id: "c-2", alias: "the corner room", elementId: "room-203" });
    const v = version();
    expect(remove("c-1").map((c) => c.id)).toEqual(["c-1"]);
    expect(version()).toBeGreaterThan(v);
    expect(all().map((c) => c.id)).toEqual(["c-2"]);
    expect(getContext().locationAliases).toEqual({ "the corner room": "room-203" });
    const v2 = version();
    expect(remove("c-1")).toEqual([]);
    expect(version()).toBe(v2);
  });

  it("starts empty", () => {
    expect(getContext()).toEqual({ locationAliases: {}, crewNotes: {} });
  });

  it("applyToScene adds stored nicknames to the start scene for the next run", () => {
    const base = { kind: "location_alias", time: "2026-11-13T18:00:00", sourceMessageId: "m-050" } as const;
    record({ ...base, id: "c-1", alias: "The Corner Room", elementId: "room-203" });
    record({ ...base, id: "c-2", alias: "the corner room", elementId: "room-203" }); // duplicate, other case
    record({ ...base, id: "c-3", alias: "THE BLUE ROOM", elementId: "room-204" }); // already in fixture
    record({ ...base, id: "c-4", alias: "the attic", elementId: "room-999" }); // unknown id, skipped
    const before = structuredClone(fixtureScene);

    const next = applyToScene(fixtureScene);
    const byId = (id: string) => next.elements.find((e) => e.id === id)!;
    expect(byId("room-203").aliases).toEqual(["the corner room"]);
    expect(byId("room-204").aliases).toEqual(["the blue room"]);
    expect(next.elements).toHaveLength(fixtureScene.elements.length);
    expect(fixtureScene).toEqual(before); // input not mutated
    expect(applyToScene(fixtureScene)).toEqual(next); // same input, same output
  });

  it("applyToScene without corrections returns the scene unchanged", () => {
    expect(applyToScene(fixtureScene)).toBe(fixtureScene);
  });
});
