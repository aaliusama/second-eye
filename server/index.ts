import { createServer } from "node:http";
import { join } from "node:path";
import { handle } from "./api/index";
import { logLine } from "./log";
import { REPO_ROOT } from "./paths";

// Owner: A. Server entry.
try {
  process.loadEnvFile(join(REPO_ROOT, ".env"));
} catch {
  // No .env: defaults apply (LIVE_LLM off, port 8787).
}

const port = Number(process.env.PORT ?? 8787);

createServer((req, res) => void handle(req, res)).listen(port, () => {
  logLine({ kind: "server.listening", port, liveLlm: process.env.LIVE_LLM === "1" });
});
