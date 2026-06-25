# 16 第三方依赖与 License 清单

## 1. 记录原则

每个参考/复制项目都记录：

```text
项目名
链接
用途
License
是否复制代码
复制文件路径
是否修改
```

## 2. 当前计划依赖

| 项目 | 用途 | 链接 | 使用方式 |
|---|---|---|---|
| OpenCode | agent runtime 参考 | https://github.com/anomalyco/opencode | 参考/部分复制 |
| Chrome Side Panel API | 侧边栏 | https://developer.chrome.com/docs/extensions/reference/api/sidePanel | 官方 API |
| Chrome Native Messaging | 插件本机通信 | https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging | 官方 API |
| Mozilla Readability | 正文提取 | https://github.com/mozilla/readability | npm |
| Turndown | HTML 转 Markdown | https://github.com/mixmark-io/turndown | npm |
| MarkDownload | 网页剪藏参考 | https://github.com/deathau/markdownload | 参考 |
| yt-dlp | 可选媒体工具 | https://github.com/yt-dlp/yt-dlp | 本地工具 |
| ffmpeg | 音视频处理 | https://ffmpeg.org/ | 本地工具 |
| curl | 资源下载 | https://curl.se/ | 本地工具 |
| MCP Spec | MCP 共享 | https://modelcontextprotocol.io/specification | 协议参考 |

## 3. NOTICE 模板

```md
# Notices

This project may include modified portions of OpenCode.

OpenCode:
- Repository: https://github.com/anomalyco/opencode
- License: MIT
- Copyright: See original OpenCode repository

This project is not affiliated with, sponsored by, or endorsed by the OpenCode team.
```

## 4. 复制代码记录模板

```md
## Copied Code Record

- Source project:
- Source URL:
- Source file path:
- Destination file path:
- License:
- Copied date:
- Modified: yes/no
- Notes:
```

## 5. 禁止

```text
不要复制 license unknown 的代码
不要复制不需要的 coding agent prompt
不要复制 LSP / Git patch / IDE 集成代码
```
