#!/usr/bin/env node
// browser-code CLI — delegates to our fork's compiled binary
// The binary is built from opencode/packages/opencode/src/index.ts via:
//   cd opencode/packages/opencode && bun run script/build.ts --single

const path = require("path")
const { spawnSync } = require("child_process")

const workspaceRoot = path.resolve(__dirname, "..")
const forkBinary = path.join(workspaceRoot, "opencode/packages/opencode/dist/opencode-windows-x64/bin/opencode")

const result = spawnSync(forkBinary, process.argv.slice(2), {
  stdio: "inherit",
  env: process.env,
  cwd: workspaceRoot,
})
process.exit(result.status ?? 1)
