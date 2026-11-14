import { pathToFileURL } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CheckName, Day, Id, ReplayTime, Slot, TaskType } from "@site/contracts";
import { z } from "zod";
import { createSiteApi, type SiteApi } from "./api";
import {
  askSite,
  checkPlan,
  elementHistory,
  getFindings,
  getRehearsal,
  getSiteState,
  isPlaceClear,
  whatsPlanned,
  type ToolOutput,
} from "./tools";

// Owner: F. MCP server (stdio): the site record for AI agents and robot planners.
// Read-only. It talks to the site server over HTTP (SITE_API) and never approves fixes or posts messages.

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function result(out: ToolOutput) {
  return {
    content: [{ type: "text" as const, text: `${out.text}\n\n${JSON.stringify(out.data)}` }],
    structuredContent: out.data,
    ...(out.isError ? { isError: true } : {}),
  };
}

function json(uri: string, data: unknown) {
  return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
}

export function createSiteMcpServer(api: SiteApi = createSiteApi()): McpServer {
  const server = new McpServer({ name: "second-eye", version: "0.1.0" });

  server.registerTool(
    "get_site_state",
    {
      title: "Site state",
      description:
        "Live picture of the floor per the site record (simulated data): elements by state, crews, planned tasks, open findings, fixes waiting for the superintendent. Optional t replays the record up to that replay time.",
      inputSchema: { t: ReplayTime.optional().describe("Replay time like 2026-11-13T17:40:00") },
      annotations: READ_ONLY,
    },
    async (args) => result(await getSiteState(api, args)),
  );

  server.registerTool(
    "whats_planned",
    {
      title: "What is planned",
      description: "Planned tasks per the record, filtered by day, place (room or zone id) and crew.",
      inputSchema: { day: Day.optional(), placeId: Id.optional(), crewId: Id.optional() },
      annotations: READ_ONLY,
    },
    async (args) => result(await whatsPlanned(api, args)),
  );

  server.registerTool(
    "check_plan",
    {
      title: "Check a plan",
      description:
        "HOLD or CLEAR for a crew's plan before it starts. Uses the site's query endpoint when available, otherwise existing bookings and findings. Does not post anything to the crew chat.",
      inputSchema: {
        crewId: Id,
        taskType: TaskType,
        placeId: Id,
        day: Day,
        slot: Slot,
        elementIds: z.array(Id).optional(),
      },
      annotations: READ_ONLY,
    },
    async (args) => result(await checkPlan(api, args)),
  );

  server.registerTool(
    "get_findings",
    {
      title: "Open findings",
      description:
        "Open findings from the live check and the evening rehearsal (latest_change, space_clash, order_of_work, open_decision), each with its source message.",
      inputSchema: { check: CheckName.optional(), crewId: Id.optional() },
      annotations: READ_ONLY,
    },
    async (args) => result(await getFindings(api, args)),
  );

  server.registerTool(
    "get_rehearsal",
    {
      title: "Rehearsal",
      description: "Tomorrow's plan played forward slot by slot, with the findings in each step. Defaults to the latest planned day.",
      inputSchema: { day: Day.optional() },
      annotations: READ_ONLY,
    },
    async (args) => result(await getRehearsal(api, args)),
  );

  server.registerTool(
    "element_history",
    {
      title: "Element history",
      description: "Who changed an element, when, in which thread, with the source message text.",
      inputSchema: { elementId: Id },
      annotations: READ_ONLY,
    },
    async (args) => result(await elementHistory(api, args)),
  );

  server.registerTool(
    "is_place_clear",
    {
      title: "Is the place clear",
      description:
        "For robots and route planners: clear, occupied, hold or unknown for a room or zone in a day slot. Clear only when nothing is planned there and no open finding touches it; an unknown place is never clear.",
      inputSchema: { placeId: Id, day: Day, slot: Slot },
      annotations: READ_ONLY,
    },
    async (args) => result(await isPlaceClear(api, args)),
  );

  server.registerTool(
    "ask_site",
    {
      title: "Ask the site",
      description: "Ask a question in plain words; the site answers from the record. Questions only, nothing is decided here.",
      inputSchema: { text: z.string().min(1), crewId: Id.optional() },
      annotations: { ...READ_ONLY, idempotentHint: false },
    },
    async (args) => result(await askSite(api, args)),
  );

  server.registerResource(
    "scene",
    "site://scene",
    { title: "Scene", description: "The floor scene per the record", mimeType: "application/json" },
    async (uri) => json(uri.href, (await api.state()).scene),
  );

  server.registerResource(
    "findings",
    "site://findings",
    { title: "Findings", description: "Live findings and fixes per the record", mimeType: "application/json" },
    async (uri) => {
      const s = await api.state();
      return json(uri.href, { findings: s.findings, fixes: s.fixes });
    },
  );

  server.registerResource(
    "rehearsal",
    new ResourceTemplate("site://rehearsal/{day}", { list: undefined }),
    { title: "Rehearsal", description: "Rehearsal of one day's plan", mimeType: "application/json" },
    async (uri, variables) => {
      const day = String(Array.isArray(variables.day) ? variables.day[0] : variables.day);
      const r = await api.rehearsal(day);
      return json(uri.href, r ?? { error: `not found: no plan to rehearse for ${day}` });
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createSiteMcpServer();
  await server.connect(new StdioServerTransport());
  // stdout carries the protocol; anything else goes to stderr.
  process.stderr.write(`second-eye MCP server on stdio, SITE_API=${process.env.SITE_API ?? "http://127.0.0.1:8787"}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
