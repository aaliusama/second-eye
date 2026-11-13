import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Owner: D. npm run demo starts the server on 8787 and this on 5173.
// API_PORT and WEB_PORT let a second copy run beside it (e.g. 8788 / 5174).
const apiPort = Number(process.env.API_PORT ?? 8787);
const webPort = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
