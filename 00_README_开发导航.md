# 00 开发导航

这组文档把原来的纲领性文件拆成可执行模块。目标是：让 AI Agent、外部开发者、Claude Code、OpenCode 类工具可以按模块开工，而不是一次性理解整个系统。

## 一句话定位

```text
浏览器侧边栏
→ 本地 Knowledge Agent Runtime
→ API LLM 驱动
→ 本地工具层
→ Markdown Vault
→ MCP 共享给 Claude Code / Claude Desktop
```

Claude Code 不是主执行器，只是知识库共享者和消费者。

## 推荐阅读顺序

```text
00_README_开发导航.md
01_系统边界与总体链路.md
02_仓库初始化与目录结构.md
03_浏览器侧边栏插件模块.md
04_本地桥接模块.md
05_Agent_Runtime核心循环.md
06_Model_Provider与Harness.md
07_工具层协议与权限系统.md
08_网页转Markdown模块.md
09_视频字幕与媒体模块.md
10_资源扫描与下载模块.md
11_Vault知识库与索引模块.md
12_MCP共享知识库模块.md
13_OpenCode抽取与替换指南.md
14_安全边界与验收清单.md
15_AI开发执行Prompt.md
16_第三方依赖与License清单.md
```

## 最小可运行闭环

第一版只做这个：

```text
打开网页
→ 点击侧边栏“保存当前网页”
→ 插件生成 CaptureTask
→ Local Bridge 转发给 Runtime
→ Runtime 调 LLM
→ LLM 调 web_to_markdown
→ LLM 调 save_markdown_note
→ build_index
→ 侧边栏显示 note_id / file_path
→ search_vault 能搜到
```

## 开发阶段

```text
Stage 0：仓库初始化
Stage 1：Runtime 最小 tool-call loop
Stage 2：网页转 Markdown
Stage 3：Vault 保存与索引
Stage 4：浏览器侧边栏 MVP
Stage 5：Local Bridge
Stage 6：真实网页保存闭环
Stage 7：视频字幕总结
Stage 8：资源扫描与下载
Stage 9：MCP 只读共享
Stage 10：安全加固
```

## 硬规则

```text
1. 不要一次性实现全部 Stage。
2. 不要给 LLM 任意 shell。
3. 不要把网页内容当系统指令。
4. 不要默认下载视频。
5. 不要绕过 DRM、付费墙、会员限制、登录限制。
6. 所有工具必须有 schema。
7. 所有写入必须通过 save_markdown_note。
8. 所有下载必须通过 permission guard。
9. MCP 默认只读。
10. 复制开源代码必须记录 license。
```
