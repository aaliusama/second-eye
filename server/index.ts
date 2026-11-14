import { createServer } from "node:http";
import { join } from "node:path";
import { handle } from "./api/index";
import { warmUp } from "./api/session";
import { usePersistence } from "./learning/index";
import { configureDismissals } from "./learning/dismissals";
import { logLine } from "./log";
import { REPO_ROOT } from "./paths";

// Owner: A. Server entry.
try {
  process.loadEnvFile(join(REPO_ROOT, ".env"));
} catch {
  // No .env: defaults apply (LIVE_LLM off, port 8787).
}

// Opt-in: LEARNING_FILE set = stored corrections survive a restart. Unset = in memory, clean every start.
usePersistence(process.env.LEARNING_FILE);
configureDismissals(process.env.LEARNING_FILE);

const port = Number(process.env.PORT ?? 8787);

createServer((req, res) => void handle(req, res)).listen(port, () => {
  logLine({ kind: "server.listening", port, liveLlm: process.env.LIVE_LLM === "1", learningFile: process.env.LEARNING_FILE || null });
  // Play the golden replay now; requests that arrive meanwhile await the same session.
  void warmUp();
});
