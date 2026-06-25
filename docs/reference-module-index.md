# Reference Module Index

This file is a compact working index derived from the long-form reference mapping documents.

Use it when implementing a module and you need the fastest pointer to the right upstream references.

## Runtime

- `apps/runtime/src/agent/loop.ts`
  - Reference: OpenCode
  - Extract: provider abstraction, loop, permission flow, session design
  - Avoid copying: LSP, Git patching, IDE integration, coding prompts

## Extension

- `apps/extension/`
  - Reference: Chrome Side Panel API, WXT, Plasmo
  - Extract: MV3 shape, side panel lifecycle, content-script organization

## Web Capture

- `packages/tool-web/`
  - Reference: Mozilla Readability, Turndown, MarkDownload
  - Extract: article extraction, HTML to Markdown conversion, metadata flow
  - Avoid copying: downloader-specific save flows

## Video

- `packages/tool-video/`
  - Reference: youtube-transcript-api, YouTube.js, bilibili subtitle tools, ffmpeg docs
  - Extract: transcript-first flow, metadata fallback, wrapped media helpers
  - Avoid copying: unrestricted download behavior

## Resources

- `packages/tool-resource/`
  - Reference: Media Downloader, Media Downloader Unleashed, curl, mime helpers
  - Extract: resource classification, scan heuristics, guarded download flow
  - Avoid copying: automatic media download or stream merging behavior

## Vault

- `packages/tool-vault/`
  - Reference: gray-matter, Obsidian Web Clipper patterns, ripgrep/FTS ideas
  - Extract: frontmatter, stable note save, controlled tags, searchable index
  - Avoid copying: unrelated app-specific storage conventions

## MCP

- `apps/mcp-server/`
  - Reference: MCP specification, MCP TypeScript SDK, MCP server examples
  - Extract: read-only tools/resources, stdio/server structure
  - Avoid copying: write-capable or arbitrary file access surfaces
