import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Element, Geometry, Scene } from "@site/contracts";

// Owner: F. A "robot planner" that only knows the site through MCP.
// It asks is_place_clear for every room and plans a route that skips occupied and held rooms.
// Usage: npm run robot -w @site/mcp [-- <day> <morning|afternoon|full_day>]. Deterministic for the same record.

const here = dirname(fileURLToPath(import.meta.url));
const day = process.argv[2] ?? "2026-11-14";
const slot = process.argv[3] ?? "morning";

function centre(g: Geometry): [number, number] {
  if (g.kind === "point") return g.at;
  const pts = g.kind === "segment" ? [g.from, g.to] : g.points;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

type Status = "clear" | "occupied" | "hold" | "unknown";
interface PlaceAnswer {
  status: Status;
  crews?: string[];
  reasons?: string[];
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", join(here, "server.ts")],
    cwd: here,
    env: { ...getDefaultEnvironment(), SITE_API: process.env.SITE_API ?? "http://127.0.0.1:8787" },
    stderr: "ignore",
  });
  const client = new Client({ name: "demo-robot", version: "0.1.0" });
  await client.connect(transport);

  try {
    const res = await client.readResource({ uri: "site://scene" });
    const first = res.contents[0];
    if (!first || !("text" in first)) throw new Error("site://scene returned no text");
    const scene = JSON.parse(String(first.text)) as Scene & { error?: string };
    const rooms: Element[] = scene.elements
      .filter((e) => e.type === "room")
      .sort((a, b) => centre(a.geometry)[0] - centre(b.geometry)[0] || a.id.localeCompare(b.id));

    console.log(`Robot planner: ${scene.name}, ${day} ${slot.replace("_", " ")}. Simulated site data, per the record.`);
    const route: string[] = [];
    for (const room of rooms) {
      const r = await client.callTool({ name: "is_place_clear", arguments: { placeId: room.id, day, slot } });
      const a = (r.structuredContent ?? { status: "unknown" }) as unknown as PlaceAnswer;
      // A tool error (server down, bad data) is never clear.
      const status: Status = r.isError ? "unknown" : a.status;
      const why = status === "clear" ? "visit" : `skip: ${a.reasons?.[0] ?? "no answer from the site"}`;
      console.log(`  ${room.name.padEnd(10)} ${status.toUpperCase().padEnd(8)} ${why}`);
      if (status === "clear") route.push(room.name);
    }
    console.log(`Route: corridor -> ${route.length ? route.join(" -> ") : "(no room is clear)"} -> corridor`);
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error(`robot planner stopped: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
