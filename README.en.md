<div align="center">

<img src="website/assets/logo.png" alt="Browser Code" width="360" />

# Browser Code

**Local-first web capture · multi-source research · knowledge management agent**

[![npm version](https://img.shields.io/npm/v/browser-code?color=ed6f5c&label=npm)](https://www.npmjs.com/package/browser-code)
[![GitHub release](https://img.shields.io/github/v/release/uuuuytgg/browser-code?color=e9b94a&label=release)](https://github.com/uuuuytgg/browser-code/releases)
[![license](https://img.shields.io/badge/license-MIT-6e7448)](LICENSE)
[![platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-15140f)](#requirements)

[中文](README.md) · [Landing Page](https://uuuuytgg.github.io/browser-code/) · [MCP Setup Guide](wiki/SETUP.md)

<img src="website/assets/terminal-screenshot.png" alt="Browser Code terminal screenshot" width="720" />

</div>

---

## What is this?

Browser Code is a **local knowledge agent** built on a customized [OpenCode](https://github.com/sst/opencode) fork. It automates the full loop of "see a web page/video → understand it → store it in a personal knowledge base → retrieve it any time":

```
You: research the latest progress on speculative decoding

Browser Code:
  ├─ ProReader subagent generates a research plan
  ├─ 12 providers search in parallel (web / GitHub / Wikipedia / Bilibili / YouTube / RED / Douyin…)
  ├─ Cross-validation + confidence labeling
  ├─ Structured report
  └─ On your approval → saved to the local KB (Markdown + SQLite FTS5 index)
```

**Everything stays local.** Your knowledge base is a folder of Markdown files (Obsidian-compatible); SQLite is just a rebuildable search cache.

## Quick Start

```bash
npm install -g browser-code
cd your-project-folder
browser-code
```

On first run, `vault/` (raw content) and `kb/` (knowledge graph) are created in the current directory. Each folder gets its own independent knowledge space.

## Features

| Capability | Description |
|-----------|-------------|
| 🌐 **Web Capture** | Any page → clean Markdown + local assets, with CDP rescue for dynamic pages |
| 🔍 **Multi-source Research** | ProReader subagent orchestrates 12 providers: Plan → Execute → Synthesize |
| 📚 **LLM Wiki KB** | Automatic claim extraction (8 types + confidence), topic/entity linking, FTS5 search |
| 🎬 **Video Summarization** | Transcript extraction + AI summary for YouTube / Bilibili / Douyin |
| 📊 **PPT Generation** | Generate presentation decks from research results |
| 🎓 **Academic Analysis** | Built-in anthropologist, geographer, historian, psychologist subagents |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Main Agent                      │
│      Task routing: Direct / Research channel     │
└──────┬──────────────────┬───────────────────────┘
       │                  │
┌──────▼──────┐    ┌──────▼──────────────────────┐
│  ProReader  │    │      Executor subagents      │
│  research   │    │  general (full-tool labor)   │
│  12 providers│   │  + 4 academic experts        │
└──────┬──────┘    └─────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────┐
│           KB pipeline (harness/)                 │
│  enqueue → process-queue → FTS5 index           │
│  vault/ (Markdown source) + kb/ (claims/topics)  │
└─────────────────────────────────────────────────┘
```

**Dual-track subagent system**: expert-type (six-element domain template) + executor-type (I/O standardization). See [AGENTS.md](AGENTS.md).

## 12 Research Providers

`llm_wiki_lite` (local KB first) · `websearch` · `webfetch` · `github` · `wikipedia` · `official_docs` · `youtube_data_api` · `bilibili_mcp` · `douyin_mcp` · `xiaohongshu_mcp` · `tiktok_mcp` · `site_search`

Some providers need extra setup (Python runtime / cookies). See the [MCP Setup Guide](wiki/SETUP.md) (Chinese).

## Privacy

`kb/` and `vault/` contain your locally generated knowledge base data:

- ❌ Never committed to the Git repository (only skeleton files are tracked)
- ❌ Never included in the npm package
- ✅ Stored only on your machine — back up as you see fit

## Requirements

- Node.js >= 18
- Windows x64 / macOS (Apple Silicon & Intel) / Linux x64
- Optional: Bun (local KB server), Python 3.11 (Bilibili/RED providers), Chrome (CDP rescue)

## Agent Installation

> This section is written for agents (Claude / Codex / Copilot, etc.) to read and install browser-code for the user automatically. Commands are listed per platform and can be executed directly.

### 1. One-line install (npm)

```bash
npm install -g browser-code
```

The postinstall step downloads the opencode binary for the current platform. The installed command is `browser-code`.

### 2. System dependencies

The following external tools are required at runtime. The agent should install them per the user's platform:

| Dependency | Purpose | Windows | macOS | Linux |
|------------|---------|---------|-------|-------|
| Node.js >=18 | Wrapper runtime | Official installer / nvm-windows | `brew install node` / nvm | apt / brew / nvm |
| bun | KB MCP server + harness scripts | PowerShell: `irm bun.sh/install.ps1 \| iex` | `curl -fsSL https://bun.sh/install \| bash` | same as macOS |
| ffmpeg | Audio/video processing (extract audio, transcode) | `winget install ffmpeg` or official site | `brew install ffmpeg` | `apt install ffmpeg` |
| yt-dlp | Video subtitles / download | `winget install yt-dlp.yt-dlp` or pip | `brew install yt-dlp` | `pip install yt-dlp` |
| Python 3.11 | ASR (Volcano Engine) + OCR (PaddleOCR) | Official site / `winget install Python.Python.3.11` | `brew install python@3.11` | `apt install python3 python3-pip` |
| paddleocr (pip) | OCR image text recognition | `pip install paddleocr` | same | same |
| npx | Remote MCP (chrome-devtools, etc.) | Bundled with Node | Bundled with Node | Bundled with Node |

> Note: On macOS/Linux the Python command is `python3`; on Windows it is `python`. browser-code selects the right one per platform internally — no manual switching needed.

### 3. Optional MCP configuration (as needed)

Some MCP servers configured in `browser-code.jsonc` require extra setup before they work:

- **bilibili-video-info**: Python venv + `SESSDATA` cookie env var required (`browser-code.jsonc` explicitly declares `SESSDATA`)
- **bilibili-readonly**: Python venv only (`browser-code.jsonc` does not declare `SESSDATA`; some read-only endpoints do not require a logged-in state — add `SESSDATA` only if a specific endpoint demands it)
- **xhs-local** (Xiaohongshu/RED): `XHS_COOKIE` environment variable required
- **douyin-cli** (Douyin): the npm package **does not include** the douyin binary (to keep package size small). After installing browser-code, to enable the Douyin MCP you must download the platform-specific binary from the Douyin MCP project and place it in the `tools/mcp/bin/` directory (Windows: `douyin.exe`); otherwise this MCP is unavailable
- **chrome-devtools**: auto-fetched via `npx`, no configuration needed
- **browsercode-knowledge** (local KB): just install bun; it starts automatically

Environment variable example (write into the user's `.env` or shell profile):

```
SESSDATA=your-bilibili-cookie
XHS_COOKIE=your-xiaohongshu-cookie
VOLC_ASR_API_KEY=volcano-engine-asr-key (optional, for audio transcription)
```

### 4. Bundled skills / agents

Tools and subagents available after install:

- **kb_manage**: knowledge base management (write claims/topics/entities, FTS search, graph queries, expiry marking, LLM synthesis/inference)
- **save_markdown_note**: vault note writing (auto-dedup, slug naming)
- **search_vault**: vault search
- **proreader**: research expert subagent (12 providers: llm_wiki_lite/websearch/webfetch/github/wikipedia/official_docs/youtube/bilibili/douyin/xiaohongshu/tiktok/site_search)
- **4 academic expert subagents**: anthropologist / geographer / historian / psychologist
- **ocr_text**: PaddleOCR image recognition
- **fetch_transcript / transcribe_audio**: video transcript / audio transcription
- **web_to_markdown**: web page to markdown

### 5. First launch

```bash
cd your-project-folder
browser-code
```

On first run, `vault/` (raw content), `kb/` (knowledge graph), and `index/` (FTS index) are created in the **current directory**. Each directory is an independent knowledge space.

### 6. Custom data directory (optional)

By default, data is written to the launch directory. To use a different location:

```bash
# Windows
set BROWSER_CODE_DATA_DIR=D:\my-kb
# macOS/Linux
export BROWSER_CODE_DATA_DIR=/Users/me/my-kb
browser-code
```

## Development

```bash
git clone https://github.com/uuuuytgg/browser-code
cd browser-code
pnpm install
bun run opencode/packages/opencode/script/build.ts --single
```

Release flow: push tag `v*` → GitHub Actions builds binaries for 4 platforms and uploads to Release → postinstall downloads the right one on install.

## License

MIT
