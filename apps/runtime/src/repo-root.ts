import fs from "node:fs";
import path from "node:path";

function isRepoRoot(candidate: string) {
  return (
    fs.existsSync(path.join(candidate, "tool-manifests", "tools.json"))
    && fs.existsSync(path.join(candidate, "prompts", "system.knowledge-agent.md"))
  );
}

export function resolveRepoRoot(startDir: string) {
  let current = path.resolve(startDir);

  while (true) {
    if (isRepoRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`REPO_ROOT_NOT_FOUND from ${startDir}`);
    }

    current = parent;
  }
}
