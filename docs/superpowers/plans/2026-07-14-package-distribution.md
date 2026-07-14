# Browser Code 打包发行实施计划

> **对于执行代理：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施。

**目标：** 将 Browser Code 从本地 Monorepo 转型为可通过 npm 全局安装的标准 CLI 包，支持跨平台。

**架构：** npm 包 + postinstall 按平台下载预编译二进制。包体只含 wrapper 脚本 + `.browser-code/` 配置 + `harness/` 脚本 + `wiki/` 策略，轻量发布。二进制托管在 GitHub Releases。

**技术栈：** Node.js, OpenCode (fork), Bun (构建)

---

## 全局约束

- 不修改 `opencode/packages/opencode/src/` 中任何 `[BROWSER-CODE-CHANGE]` 代码（已在之前阶段完成定制）
- 不修改 `.browser-code/tool/` 下任何工具
- 不修改 `AGENTS.md`（已在上一步完善）
- 不添加新 npm 依赖
- `process.cwd()` 路径策略不变（每个项目目录独立知识空间）
- 跨平台二进制由 GitHub Actions 构建，手动上传到 GitHub Releases

---

### 任务 1：改造 browser-code.cjs 多平台 wrapper

**文件：**
- 修改：`bin/browser-code.cjs`

**说明：** 当前 wrapper 硬编码 Windows x64 路径。需要改为自动检测平台和架构，找到对应二进制。

- [ ] **步骤 1：重写为多平台自动检测**

将 `bin/browser-code.cjs` 替换为：

```javascript
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
```

关键变化：`cwd: process.cwd()` 改为用户当前目录（不再强制为 workspaceRoot），`process.cwd()` 路径策略正确生效。

- [ ] **步骤 2：提交**

```bash
git add bin/browser-code.cjs
git commit -m "feat: multi-platform browser-code wrapper — auto-detect platform/arch, cwd to user directory"
```

---

### 任务 2：创建 postinstall 下载脚本

**文件：**
- 创建：`scripts/postinstall.js`

**说明：** npm 全局安装时自动下载对应平台的 opencode 二进制。包本身不含 161MB 的二进制，大幅减小 `npm install` 的体积和时间。

- [ ] **步骤 1：创建 postinstall 脚本**

```javascript
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

https.get(url, { followRedirects: true }, (response) => {
  if (response.statusCode === 404) {
    console.error(`browser-code: no prebuilt binary for ${platform}-${arch} v${version}`)
    console.error(`  expected URL: ${url}`)
    console.error("  You may need to build from source: cd <install-dir> && bun run build")
    fs.unlinkSync(binaryPath)
    process.exit(1)
  }
  if (response.statusCode !== 200) {
    console.error(`browser-code: download failed with status ${response.statusCode}`)
    fs.unlinkSync(binaryPath)
    process.exit(1)
  }
  response.pipe(file)
  file.on("finish", () => {
    file.close()
    // Make executable on Unix
    if (process.platform !== "win32") {
      spawnSync("chmod", ["+x", binaryPath])
    }
    console.log("browser-code: binary installed successfully")
  })
}).on("error", (err) => {
  console.error("browser-code: download failed:", err.message)
  fs.unlinkSync(binaryPath)
  process.exit(1)
})
```

- [ ] **步骤 2：更新 package.json 的 scripts**

在 `package.json` 中新增 `postinstall` 脚本和在 `files` 字段中新增 `scripts/postinstall.js`：

```json
"scripts": {
  "postinstall": "node scripts/postinstall.js",
  ...
},
"files": [
  "bin/browser-code.cjs",
  "scripts/postinstall.js",
  ...
]
```

- [ ] **步骤 3：提交**

```bash
git add scripts/postinstall.js package.json
git commit -m "feat: add postinstall binary download script for cross-platform npm install"
```

---

### 任务 3：配置 npm 发布清单

**文件：**
- 修改：`package.json`

**说明：** 配置 `files`、`bin`、`os`、`cpu`、`private` 等 npm 发布字段。npm 包不应包含源码、用户数据、node_modules。

- [ ] **步骤 1：更新 package.json 发布字段**

将 `package.json` 修改为：

```json
{
  "name": "browser-code",
  "version": "0.2.0",
  "description": "Browser Code — web content capture, research, and knowledge management agent",
  "license": "MIT",
  "private": false,
  "type": "module",
  "packageManager": "pnpm@11.5.0",
  "bin": {
    "browser-code": "./bin/browser-code.cjs"
  },
  "files": [
    "bin/browser-code.cjs",
    "scripts/postinstall.js",
    ".browser-code/browser-code.jsonc",
    ".browser-code/tool/",
    "harness/",
    "tools/mcp/bin/",
    "wiki/",
    "AGENTS.md",
    "README.md",
    "package.json"
  ],
  "os": ["win32", "darwin", "linux"],
  "cpu": ["x64", "arm64"],
  "scripts": {
    "postinstall": "node scripts/postinstall.js",
    "test": "echo \"no tests yet\"",
    "build": "echo \"build via opencode/packages/opencode: bun run script/build.ts --single\""
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/lishi/browser-code"
  },
  "keywords": ["browser", "web", "archive", "knowledge-base", "agent", "research", "opencode"],
  "author": "lisiyuan968@gmail.com"
}
```

注意：`"private": false` 是关键改动，当前值为 `true`，阻止了 `npm publish`。

- [ ] **步骤 2：创建 README.md**

创建 `README.md` 至少包含：
```markdown
# Browser Code

Web content capture, research, and knowledge management agent.

## Install
npm install -g browser-code

## Usage
browser-code --port 34567

## Knowledge Base
On first run, Browser Code creates `vault/` and `kb/` directories in your current working directory.
```

