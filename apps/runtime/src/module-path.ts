import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveModuleDir(importMetaUrl?: string) {
  if (typeof __dirname === "string") {
    return __dirname;
  }

  if (importMetaUrl) {
    return path.dirname(fileURLToPath(importMetaUrl));
  }

  return process.cwd();
}
