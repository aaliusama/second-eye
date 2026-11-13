import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Owner: D. The server runs on 8787 (npm run demo starts both).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
