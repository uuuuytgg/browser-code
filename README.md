# Browser Code

Web content capture, research, and knowledge management agent.

## Install

```bash
npm install -g browser-code
```

## Usage

```bash
browser-code
# or with a specific port
browser-code --port 34567
```

## Knowledge Base

On first run, Browser Code creates `vault/` and `kb/` directories in your current working directory.
Each project folder gets its own independent knowledge space.

## 隐私说明

`kb/` 和 `vault/` 目录是你在本地使用时生成的知识库数据，包含你的研究内容、文章、截图等。这些目录**不会被提交到 Git 仓库**，也不会包含在 npm 包中。

- 仓库只包含 KB 的骨架结构（`.gitkeep`、`.template.md`）
- 你的所有研究数据仅存储在你本地的 `kb/` 和 `vault/` 中
- 如需备份，请自行管理这些目录

## Features

- **Web Capture**: Save any web page as clean Markdown with local assets
- **Research**: Multi-source research across 12 providers (web, GitHub, Wikipedia, video platforms, social media)
- **Knowledge Base**: Automatic FTS5 indexing, claim extraction, topic/entity linking
- **Video Summarization**: Transcript extraction + AI summarization for YouTube, Bilibili, Douyin
- **PPT Generation**: Create presentation decks from research results
- **Academic Analysis**: Built-in anthropologist, geographer, historian, and psychologist subagents for material analysis

## Requirements

- Node.js >= 18
- Windows x64, macOS (Apple Silicon / Intel), Linux x64

## Development

```bash
git clone https://github.com/lishi/browser-code
cd browser-code
pnpm install
bun run opencode/packages/opencode/script/build.ts --single
```

## License

MIT

## MCP 配置

Browser Code 依赖多个 MCP Server 实现完整搜索管线。部分 Server 需要额外安装运行时或配置环境变量。

详见 [MCP Server 安装指南](wiki/SETUP.md)
