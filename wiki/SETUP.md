# MCP Server 安装指南

Browser Code 依赖以下 MCP Server 实现完整的 12 路搜索管线。部分 Server 开箱即用，部分需要额外配置。

## 开箱即用

### douyin-cli（抖音搜索）
- **状态：** 已内置，无需配置
- **能力：** 抖音搜索、用户信息、视频详情、评论、热榜

### chrome-devtools（浏览器自动化）
- **状态：** 需安装 Chrome/Chromium 浏览器
- **安装：** 下载安装 [Google Chrome](https://www.google.com/chrome/) 或 [Chromium](https://www.chromium.org/)
- **能力：** CDP 浏览器自动化、页面截图、网络请求拦截

### browsercode-knowledge（本地知识库）
- **状态：** 需安装 [Bun](https://bun.sh/)
- **安装：**
  ```bash
  # macOS / Linux
  curl -fsSL https://bun.sh/install | bash
  # Windows
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
- **能力：** 本地 FTS5 全文搜索、答案上下文构建

## 需额外配置

### bilibili-readonly（B 站只读搜索）
- **状态：** 需 Python 3.11 + 虚拟环境
- **安装：**
  ```bash
  cd tools/mcp
  python -m venv .venv
  .venv/Scripts/pip install -r adoresever-bilibili-mcp/requirements.txt
  # Windows 用 .venv\Scripts\pip
  # macOS/Linux 用 .venv/bin/pip
  ```
- **配置环境变量：** 无需（只读搜索不需要登录 cookie）
- **能力：** B 站搜索、视频信息、评论、弹幕、字幕、排行榜

### bilibili-video-info（B 站视频元数据）
- **状态：** 需配置 SESSDATA
- **配置环境变量：**
  ```bash
  export SESSDATA="你的B站SESSDATA cookie值"
  ```
  获取方式：浏览器登录 B 站 → F12 开发者工具 → Application → Cookies → 找到 `SESSDATA` 字段的值
- **能力：** 视频详细元数据（需要登录态）

### xhs-local（小红书搜索）
- **状态：** 需配置 XHS_COOKIE
- **配置环境变量：**
  ```bash
  export XHS_COOKIE="你的小红书cookie字符串"
  ```
  获取方式：浏览器登录小红书网页版 → F12 → Application → Cookies → 复制完整 cookie 字符串
- **能力：** 小红书笔记搜索、内容获取、评论

## 可选（付费 API 替代方案，默认关闭）

### socialdatax-xhs（小红书付费 API）
- **状态：** 默认禁用
- **启用：** 需 `SOCIALDATAX_API_KEY`，在 `browser-code.jsonc` 中将 `enabled` 设为 `true`

### socialdatax-douyin（抖音付费 API）
- **状态：** 默认禁用
- **启用：** 需 `SOCIALDATAX_API_KEY`，在 `browser-code.jsonc` 中将 `enabled` 设为 `true`

## 快速检查

启动 browser-code 后，查看 MCP 连接状态确认所有 Server 正常运行。
