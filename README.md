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
