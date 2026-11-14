import type { IncomingMessage, ServerResponse } from "node:http";
import { SheetRevisionResponse } from "@site/contracts";
import { sheetRevisions } from "../sheets/index";
import { getSession } from "./session";

export async function handleSheetsRoute(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== "GET" || new URL(req.url ?? "/", "http://localhost").pathname !== "/api/sheets") return false;
  const session = await getSession();
  const body = SheetRevisionResponse.parse(sheetRevisions(session.messages));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
  return true;
}
