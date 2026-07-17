<div align="center">

<img src="website/assets/logo.png" alt="Browser Code" width="360" />

# Browser Code

**本地运行的网页捕获 · 多源研究 · 知识管理智能体**

[![npm version](https://img.shields.io/npm/v/browser-code?color=ed6f5c&label=npm)](https://www.npmjs.com/package/browser-code)
[![GitHub release](https://img.shields.io/github/v/release/uuuuytgg/browser-code?color=e9b94a&label=release)](https://github.com/uuuuytgg/browser-code/releases)
[![license](https://img.shields.io/badge/license-MIT-6e7448)](LICENSE)
[![platforms](https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-15140f)](#环境要求)

[English](README.en.md) · [宣传页](website/index.html) · [MCP 安装指南](wiki/SETUP.md)

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
