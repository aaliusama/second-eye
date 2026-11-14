import type { IncomingMessage, ServerResponse } from "node:http";
import { DismissalRequest } from "../../contracts/src/dismissals";
import { dismissalState, dismissFinding, undoDismissal } from "../learning/dismissals";
import { getSession, sessionNow } from "./session";

export async function handleDismissals(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const undo = /^\/api\/dismissals\/([^/]+)\/undo$/.exec(path);
  if (path !== "/api/dismissals" && !undo) return false;
  const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const s = await getSession();
  const findings = [...new Map([...s.findings, ...s.rehearsals.flatMap((r) => r.frames.flatMap((f) => f.findings))].map((f) => [f.id, f])).values()];
  if (req.method === "GET" && !undo) { send(200, dismissalState(findings, s.scene)); return true; }
  if (req.method !== "POST") { send(405, { error: "method not allowed" }); return true; }
  if (undo) {
    const found = undoDismissal(decodeURIComponent(undo[1]!), sessionNow(s));
    send(found ? 200 : 404, found ? { ok: true } : { error: "review rule not found" });
    return true;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk); size += buffer.length;
    if (size > 8192) { send(413, { error: "body too large" }); return true; }
    chunks.push(buffer);
  }
  let raw: unknown;
  try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { send(400, { error: "invalid JSON" }); return true; }
  const body = DismissalRequest.safeParse(raw);
  if (!body.success) { send(400, { error: "Finding and a reason of 3–500 characters are required." }); return true; }
  const finding = findings.find((f) => f.id === body.data.findingId);
  if (!finding) { send(404, { error: "finding not found" }); return true; }
  send(200, dismissFinding(finding, s.scene, body.data.reason, sessionNow(s)));
  return true;
}
