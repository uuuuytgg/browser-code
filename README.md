<div align="center">

<img src="website/assets/logo.png" alt="Browser Code 鹰头标志" width="220" />

# Browser Code

**本地运行的网页捕获 · 多源研究 · 知识管理智能体**

[![npm version](https://img.shields.io/npm/v/browser-code?color=ed6f5c&label=npm)](https://www.npmjs.com/package/browser-code)
[![GitHub release](https://img.shields.io/github/v/release/uuuuytgg/browser-code?color=e9b94a&label=release)](https://github.com/uuuuytgg/browser-code/releases)
[![license](https://img.shields.io/badge/license-MIT-6e7448)](LICENSE)
[![platforms](https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-15140f)](#环境要求)

[English](README.en.md) · [宣传页](https://uuuuytgg.github.io/browser-code/) · [MCP 安装指南](wiki/SETUP.md)

<img src="website/assets/terminal-screenshot.png" alt="Browser Code 终端截图" width="720" />

</div>

---

## 这是什么？

Browser Code 是基于 [OpenCode](https://github.com/sst/opencode) 深度定制的**本地知识智能体**。它把「看到一个网页/视频 → 读懂 → 存进个人知识库 → 之后随时检索」这条链路完全自动化：

```
你：帮我研究一下 speculative decoding 最近的进展

Browser Code：
  ├─ ProReader 子代理生成研究计划
  ├─ 12 路 provider 并行搜索（网页/GitHub/Wikipedia/B站/YouTube/小红书/抖音…）
  ├─ 交叉验证 + 置信度标注
  ├─ 生成结构化报告
  └─ 你确认后 → 存入本地知识库（Markdown + SQLite FTS5 索引）
```

**一切都在本地。** 你的知识库就是一个 Markdown 文件夹（Obsidian 兼容），SQLite 只是可重建的搜索缓存。

## 快速开始

```bash
npm install -g browser-code
cd 你的项目文件夹
browser-code
```

首次运行会在当前目录创建 `vault/`（原始内容）和 `kb/`（知识图谱）。每个文件夹拥有独立的知识空间。

## 核心能力

| 能力 | 说明 |
|------|------|
| 🌐 **网页捕获** | 任意网页 → 干净 Markdown + 本地化资源，CDP 兜底救援动态页面 |
| 🔍 **多源研究** | ProReader 子代理编排 12 个 provider，Plan → Execute → Synthesize |
| 📚 **LLM Wiki 知识库** | 自动 claim 提取（8 类型 + 置信度）、主题/实体链接、FTS5 全文检索 |
| 🎬 **视频摘要** | YouTube / B站 / 抖音字幕提取 + AI 摘要 |
| 📊 **PPT 生成** | 从研究结果直接生成演示文稿 |
| 🎓 **学术分析** | 内置人类学/地理学/历史学/心理学四位领域专家子代理 |

## 架构

```
┌─────────────────────────────────────────────────┐
│                   主 Agent                       │
│        任务路由：Direct 通道 / Research 通道       │
└──────┬──────────────────┬───────────────────────┘
       │                  │
┌──────▼──────┐    ┌──────▼──────────────────────┐
│  ProReader  │    │        执行子代理             │
│  研究专家    │    │  general（体力劳动全工具）      │
│  12 provider│    │  + 4 位学术专家              │
└──────┬──────┘    └─────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│              知识库管线（harness/）               │
│  enqueue → process-queue → FTS5 index           │
│  vault/（Markdown 源）+ kb/（claims/topics/…）    │
└─────────────────────────────────────────────────┘
```

**双轨子代理体系**：专家型（六要素领域模板：领域/方法论/输入/输出/边界/交接）+ 执行型（I/O 标准化）。详见 [AGENTS.md](AGENTS.md)。

## 12 路研究 Provider

`llm_wiki_lite`（本地KB优先） · `websearch` · `webfetch` · `github` · `wikipedia` · `official_docs` · `youtube_data_api` · `bilibili_mcp` · `douyin_mcp` · `xiaohongshu_mcp` · `tiktok_mcp` · `site_search`

部分 provider 需要额外配置（Python 环境 / Cookie），详见 [MCP Server 安装指南](wiki/SETUP.md)。

## 隐私说明

`kb/` 和 `vault/` 是你本地生成的知识库数据（研究内容、文章、截图）。它们：

- ❌ 不会被提交到 Git 仓库（仓库只含骨架结构）
- ❌ 不会包含在 npm 包中
- ✅ 只存在于你本地，需要备份请自行管理

## 环境要求

- Node.js >= 18
- Windows x64 / macOS（Apple Silicon 与 Intel）/ Linux x64
- 可选：Bun（本地 KB server）、Python 3.11（B站/小红书 provider）、Chrome（CDP 救援）

## Agent 安装

> 本节写给 agent 看（Claude / Codex / Copilot 等读完后能自动帮用户装好）。命令按平台给出，可直接执行。

### 1. 一键安装（npm）

```bash
npm install -g browser-code
```

postinstall 会按平台自动下载 opencode 二进制。装完后命令是 `browser-code`。

### 2. 系统依赖

下列是 browser-code 运行时依赖的外部工具，需 agent 按用户平台安装：

| 依赖 | 用途 | Windows | macOS | Linux |
|------|------|---------|-------|-------|
| Node.js >=18 | 运行包装器 | 官网安装 / nvm-windows | `brew install node` / nvm | apt / brew / nvm |
| bun | KB MCP server + harness 脚本 | PowerShell：`irm bun.sh/install.ps1 \| iex` | `curl -fsSL https://bun.sh/install \| bash` | 同 macOS |
| ffmpeg | 音视频处理（提取音频、转码） | `winget install ffmpeg` 或官网 | `brew install ffmpeg` | `apt install ffmpeg` |
| yt-dlp | 视频字幕/下载 | `winget install yt-dlp.yt-dlp` 或 pip | `brew install yt-dlp` | `pip install yt-dlp` |
| Python 3.11 | ASR（火山引擎）+ OCR（PaddleOCR） | 官网 / `winget install Python.Python.3.11` | `brew install python@3.11` | `apt install python3 python3-pip` |
| paddleocr (pip) | OCR 图片文字识别 | `pip install paddleocr` | 同左 | 同左 |
| npx | 远程 MCP（chrome-devtools 等） | 随 Node 自带 | 随 Node 自带 | 随 Node 自带 |

> 注意：Python 在 macOS/Linux 上命令是 `python3`，Windows 上是 `python`。browser-code 内部会按平台选择，无需用户手动切换。

### 3. 可选 MCP 配置（按需）

`browser-code.jsonc` 中配置的 MCP server，部分需要用户额外配置才能启用：

- **bilibili-video-info**：需要 Python venv + `SESSDATA` cookie 环境变量（`browser-code.jsonc` 中显式声明 `SESSDATA`）
- **bilibili-readonly**：仅需 Python venv（`browser-code.jsonc` 中未声明 `SESSDATA`，部分只读接口不依赖登录态；若个别接口要求登录，可再补 `SESSDATA`）
- **xhs-local**（小红书）：需要 `XHS_COOKIE` 环境变量
- **douyin-cli**（抖音）：npm 包**不包含** douyin 二进制（为减小包体积）。装完 browser-code 后，若要启用抖音 MCP，需自行从抖音 MCP 项目下载对应平台二进制，放到 `tools/mcp/bin/` 目录（Windows 为 `douyin.exe`），否则该 MCP 无法使用
- **chrome-devtools**：通过 `npx` 自动拉取，无需配置
- **browsercode-knowledge**（本地 KB）：装好 bun 即可，自动启动

环境变量示例（写入用户 `.env` 或 shell profile）：

```
SESSDATA=你的B站cookie
XHS_COOKIE=你的小红书cookie
VOLC_ASR_API_KEY=火山引擎ASR的key（可选，用于音频转写）
```

### 4. 自带 Skill / Agent 说明

装完后可直接使用的工具和子代理：

- **kb_manage**：知识库管理（写入 claims/topics/entities、FTS 搜索、图谱查询、过期标记、LLM 合成/推演）
- **save_markdown_note**：vault 笔记写入（自动去重、slug 命名）
- **search_vault**：vault 搜索
- **proreader**：研究专家子代理（12 路 provider：llm_wiki_lite/websearch/webfetch/github/wikipedia/official_docs/youtube/bilibili/douyin/xiaohongshu/tiktok/site_search）
- **4 位学术专家子代理**：anthropologist / geographer / historian / psychologist
- **ocr_text**：PaddleOCR 图片识别
- **fetch_transcript / transcribe_audio**：视频字幕 / 音频转写
- **web_to_markdown**：网页转 markdown

### 5. 首次启动

```bash
cd 你的项目文件夹
browser-code
```

首次运行会在**当前目录**创建 `vault/`（原始内容）、`kb/`（知识图谱）和 `index/`（FTS 索引）。每个目录是独立的知识空间。

### 6. 数据目录自定义（可选）

默认数据写入启动目录。想换地方：

```bash
# Windows
set BROWSER_CODE_DATA_DIR=D:\my-kb
# macOS/Linux
export BROWSER_CODE_DATA_DIR=/Users/me/my-kb
browser-code
```

## 开发

```bash
git clone https://github.com/uuuuytgg/browser-code
cd browser-code
pnpm install
bun run opencode/packages/opencode/script/build.ts --single
```

发布流程：打 tag `v*` → GitHub Actions 自动构建 4 平台二进制并上传 Release → 用户安装时 postinstall 按平台下载。

## 许可证

MIT
