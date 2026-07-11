import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["apps/**/*.{test,spec}.ts", "packages/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "opencode/**"]
  },
  resolve: {
    alias: {
      "@ska/mcp-server": path.resolve(__dirname, "apps/mcp-server/src/index.ts"),
      "@ska/schemas": path.resolve(__dirname, "packages/schemas/src/index.ts"),
      "@ska/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@ska/tool-resource": path.resolve(__dirname, "packages/tool-resource/src/index.ts"),
      "@ska/tool-vault": path.resolve(__dirname, "packages/tool-vault/src/index.ts"),
      "@ska/tool-video": path.resolve(__dirname, "packages/tool-video/src/index.ts"),
      "@ska/tool-web": path.resolve(__dirname, "packages/tool-web/src/index.ts")
    }
  }
});
