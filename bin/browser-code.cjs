#!/usr/bin/env node
// browser-code CLI — delegates to platform-specific opencode binary
const path = require("path")
const { spawnSync } = require("child_process")

// Detect platform and architecture
const platformMap = {
  win32: "windows",
  darwin: "darwin",
  linux: "linux",
}
const archMap = {
  x64: "x64",
  arm64: "arm64",
}

const platform = platformMap[process.platform] || process.platform
const arch = archMap[process.arch] || process.arch
const binaryName = process.platform === "win32" ? "opencode.exe" : "opencode"

// Binary location (relative to this script)
// npm global install: <prefix>/node_modules/browser-code/bin/ → .. → opencode/...
// Dev mode: D:\ClaudeData\browser agent\bin\ → .. → opencode/...
const workspaceRoot = path.resolve(__dirname, "..")
const distDir = path.join("opencode", "packages", "opencode", "dist",
  `opencode-${platform}-${arch}`, "bin", binaryName)
const forkBinary = path.join(workspaceRoot, distDir)

// Ensure .browser-code/ config from the npm package is discoverable
// OpenCode searches: working-dir (up) → ~/.browser-code/ → BROWSER_CODE_CONFIG_DIR
// Set BROWSER_CODE_CONFIG_DIR to the npm package's .browser-code/ so it's always found
if (!process.env.BROWSER_CODE_CONFIG_DIR) {
  process.env.BROWSER_CODE_CONFIG_DIR = path.join(workspaceRoot, ".browser-code")
}

// Ensure KB/vault/index data goes to the user's launch directory, not the npm package dir.
// harness scripts default to import.meta.dir (npm package dir on global install = C drive).
// Override via env so data stays with the user's project.
if (!process.env.BROWSER_CODE_DATA_DIR) {
  process.env.BROWSER_CODE_DATA_DIR = process.cwd()
}

try {
  const result = spawnSync(forkBinary, process.argv.slice(2), {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(), // NOT workspaceRoot — respect user's current directory
  })
  process.exit(result.status ?? 1)
} catch (e) {
  console.error("Failed to launch browser-code:", e.message)
  console.error("Make sure the platform binary exists at:", forkBinary)
  process.exit(1)
}
