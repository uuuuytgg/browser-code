import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  plugins: [react()],
  publicDir: "../public",
  resolve: {
    alias: {
      "@ska/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@ska/schemas": path.resolve(__dirname, "../../packages/schemas/src/index.ts")
    }
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "src/sidepanel/index.html"),
        content: path.resolve(__dirname, "src/content/content-script.ts"),
        serviceWorker: path.resolve(__dirname, "src/service-worker/index.ts")
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") {
            return "content/content-script.js";
          }
          if (chunkInfo.name === "serviceWorker") {
            return "service-worker/index.js";
          }
          return "assets/[name].js";
        }
      }
    }
  }
});
