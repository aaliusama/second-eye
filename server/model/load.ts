import { readFile } from "node:fs/promises";
import { GoldenReplay, Scene } from "@site/contracts";
import { fixtureScene } from "@site/contracts/fixtures";
import { warnOnce } from "../log";
import { dataPath } from "../paths";

// Owner: A. Loads the starting scene and the golden replay from data/ (owned by B).

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** data/floor.json, or the contracts fixture until B lands it. */
export async function loadStartScene(): Promise<Scene> {
  const raw = await readJson(dataPath("floor.json"));
  if (raw === undefined) {
    warnOnce("load.floor_fallback", "data/floor.json not found, using the contracts fixture scene");
    return fixtureScene;
  }
  return Scene.parse(raw);
}

/** data/replay.golden.json. Events must be in time order. */
export async function loadGoldenReplay(): Promise<GoldenReplay> {
  const raw = await readJson(dataPath("replay.golden.json"));
  if (raw === undefined) {
    warnOnce("load.replay_missing", "data/replay.golden.json not found, replaying nothing");
    return { id: "empty", events: [] };
  }
  return GoldenReplay.parse(raw);
}
