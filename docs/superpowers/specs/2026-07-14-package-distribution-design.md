# Browser Code 打包发行设计规范

> **版本**：v1.0
> **日期**：2026-07-14
> **状态**：草稿 · 待审批

---

## 1. 背景与目标

Browser Code 目前是一个 Monorepo 工作区，通过 `opencode/` fork 直接嵌入定制版 OpenCode 框架。项目需要在任意机器/目录上通过 npm 全局安装运行，不再局限于当前开发目录。

### 1.1 目标

1. **npm 包化**：通过 `npm install -g browser-code` 安装
2. **跨平台**：至少支持 Windows x64 + macOS arm64/x64 + Linux x64
3. **项目独立知识空间**：在任意目录启动，`vault/` 和 `kb/` 创建在当前工作目录下（已有 `process.cwd()` 保证）
4. **可更新**：`npm update -g browser-code` 即可升级

---

## 2. 当前状态

### 2.1 目录结构（清理后）

```
browser agent/
├── .browser-code/          # agent 配置 + 自定义工具
│   ├── browser-code.jsonc  # agent 定义（proreader + 4 学术 agent）
│   └── tool/               # kb_manage, proreader, rescue, save_markdown_note, search_vault
├── bin/
│   ├── browser-code.cjs    # CLI 入口（→ opencode.exe）
│   └── browser-code.exe    # 预编译二进制（161MB，仅 Windows）
├── docs/superpowers/       # 设计文档
│   ├── specs/              # 设计规范
│   └── plans/              # 实施计划
├── harness/                # KB 管线脚本（after-capture, build_index, search, mcp-server 等）
├── opencode/               # 定制版 OpenCode fork（~6,000 文件）
│   └── packages/opencode/src/
│       ├── agent/          # agent 类型系统
│       ├── browser-code/   # core-context.ts
│       ├── session/prompt/ # browser-code.txt, proreader.txt
│       └── tool/           # 核心工具（read, write, webfetch, kb_manage 等）
├── packages/
│   └── research/src/       # ProReader 研究引擎（12 provider）
├── tools/mcp/              # MCP 工具二进制
│   └── bin/douyin.exe      # 抖音 CLI MCP
├── wiki/                   # KB 策略文档
├── AGENTS.md               # 项目级约束文件
├── package.json            # 根工作区清单
├── pnpm-workspace.yaml     # pnpm monorepo 声明
└── .gitignore
```

### 2.2 入口点

`package.json` 第 7-9 行：
```json
"bin": {
  "browser-code": "./bin/browser-code.cjs"
}
```

`bin/browser-code.cjs` 是一个 18 行 Node.js wrapper，解析工作区根目录后调用：
```
opencode/packages/opencode/dist/opencode-windows-x64/bin/opencode.exe
```

### 2.3 定制点（[BROWSER-CODE-CHANGE]）

共 36 处定制，分布在 8 个文件中：

| 文件 | 定制类型 |
|------|---------|
| `index.ts` (9) | 移除编码命令（Github、PR、Attach、ACP、Generate），品牌化 `browser-code` CLI |
| `web_to_markdown.ts` (11) | 大规模增强：标签规范化、图片本地化、Readability 容错 |
| `agent/agent.ts` (3) | 移除 `plan` agent、自定义 general agent |
| `tool/registry.ts` (8) | 移除编码工具（plan/LSP/patch），新增 OCR/ASR/transcribe |
| `session/system.ts` (2) | 自定义 agent 身份 → "网页资源归档 agent" |
| `tool/transcribe_audio.ts` (1) | 新增 Volcengine 云 ASR |
| `tool/ocr_text.ts` (1) | 新增 PaddleOCR |
| `tool/fetch_transcript.ts` (1) | yt-dlp 字幕获取 |

---

## 3. 发行策略

### 3.1 推荐方案：npm 发布 opencode fork 包

**核心思路：** 把整个项目作为标准的 npm 包发布。`browser-code` 入口指向 `opencode` 的构建产物。用户 `npm install -g browser-code` 后即可全局使用。

#### 架构

```
npm install -g browser-code
    │
    ├── 下载预编译的 opencode 二进制（按平台）
    ├── 安装 .browser-code/ 配置到全局
    ├── 安装 harness/ 脚本
    └── 注册 CLI: browser-code → bin/browser-code.cjs
```

#### 包结构（npm publish 的内容）

