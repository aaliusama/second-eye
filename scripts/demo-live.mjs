import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!process.env.GROQ_API_KEY?.trim()) {
  console.error("Live demo requires GROQ_API_KEY in .env or the environment. Use npm run demo for the prepared offline replay.");
  process.exitCode = 1;
} else {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Start this launcher with npm run demo:live.");
  console.log("Live extraction enabled for uncached messages. Prepared replay messages still use the cache. Network and Groq availability are required.");
  const child = spawn(process.execPath, [npm, "run", "demo"], {
    cwd: root,
    env: { ...process.env, LIVE_LLM: "1" },
    stdio: "inherit",
  });
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}
