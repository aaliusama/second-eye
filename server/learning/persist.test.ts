import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Correction } from "@site/contracts";
import { all, getContext, record, reset, usePersistence } from "./index";

// Wrap the fs calls the store makes, so "no file I/O" can be asserted. They still do the real work.
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    readFileSync: vi.fn(real.readFileSync),
    writeFileSync: vi.fn(real.writeFileSync),
    renameSync: vi.fn(real.renameSync),
    rmSync: vi.fn(real.rmSync),
    mkdirSync: vi.fn(real.mkdirSync),
  };
});

const alias: Correction = {
  kind: "location_alias",
  id: "c-1",
  time: "2026-11-13T18:00:00",
  sourceMessageId: "m-050",
  alias: "the blue room",
  elementId: "room-204",
};
const misread: Correction = {
  kind: "crew_misread",
  id: "c-2",
  time: "2026-11-13T18:05:00",
  sourceMessageId: "m-060",
  crewId: "plumbing",
  note: "missed the W-12 move",
};

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(join(tmpdir(), "learning-"));
  file = join(dir, "sub", "store.json");
});

afterEach(() => {
  usePersistence(undefined);
  reset();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("learning persistence (LEARNING_FILE)", () => {
  it("round trip: corrections written on every change are loaded by the next start", () => {
    usePersistence(file);
    expect(all()).toEqual([]);
    record(alias);
    record(misread);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false); // temp file renamed into place
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual([alias, misread]);

    usePersistence(undefined); // "restart": memory gone
    expect(all()).toEqual([]);
    usePersistence(file);
    expect(all()).toEqual([alias, misread]);
    expect(getContext().locationAliases["the blue room"]).toBe("room-204");
    expect(getContext().crewNotes.plumbing).toEqual(["missed the W-12 move"]);
  });

  it("unset: in memory only, no file I/O", () => {
    vi.mocked(fs.readFileSync).mockClear();
    vi.mocked(fs.writeFileSync).mockClear();
    vi.mocked(fs.renameSync).mockClear();
    vi.mocked(fs.rmSync).mockClear();
    vi.mocked(fs.mkdirSync).mockClear();
    usePersistence(undefined);
    usePersistence("");
    record(alias);
    reset();
    record(misread);
    expect(all()).toEqual([misread]);
    for (const f of [fs.readFileSync, fs.writeFileSync, fs.renameSync, fs.rmSync, fs.mkdirSync]) {
      expect(vi.mocked(f)).not.toHaveBeenCalled();
    }
  });

  it("reset without learning clears the file", () => {
    usePersistence(file);
    record(alias);
    expect(fs.existsSync(file)).toBe(true);
    reset();
    expect(fs.existsSync(file)).toBe(false);
    usePersistence(file);
    expect(all()).toEqual([]);
  });

  it("a missing file starts empty without a log line", () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    usePersistence(file);
    expect(all()).toEqual([]);
    expect(out).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an array", '{"corrections": 1}'],
    ["invalid correction", JSON.stringify([{ ...alias, kind: "nickname" }])],
  ])("corrupt file (%s): one JSON log line, starts empty, never throws", (_label, content) => {
    fs.mkdirSync(join(dir, "sub"), { recursive: true });
    fs.writeFileSync(file, content);
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(() => usePersistence(file)).not.toThrow();
    expect(all()).toEqual([]);
    expect(out).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(out.mock.calls[0]![0]));
    expect(line).toMatchObject({ kind: "learning.load_error", file });
    out.mockRestore();
    record(alias); // still usable, and overwrites the bad file
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual([alias]);
  });
});
