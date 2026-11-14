# Site record over MCP

Owner: F. The live picture of the site, served to AI agents and robot planners through the Model Context Protocol.
All site data in this repo is simulated. Every answer is worded "per the record", never as verified reality.

## Read-only on purpose

No tool approves a fix, posts a crew message or changes the scene. Decisions stay with the superintendent in the web app.
`check_plan` and `ask_site` forward questions to `POST /api/ask`, which answers from the record.

## Run

The site server must be running (`npm run demo`, or `npx tsx server/index.ts`). The MCP server reaches it over HTTP:

```
SITE_API=http://127.0.0.1:8787 npm run start -w @site/mcp
```

`SITE_API` defaults to `http://127.0.0.1:8787`. The MCP server speaks on stdio; its own log goes to stderr.

Robot demo (a route planner that only knows the site through MCP):

```
npm run robot -w @site/mcp                        # Saturday 2026-11-14, morning
npm run robot -w @site/mcp -- 2026-11-14 afternoon
```

Tests: `npm test -w @site/mcp`. `mcp.test.ts` uses a mocked fetch. `shared-record.test.ts` hosts the real site API in-process on a local port (golden replay, `LIVE_LLM=0`) and follows the W-12 ghost through three moments: before the correction is sent, after it is sent, and after the simulated crew reply. At each moment the tools must return the same latest-change findings (id, source, evidence, ghost) the web reads from `/api/state` and `/api/rehearsal`. The tools still reach the server only over HTTP.

## Tools

| Tool | Input | Answer |
|---|---|---|
| `get_site_state` | `t?` | elements by state, places, crews, planned tasks, open findings, fixes waiting for approval |
| `whats_planned` | `day?`, `placeId?`, `crewId?` | planned tasks with their source messages |
| `check_plan` | `crewId`, `taskType`, `placeId`, `day`, `slot`, `elementIds?` | HOLD or CLEAR. Uses `POST /api/ask` when it gives a verdict; when the endpoint is missing or answers without HOLD/CLEAR (e.g. it did not parse the question), only existing bookings and findings, and says why |
| `get_findings` | `check?`, `crewId?` | open live and rehearsal findings. An approved fix closes most findings; a latest-change finding stays open until the crew confirms, and is marked `awaitingConfirmation` meanwhile |
| `get_rehearsal` | `day?` | tomorrow played forward slot by slot |
| `element_history` | `elementId` | every change with who, when, thread and the quoted source message |
| `is_place_clear` | `placeId`, `day`, `slot` | `clear`, `occupied`, `hold` or `unknown` with reasons |
| `ask_site` | `text`, `crewId?` | passthrough to `POST /api/ask`; tool error "query endpoint not available" on 404 |

Input schemas reuse the zod schemas from `contracts/` (`Day`, `Slot`, `TaskType`, `CheckName`, `Id`, `ReplayTime`).

"Awaiting confirmation" (in `get_site_state`, `get_findings` and `is_place_clear`) means only that a correction was sent and no crew reply is on record yet. A confirmation means the crew replied in the simulated chat; it does not establish inspection, understanding or completed work.

`is_place_clear` never turns missing data into "clear": an unknown place is `unknown` ("Do not enter"), and a server that is down or failing is a tool error.

## Resources

- `site://scene` the floor scene
- `site://findings` live findings and fixes
- `site://rehearsal/{day}` one day's rehearsal

## Add it to Claude Code or Claude Desktop

Claude Code, from the repo root:

```
claude mcp add site-rehearsal --env SITE_API=http://127.0.0.1:8787 -- npx tsx mcp/server.ts
```

Claude Desktop (`claude_desktop_config.json`), with an absolute path to this repo:

```json
{
  "mcpServers": {
    "site-rehearsal": {
      "command": "npx",
      "args": ["tsx", "C:/path/to/Proximata-Hackathon/mcp/server.ts"],
      "env": { "SITE_API": "http://127.0.0.1:8787" }
    }
  }
}
```

## Dependencies

| Package | Version | Licence |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.32.2 (pinned) | MIT |
| `zod` | ^4.6.7 (same as contracts) | MIT |
| `tsx` | dev | MIT |
