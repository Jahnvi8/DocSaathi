import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client runs on :5173 (Vite default). Any request to /api is proxied to
// the Express server on :3001, so the browser only ever talks to one origin
// during development (no CORS headaches, cookies/streaming "just work").
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
