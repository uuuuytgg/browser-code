import path from "node:path";

export function assertInsideRoots(target: string, roots: string[]) {
  const resolvedTarget = path.resolve(target);
  const allowed = roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
  });

  if (!allowed) {
    throw new Error(`PATH_OUTSIDE_ALLOWED_ROOT: ${resolvedTarget}`);
  }
}

export function ensureAllowedRead(target: string, roots: string[]) {
  assertInsideRoots(target, roots);
}

export function ensureAllowedWrite(target: string, roots: string[]) {
  assertInsideRoots(target, roots);
}