```
browser-code/
├── bin/
│   └── browser-code.cjs          # CLI wrapper
├── .browser-code/
│   ├── browser-code.jsonc        # agent 定义
│   └── tool/                     # 自定义工具（kb_manage 等）
├── harness/                      # KB 管线
├── opencode/
│   └── packages/opencode/dist/   # 各平台预编译二进制
│       ├── opencode-windows-x64/bin/opencode.exe
│       ├── opencode-darwin-arm64/bin/opencode
│       └── opencode-linux-x64/bin/opencode
├── tools/mcp/bin/                # MCP 工具二进制
├── wiki/                         # KB 策略
├── AGENTS.md                     # 项目约束
├── package.json                  # 入口 + bin 注册
└── README.md
```

**不包含的内容：**
- `opencode/packages/opencode/src/`（源码）—— 只发布预编译二进制
- `packages/research/src/`（源码）—— 已编译进 opencode 二进制
- `node_modules/`、`pnpm-lock.yaml`
- `docs/`（设计文档，保留在 git 仓库但不出现在 npm 包）
- `kb/`、`vault/`、`index/`（用户数据）

#### package.json 设计

```json
{
  "name": "browser-code",
  "version": "0.2.0",
  "description": "Browser Code — web content capture and knowledge management agent",
  "license": "MIT",
  "bin": {
    "browser-code": "./bin/browser-code.cjs"
  },
  "files": [
    "bin/browser-code.cjs",
    ".browser-code/",
    "harness/",
    "tools/mcp/bin/",
    "wiki/",
    "AGENTS.md",
    "README.md"
  ],
  "os": ["win32", "darwin", "linux"],
  "cpu": ["x64", "arm64"],
  "scripts": {
    "postinstall": "node scripts/postinstall.js"
  }
}
```

#### 二进制分发

`bin/browser-code.cjs` 改造为自动检测平台并选择正确的 opencode 二进制：

```javascript
const platformMap = { win32: 'windows', darwin: 'darwin', linux: 'linux' }
const archMap = { x64: 'x64', arm64: 'arm64' }
const platform = platformMap[process.platform]
const arch = archMap[process.arch]
const binaryName = process.platform === 'win32' ? 'opencode.exe' : 'opencode'

// npm 全局安装时 __dirname = <global>/node_modules/browser-code/bin
const binary = path.join(__dirname, '..', 'opencode', 'packages', 'opencode', 'dist',
  `opencode-${platform}-${arch}`, 'bin', binaryName)
```

**关键问题：** npm 包大小。当前 `opencode.exe` = 161MB（Windows 单平台）。三平台 = ~500MB。npm 包大小限制通常无硬上限，但 `npm publish` 会慢。

**可选优化：**

1. **postinstall 下载**（推荐）：npm 包只包含 wrapper 脚本 + 配置，`postinstall` 时根据平台下载对应二进制。二进制托管在 GitHub Releases。
2. **平台分拆包**：`browser-code-win32`、`browser-code-darwin`、`browser-code-linux` + 元包 `browser-code` 自动选平台。

### 3.2 备选方案：纯源码发布 + postinstall 编译

用户安装后自动 `bun run build` 编译 opencode。缺点：编译需 ~20 分钟，依赖 bun 环境，太重。

### 3.3 备选方案：GitHub Releases + 安装脚本

发布预编译二进制到 GitHub Releases，提供 `install.sh` / `install.ps1` 安装脚本。不经过 npm。

| 方案 | 安装体验 | 更新机制 | 复杂度 |
|------|---------|---------|--------|
| **npm + postinstall 下载** | `npm i -g browser-code` | `npm update -g` | 中 |
| npm + 嵌入二进制 | `npm i -g` 但下载慢 | npm update | 低 |
| GitHub Releases | 手动下载脚本 | 自行管理 | 高 |

**推荐：npm + postinstall 下载二进制。** 用户只需 `npm i -g browser-code`，postinstall 自动拉对应平台的二进制。

---

## 4. 文件清理

### 4.1 已删除（commit a192264）

| 项目 | 说明 |
|------|------|
| `apps/mcp-server/` | 旧版 MCP 服务器，已由 `harness/mcp-server.ts` 替代 |
| `config/` | 旧版配置目录（mcp.*.json, research.config.json） |
| `prompts/` | 旧版 system prompt |
| `tool-manifests/` | 旧版工具清单 |
| `bilibili_asr.py`、`bilibili_sub.py`、`volc_asr.py` | 旧版 Python 脚本 |
| `bilibili_test.html`、`browsercode-logo-test.html` | 测试页面 |
| `test.wav` | 测试音频 |
| `docs_index.json` | 过时文档索引 |
| `fable5-vs-gpt56-ppt/` | 一次性用户 PPT 生成 |
| `_tmp_*` | 空临时文件 |

