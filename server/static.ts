import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { REPO_ROOT } from "./paths";

// Hosted deployments: one process serves the API and the built web app (web/dist).
// Locally, `npm run demo` keeps using Vite on 5173; this only answers when web/dist exists.

const DIST = process.env.WEB_DIST ?? join(REPO_ROOT, "web", "dist");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

async function fileAt(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).isFile() ? path : undefined;
  } catch {
    return undefined;
  }
}

/** Serves a built web file, or index.html for app routes such as /phone. False when there is no build. */
export async function serveWeb(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const index = await fileAt(join(DIST, "index.html"));
  if (!index) return false;
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const target = normalize(join(DIST, pathname));
  // Never serve anything outside the build folder.
  const inside = target === DIST || target.startsWith(DIST + sep);
  const found = inside ? await fileAt(target) : undefined;
  if (!found && extname(pathname)) {
    // A missing file (an old asset name after a redeploy) is a 404, not the app page served as JavaScript.
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return true;
  }
  const file = found ?? index;
  const hashed = file !== index && pathname.startsWith("/assets/");
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    // Vite puts a content hash in asset names, so they can be cached for good; the page itself never is.
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
  });
  if (req.method === "HEAD") return res.end(), true;
  createReadStream(file).pipe(res);
  return true;
}
