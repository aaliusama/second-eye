import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, independent of the folder npm runs in. */
export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const dataPath = (...parts: string[]) => join(REPO_ROOT, "data", ...parts);
export const evalPath = (...parts: string[]) => join(REPO_ROOT, "eval", ...parts);
