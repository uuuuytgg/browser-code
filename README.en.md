# Browser Code

Web content capture, multi-source research, and knowledge management agent.

[中文](README.md)

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

## Privacy

The `kb/` and `vault/` directories contain your locally generated knowledge base data — research content, articles, screenshots, etc. These directories are **never committed to the Git repository** and are not included in the npm package.

- The repository only contains KB skeleton files (`.gitkeep`, `.template.md`)
- All your research data stays in your local `kb/` and `vault/`
- Back up these directories yourself if needed

## Features

- **Web Capture**: Save any web page as clean Markdown with local assets
- **Research**: Multi-source research across 12 providers (web, GitHub, Wikipedia, video platforms, social media)
- **Knowledge Base**: Automatic FTS5 indexing, claim extraction, topic/entity linking
- **Video Summarization**: Transcript extraction + AI summarization for YouTube, Bilibili, Douyin
- **PPT Generation**: Create presentation decks from research results
- **Academic Analysis**: Built-in anthropologist, geographer, historian, and psychologist subagents

## Requirements

- Node.js >= 18
- Windows x64, macOS (Apple Silicon / Intel), Linux x64

## MCP Setup

Browser Code relies on several MCP servers for its full search pipeline. Some servers need extra runtimes or environment variables.

See the [MCP Server Setup Guide](wiki/SETUP.md) (Chinese)

## Development

```bash
git clone https://github.com/uuuuytgg/browser-code
cd browser-code
pnpm install
bun run opencode/packages/opencode/script/build.ts --single
```

## License

MIT
