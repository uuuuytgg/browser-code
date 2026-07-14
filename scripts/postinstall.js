#!/usr/bin/env node
// postinstall.js — download the platform-specific opencode binary
const https = require("https")
const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const GITHUB_RELEASES = "https://github.com/lishi/browser-code/releases/download"

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"))
const version = pkg.version

// Detect platform
const platformMap = { win32: "windows", darwin: "darwin", linux: "linux" }
const archMap = { x64: "x64", arm64: "arm64" }
const platform = platformMap[process.platform] || process.platform
const arch = archMap[process.arch] || process.arch

if (!platformMap[process.platform]) {
  console.warn(`browser-code: unsupported platform ${process.platform}, skipping binary download`)
  process.exit(0)
}

const binaryName = process.platform === "win32" ? "opencode.exe" : "opencode"
const distDir = path.join(__dirname, "..", "opencode", "packages", "opencode", "dist",
  `opencode-${platform}-${arch}`, "bin")
const binaryPath = path.join(distDir, binaryName)

// Skip if binary already exists
if (fs.existsSync(binaryPath)) {
  console.log(`browser-code: binary already installed at ${binaryPath}`)
  process.exit(0)
}

// Download from GitHub Releases
const url = `${GITHUB_RELEASES}/v${version}/opencode-${platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`
console.log(`browser-code: downloading binary for ${platform}-${arch} (v${version})...`)
console.log(`  from: ${url}`)
console.log(`  to:   ${binaryPath}`)

fs.mkdirSync(distDir, { recursive: true })
const file = fs.createWriteStream(binaryPath)

https.get(url, (response) => {
  if (response.statusCode === 301 || response.statusCode === 302) {
    https.get(response.headers.location, (redirected) => {
      if (redirected.statusCode !== 200) {
        console.error(`browser-code: download failed with status ${redirected.statusCode}`)
        try { fs.unlinkSync(binaryPath) } catch (_) {}
        process.exit(1)
      }
      redirected.pipe(file)
      file.on("finish", () => {
        file.close()
        if (process.platform !== "win32") spawnSync("chmod", ["+x", binaryPath])
        console.log("browser-code: binary installed successfully")
      })
    }).on("error", (err) => {
      console.error("browser-code: download failed:", err.message)
      try { fs.unlinkSync(binaryPath) } catch (_) {}
      process.exit(1)
    })
    return
  }
  if (response.statusCode === 404) {
    console.error(`browser-code: no prebuilt binary for ${platform}-${arch} v${version}`)
    console.error(`  expected URL: ${url}`)
    console.error("  You may need to build from source: cd <install-dir> && bun run build")
    try { fs.unlinkSync(binaryPath) } catch (_) {}
    process.exit(1)
  }
  if (response.statusCode !== 200) {
    console.error(`browser-code: download failed with status ${response.statusCode}`)
    try { fs.unlinkSync(binaryPath) } catch (_) {}
    process.exit(1)
  }
  response.pipe(file)
  file.on("finish", () => {
    file.close()
    if (process.platform !== "win32") spawnSync("chmod", ["+x", binaryPath])
    console.log("browser-code: binary installed successfully")
  })
}).on("error", (err) => {
  console.error("browser-code: download failed:", err.message)
  try { fs.unlinkSync(binaryPath) } catch (_) {}
  process.exit(1)
})
