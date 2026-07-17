# NOTICE

Browser Code 基于 [OpenCode](https://github.com/sst/opencode)（MIT License）深度定制。
完整的上游源码以 vendored fork 形式位于 `opencode/` 目录，上游版权声明保留于 [`opencode/LICENSE`](opencode/LICENSE)。
本项目与 OpenCode 团队无隶属、赞助或背书关系。

## 相对上游的主要定制

- **Browser Code 化**：CLI 更名 `browser-code`，配置目录 `.browser-code/`，环境变量前缀 `BROWSER_CODE_*`
- **ProReader 研究子代理**：12-provider 研究管线（Plan → Execute → Synthesize），独立上下文，置信度标注
- **LLM Wiki 知识库**：vault/（Markdown 源）+ kb/（claims/topics/entities）+ SQLite FTS5 索引 + 捕获管线（harness/）
- **自定义工具**：`proreader` / `kb_manage` / `save_markdown_note` / `search_vault` / `rescue`（`.browser-code/tool/`）
- **学术子代理**：人类学家 / 地理学家 / 历史学家 / 心理学家
- **CDP 救援通道**：动态页面抓取失败后的 Chrome DevTools Protocol 兜底
- **V1 runLoop 硬截断**：max steps 时强制 `toolChoice: none` 防止无限循环
- **多平台分发**：npm + postinstall 二进制下载 + GitHub Actions 跨平台构建

## 上游文件清理说明

为保持仓库身份清晰，已移除上游的贡献者文档（AGENTS.md）、多语言 README 与统计文件；
保留上游英文 README（`opencode/README.md`）用于溯源，保留 LICENSE 履行 MIT 义务。

## 依赖记录

- OpenCode — vendored fork（`opencode/`），MIT，https://github.com/sst/opencode
- Mozilla Readability — 文章正文提取（`packages/tool-web`），https://github.com/mozilla/readability
- Turndown — HTML 转 Markdown（`packages/tool-web`），MIT，https://github.com/mixmark-io/turndown
- MCP Specification — MCP 知识服务设计参考，https://modelcontextprotocol.io/specification
- ffmpeg / curl / yt-dlp — 外部工具封装，各自遵循上游分发许可
- Chrome DevTools Protocol — CDP 救援通道，官方平台 API
