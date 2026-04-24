import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const serverUrl = process.env.SIBYL_SERVER_URL || "http://localhost:3000";
const webuiBindAddr = process.env.SIBYL_WEBUI_BIND_ADDR || "localhost";
const webuiBindPort = parseInt(process.env.SIBYL_WEBUI_BIND_PORT || "5173", 10);

const wsUrl = serverUrl.replace(/^http/, "ws") + "/ws";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.SIBYL_SERVER_URL": JSON.stringify(serverUrl),
  },
  server: {
    host: webuiBindAddr,
    port: webuiBindPort,
    proxy: {
      "/api": {
        target: serverUrl,
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/ws": {
        target: wsUrl,
        ws: true,
        rewrite: (path) => path,
      },
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/e2e/**", "**/node_modules/**"],
  },
});