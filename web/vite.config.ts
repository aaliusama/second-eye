import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Owner: D. npm run demo starts the server on 8787 and this on 5173.
// API_PORT and WEB_PORT let a second copy run beside it (e.g. 8788 / 5174).
const apiPort = Number(process.env.API_PORT ?? 8787);
const webPort = Number(process.env.WEB_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  // The 3D view is lazy-loaded. Without this, Vite finds three/R3F only when the toggle is pressed,
  // re-bundles mid-session and loads a second React copy ("Invalid hook call"). Pre-bundle at start.
  optimizeDeps: {
    include: ["three", "@react-three/fiber", "@react-three/drei", "react", "react-dom", "react-dom/client"],
  },
  server: {
    port: webPort,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
