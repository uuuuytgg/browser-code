import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const releaseRoot = path.join(repoRoot, "release");
const packageRoot = path.join(releaseRoot, "browser-code");
const releaseDist = path.join(repoRoot, "apps", "local-bridge", "dist-release");
const sourceDist = path.join(repoRoot, "apps", "local-bridge", "dist");

async function main() {
  const rootPackage = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const selectedDist = await resolveSourceDist();

  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });
  await copyDirectory(selectedDist, path.join(packageRoot, "dist"));
  await normalizeCliBundle(path.join(packageRoot, "dist"));
  await copyOptionalRuntimeAssets(path.join(packageRoot, "dist"));

  const publishPackageJson = {
    name: "browser-code",
    version: rootPackage.version,
    description: "Browser Code local bridge and runtime CLI.",
    bin: {
      "browser-code": "./dist/index.js"
    },
    files: [
      "dist",
      "prompts",
      "tool-manifests",
      "README.md",
      "LICENSE",
      "NOTICE.md",
      ".env.example"
    ],
    keywords: [
      "browser-code",
      "browser-extension",
      "knowledge-agent",
      "local-bridge",
      "mcp"
    ],
    license: "MIT"
  };

  const readme = [
    "# Browser Code",
    "",
    "Browser Code is the local backend agent for the Browser Code extension.",
    "",
    "## Install",
    "",
    "```bash",
    "npm install -g browser-code",
    "```",
    "",
    "## Commands",
    "",
    "```bash",
    "browser-code start",
    "browser-code doctor",
    "browser-code version",
    "```",
    "",
    "## Default Environment",
    "",
    "- `SKA_BRIDGE_HOST=127.0.0.1`",
    "- `SKA_BRIDGE_PORT=34567`",
    "- `SKA_MODEL_PROVIDER=mock`",
    "- `SKA_VAULT_DIR=./vault`",
    "- `SKA_TEMP_DIR=./temp`",
    "",
    "Copy `.env.example` and set your provider key before switching away from mock mode."
  ].join("\n");

  await fs.writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify(publishPackageJson, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(packageRoot, "README.md"), `${readme}\n`, "utf8");
  await copyDirectory(path.join(repoRoot, "prompts"), path.join(packageRoot, "prompts"));
  await copyDirectory(path.join(repoRoot, "tool-manifests"), path.join(packageRoot, "tool-manifests"));
  await copyFile(path.join(repoRoot, "LICENSE"), path.join(packageRoot, "LICENSE"));
  await copyFile(path.join(repoRoot, "NOTICE.md"), path.join(packageRoot, "NOTICE.md"));
  await copyFile(path.join(repoRoot, ".env.example"), path.join(packageRoot, ".env.example"));
}

async function copyDirectory(source: string, target: string) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }

    await copyFile(sourcePath, targetPath);
  }
}

async function resolveSourceDist() {
  if (await pathExists(releaseDist)) {
    return releaseDist;
  }

  return sourceDist;
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(source: string, target: string) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function ensureNodeShebang(targetFile: string) {
  const raw = await fs.readFile(targetFile, "utf8");
  if (raw.startsWith("#!/usr/bin/env node")) {
    return;
  }

  await fs.writeFile(targetFile, `#!/usr/bin/env node\n${raw}`, "utf8");
}

async function normalizeCliBundle(distDir: string) {
  const cjsEntry = path.join(distDir, "index.cjs");
  const jsEntry = path.join(distDir, "index.js");
  const ctsTypes = path.join(distDir, "index.d.cts");
  const dtsTypes = path.join(distDir, "index.d.ts");

  if (await pathExists(cjsEntry)) {
    await fs.rename(cjsEntry, jsEntry);
  }

  if (await pathExists(ctsTypes)) {
    await fs.rename(ctsTypes, dtsTypes);
  }

  await ensureNodeShebang(jsEntry);
}

async function copyOptionalRuntimeAssets(distDir: string) {
  const optionalAssets = [
    {
      source: await findFileByName(path.join(repoRoot, "node_modules"), "xhr-sync-worker.js"),
      target: path.join(distDir, "xhr-sync-worker.js")
    }
  ];

  for (const asset of optionalAssets) {
    if (!asset.source) {
      continue;
    }

    await copyFile(asset.source, asset.target);
  }
}

async function findFileByName(startDir: string, fileName: string): Promise<string | null> {
  const queue = [startDir];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isFile() && entry.name === fileName) {
        return fullPath;
      }

      if (entry.isDirectory()) {
        queue.push(fullPath);
      }
    }
  }

  return null;
}

await main();