### 4.2 不打包但保留在 git（开发环境）

| 项目 | 说明 |
|------|------|
| `.claude/`、`.codex/`、`.superpowers/`、`.agents/` | Claude Code 本地配置 |
| `.obsidian/` | Obsidian vault 配置 |
| `.githooks/` | Git hooks |
| `.env` | 本地 API 密钥 |
| `docs/superpowers/` | 设计文档 |
| `pnpm-lock.yaml` | 依赖锁文件 |

### 4.3 不入 git 但需手动清理（大文件）

| 项目 | 大小 | 说明 |
|------|------|------|
| `tools/mcp/.venv/` | 233MB | Python virtualenv（可重建） |
| `.tmp/` | 96MB | 构建实验残留 |
| `_merge_master/` | 136KB | 旧合并工件 |

### 4.4 .gitignore 已扩展（commit 8e1de14）

新增覆盖：`_tmp_*`、`_merge_master/`、`tools/mcp/.venv/`、`tools/mcp/__pycache__/`、`opencode/node_modules/`、`opencode/.turbo/`

---

## 5. 用户数据隔离

Browser Code 的知识库通过 `process.cwd()` 确定路径：

```typescript
// save_markdown_note.ts
const vaultDir = join(process.cwd(), "vault")
// kb_manage.ts
const KB_DIR = join(process.cwd(), "kb")
```

**全局安装后的行为：**

```bash
$ cd ~/projects/my-research
$ browser-code          # vault/ 和 kb/ 创建在 ~/projects/my-research/ 下

$ cd ~/projects/another-project
$ browser-code          # vault/ 和 kb/ 创建在 ~/projects/another-project/ 下
```

每个项目独立的知识空间，无交叉污染。这是期望行为。

---

## 6. 配置加载路径

全局安装后，`.browser-code/` 的加载路径需要确认。当前 OpenCode 从多个层级搜索 `.browser-code/`：

1. Global: `~/.config/opencode/`
2. Project: 工作目录向上搜索
3. Home: `~/.browser-code/`

全局安装时 `.browser-code/` 应放在 npm 包内，同时支持用户项目目录下自定义覆盖。

**待确认：** OpenCode 是否默认从安装目录加载 `.browser-code/`，还是只从工作目录搜索。可能需要修改 `config.ts` 中的搜索路径。

---

## 7. 实施路线图

| 阶段 | 任务 | 产出 |
|------|------|------|
| 1. 清理 | 删除垃圾文件 + 扩展 gitignore | ✅ 已完成 |
| 2. 配置审查 | 确认 `.browser-code/` 全局加载路径 | 需要改动的文件清单 |
| 3. 跨平台构建 | 构建 macOS/Linux 二进制 | opencode-darwin-x64, opencode-linux-x64 |
| 4. wrapper 改造 | `browser-code.cjs` 支持多平台检测 | 新 wrapper 脚本 |
| 5. postinstall | 下载脚本（按平台拉二进制） | scripts/postinstall.js |
| 6. package.json | 配置 npm 发布字段 | 最终 package.json |
| 7. 测试安装 | 全局安装 + 启动 + 功能验证 | 测试报告 |
| 8. 发布 | `npm publish` | npm 包 |

---

## 8. 不做

- 不改变 `process.cwd()` 路径策略（每个项目独立知识空间是正确的）
- 不移除 `opencode/` 源码（保留在 git 仓库以便定制开发）
- 不清理用户数据（`kb/`、`vault/`、`index/` 中已有的内容）
- 不在 npm 包中包含 node_modules

---

## 9. 验收标准

- [ ] `npm install -g browser-code` 安装成功
- [ ] `browser-code --version` 正常输出
- [ ] `browser-code --port 34567` 启动成功
- [ ] 在任意目录启动，`vault/` 和 `kb/` 创建在当前目录
- [ ] ProReader 子代理可正常 spawn
- [ ] KB 管线（save_source → save_claims → after_capture）正常
- [ ] 4 个学术 Agent 可正常 spawn
- [ ] 非 Windows 平台可启动