- [ ] **步骤 3：提交**

```bash
git add package.json README.md
git commit -m "feat: configure npm publish — files whitelist, bin entry, platform support, private=false"
```

---

### 任务 4：配置 .browser-code/ 全局加载路径

**文件：**
- 待确认：`opencode/packages/opencode/src/config/config.ts` 或相关文件

**说明：** 确认全局安装后 `.browser-code/` 是否能被正确发现。当前 OpenCode 从工作目录向上搜索 `.browser-code/` 目录，也可能搜索 `~/.browser-code/`。npm 全局安装时配置文件在 `<global>/node_modules/browser-code/.browser-code/` 下，需要确认这个路径在搜索范围中。

- [ ] **步骤 1：阅读 config.ts 中的目录搜索逻辑**

阅读 `opencode/packages/opencode/src/config/config.ts` 和 `opencode/packages/opencode/src/config/paths.ts`，找到 `.browser-code/` 目录的搜索逻辑。

关键问题：
- 是否搜索 npm 全局安装目录下的 `.browser-code/`？
- 是否通过 `BROWSER_CODE_CONFIG_DIR` 环境变量可以覆盖？

- [ ] **步骤 2：根据发现决定是否需要修改**

**情况 A（不需要改）：** 如果搜索逻辑已经覆盖了全局安装路径，或支持环境变量覆盖 → 不需要修改代码，只需在 postinstall 中设置提示。
**情况 B（需要改）：** 如果不覆盖 → 修改 config.ts 新增搜索路径，或在 browser-code.cjs 中设置环境变量 `BROWSER_CODE_CONFIG_DIR` 指向安装目录。

- [ ] **步骤 3：提交**

```bash
git add <修改的文件>
git commit -m "fix: ensure .browser-code/ config is discoverable from npm global install"
```

---

### 任务 5：跨平台二进制构建

**文件：**
- 创建：`.github/workflows/release.yml`（GitHub Actions）

**说明：** 通过 GitHub Actions 在 Windows、macOS、Linux 上自动构建 opencode 二进制，发布到 GitHub Releases。

- [ ] **步骤 1：创建 GitHub Actions workflow**

```yaml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: windows-latest
            platform: windows
            arch: x64
          - os: macos-latest
            platform: darwin
            arch: arm64
          - os: macos-13
            platform: darwin
            arch: x64
          - os: ubuntu-latest
            platform: linux
            arch: x64

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Build opencode binary
        working-directory: opencode/packages/opencode
        run: bun run script/build.ts --single

      - name: Upload to Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            opencode/packages/opencode/dist/opencode-${{ matrix.platform }}-${{ matrix.arch }}/bin/*
```

- [ ] **步骤 2：首次手动构建非 Windows 二进制**

在本地或通过 CI 首次构建 macOS 和 Linux 二进制，手动上传到 GitHub Releases 作为 v0.2.0 的初始二进制。

- [ ] **步骤 3：提交**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow for cross-platform binary builds"
```

---

### 任务 6：首次发布 + 安装测试

**文件：**
- 无新文件

**说明：** 首次 `npm publish`，然后在另一台机器或另一个目录测试 `npm install -g browser-code`。

- [ ] **步骤 1：确认所有文件到位**

```bash
npm pack --dry-run
# 确认 files 清单正确，不包含源码/user data/node_modules
```

- [ ] **步骤 2：首次发布**

```bash
npm publish
# 或 npm publish --tag beta 首次测试
```

- [ ] **步骤 3：在干净环境测试安装**

```bash
# 在另一台机器或虚拟机中
npm install -g browser-code
browser-code --version
# 预期：0.2.0
```

- [ ] **步骤 4：功能测试**

```bash
mkdir test-project && cd test-project
browser-code --port 34567
# 确认 vault/ 和 kb/ 创建在当前目录
# 确认 ProReader 子代理可 spawn
# 确认 KB 管线正常
```

- [ ] **步骤 5：提交**

```bash
git tag v0.2.0
git push origin v0.2.0
```

---

## 实施顺序

```
任务 1 (wrapper 改造)           ← 无依赖
任务 2 (postinstall 脚本)        ← 无依赖，可与 1 并行
    ↓
任务 3 (npm 发布配置)           ← 依赖 2（package.json 引用 postinstall）
    ↓
任务 4 (.browser-code/ 路径)    ← 依赖 3（需要知道安装后的实际路径结构）
    ↓
任务 5 (跨平台 CI)              ← 依赖 1（多平台 wrapper 已就绪）
    ↓
任务 6 (首次发布 + 测试)        ← 依赖所有前序任务
```

---

## 验收标准

- [ ] `npm install -g browser-code` 安装成功，无红色报错
- [ ] `browser-code --version` 输出正确版本号
- [ ] `browser-code --port 34567` 启动成功，TUI 可见
- [ ] 在任意目录启动，`vault/` 和 `kb/` 创建在当前目录（`process.cwd()` 生效）
- [ ] ProReader 子代理可正常 spawn（`task({subagent_type:"proreader"})` 不报 Unknown agent type）
- [ ] 4 个学术 Agent 可正常 spawn
- [ ] KB 管线（save_source → save_claims → after_capture）正常
- [ ] `.browser-code/browser-code.jsonc` 配置被正确加载（5 个 agent type 可见）
- [ ] macOS 和 Linux 上可启动（CI 二进制 + 本地测试后确认）
- [ ] npm 包大小 < 10MB（不含二进制，二进制通过 postinstall 下载）
