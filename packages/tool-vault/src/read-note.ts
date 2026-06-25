import fs from "node:fs/promises";
import path from "node:path";

import { assertInsideRoot } from "./paths";

export async function readNote(vaultDir: string, relativePath: string) {
  const absolutePath = path.join(vaultDir, relativePath);
  assertInsideRoot(absolutePath, [vaultDir]);
  return fs.readFile(absolutePath, "utf8");
}
