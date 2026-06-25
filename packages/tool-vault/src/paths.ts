import path from "node:path";

export function assertInsideRoot(target: string, roots: string[]) {
  const resolved = path.resolve(target);
  const ok = roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
  });

  if (!ok) {
    throw new Error("PATH_OUTSIDE_ALLOWED_ROOT");
  }
}

export function getIndexPath(vaultDir: string) {
  const indexPath = path.join(vaultDir, "index", "index.json");
  assertInsideRoot(indexPath, [vaultDir]);
  return indexPath;
}

export function getContentDirectory(vaultDir: string, contentType: string) {
  const directoryMap: Record<string, string> = {
    article: "articles",
    video: "videos",
    document: "documents",
    snippet: "snippets",
    resource: "resources"
  };

  const directory = path.join(vaultDir, directoryMap[contentType] ?? "articles");
  assertInsideRoot(directory, [vaultDir]);
  return directory;
}
