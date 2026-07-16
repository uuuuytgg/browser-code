# Browser Code

网页内容捕获、多源研究与知识管理智能体。

[English](README.en.md)

## 安装

```bash
npm install -g browser-code
```

## 使用

```bash
browser-code
# 或指定端口
browser-code --port 34567
```

## 知识库

首次运行时，Browser Code 会在你当前的工作目录创建 `vault/` 和 `kb/` 目录。
每个项目文件夹拥有独立的知识空间。

## 隐私说明

`kb/` 和 `vault/` 目录是你在本地使用时生成的知识库数据，包含你的研究内容、文章、截图等。这些目录**不会被提交到 Git 仓库**，也不会包含在 npm 包中。

- 仓库只包含 KB 的骨架结构（`.gitkeep`、`.template.md`）
- 你的所有研究数据仅存储在你本地的 `kb/` 和 `vault/` 中
- 如需备份，请自行管理这些目录

## 功能特性

- **网页捕获**：将任意网页保存为干净的 Markdown，附带本地资源
- **多源研究**：跨 12 个 provider 的研究管线（网页、GitHub、Wikipedia、视频平台、社交媒体）
- **知识库**：自动 FTS5 索引、claim 提取、主题/实体链接
- **视频摘要**：YouTube、B站、抖音的字幕提取 + AI 摘要
- **PPT 生成**：从研究结果生成演示文稿
- **学术分析**：内置人类学家、地理学家、历史学家、心理学家子代理

## 环境要求

- Node.js >= 18
- Windows x64 / macOS（Apple Silicon 与 Intel）/ Linux x64

## MCP 配置

Browser Code 依赖多个 MCP Server 实现完整搜索管线。部分 Server 需要额外安装运行时或配置环境变量。

详见 [MCP Server 安装指南](wiki/SETUP.md)

## 开发

```bash
git clone https://github.com/uuuuytgg/browser-code
cd browser-code
pnpm install
bun run opencode/packages/opencode/script/build.ts --single
```

## 许可证

MIT
