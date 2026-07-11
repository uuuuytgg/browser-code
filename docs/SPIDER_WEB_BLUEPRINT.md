# Browser Code — Spider Web Blueprint

> 以蜘蛛结网隐喻该系统：蜘蛛 = Browser Code Agent 本体，蛛网 = 本地知识库（Vault + KB），每根蛛丝 = 一条工具/架构通道。

---

## 核心隐喻

```
                          ▲  LLM Wiki Lite
                         /       ▲
                        /         \
              github ──●─── wikipedia ──●── official_docs
                      /       │         \
                     /        │          \
     websearch ──●──/    ┌────┴────┐    \──●── site_search
                   /     │ PRO_READER│     \
                  /      └────┬────┘      \
    webfetch ──●──             │            ●── rescue
                /              │             \
               /        ┌──────┴──────┐       \
   youtube ──●──       │  KB_MANAGE   │        ●── bilibili
             /          └──────┬──────┘         \
            /                  │                  \
  douyin ──●──          ┌──────┴──────┐            ●── xiaohongshu
          /              │ SAVE_MD_NOTE│             \
         /               └──────┬──────┘              \
  tiktok─●──                    │                       ●── tts/ocr
        /                ┌──────┴──────┐
       /                 │ SEARCH_VAULT│
      /                  └──────┬──────┘
     /                          │
    ●── read/write/edit ──●───●───●── glob/grep/bash
   /                                \
  /         VAULT + KB (蛛网)         \
 ●──── task ────●──── todowrite ────●──── question
```

---

## 蜘蛛本体 — SPIDER_ANATOMY

| 部位 | 组件 | 职责 |
|------|------|------|
| 🧠 大脑 | `AGENTS.md` / `browser-code.txt` / `core-context` | 铁律约束、通道判断、阶段感知 |
| 👁 视觉 | `triage` / `dispatchInput` | URL 检测、意图分类 |
| 🕸 吐丝器 | `instruction` / `SystemPrompt` | 上下文注入、Skill 加载 |
| 🦵 八足 | `Task Routing (Research/Direct)` | 两条通道分发任务 |

---

## 蛛网内核 — WEB_CORE

```
                        ┌──────────────────┐
                        │     VAULT         │
                        │  vault/articles/  │
                        │  vault/videos/    │
                        │  vault/snippets/  │
                        │  vault/assets/    │
                        └────────┬─────────┘
                                 │
                        ┌────────┴─────────┐
                        │    KB (Knowledge  │
                        │       Base)       │
                        │  kb/sources/      │
                        │  kb/claims/       │
                        │  kb/topics/       │
                        │  kb/entities/     │
                        └────────┬─────────┘
                                 │
                        ┌────────┴─────────┐
                        │    FTS5 Index     │
                        │  full‑text search │
                        └──────────────────┘
```

---

## 蛛丝网络 — WEB_THREADS

### 核心工具丝 (Core Tool Threads)

| 蛛丝 | 工具名 | 方向 | 用途 |
|------|--------|------|------|
| 📖 | `read` | 入 | 读取本地文件内容 |
| ✏️ | `write` | 出 | 写入新建文件 |
| 🔧 | `edit` | 出 | 精确字符串替换 |
| 📂 | `glob` | 入 | 文件名模式匹配 |
| 🔍 | `grep` | 入 | 文件内容正则搜索 |
| 🐚 | `bash` | 出入 | Shell/PowerShell 命令 |
| 📋 | `task` | 出 | 派生子代理（核心编排） |
| ✅ | `todowrite` | 出 | 任务列表创建与追踪 |
| ❓ | `question` | 出入 | 向用户提问 |
| 🎯 | `skill` | 出 | 调用外部 Skill |
| 🌐 | `webfetch` | 入 | HTTP 抓取网页 |
| 🔎 | `websearch` | 入 | Web 搜索引擎查询 |
| 📝 | `web_to_markdown` | 入 | HTML → Markdown 转换 |
| 🎙 | `fetch_transcript` | 入 | 视频字幕提取 |
| 🔊 | `ffmpeg_extract_audio` | 入 | 视频音频提取 |
| 📜 | `transcribe_audio` | 入 | 音频转文字 (Whisper) |
| 👁 | `ocr_text` | 入 | 图片 OCR 文字识别 |
| 🩹 | `apply_patch` | 出 | 应用代码补丁 |
| 🔌 | `lsp` | 出入 | 语言服务器协议 |
| ⛔ | `invalid` | — | 占位/无效工具标记 |

---

### Browser Code 自定义丝 (Custom Tool Threads)

| 蛛丝 | 工具名 | 方向 | 用途 |
|------|--------|------|------|
| 🧭 | `proreader` | 入 | 研究规划 → 12 个 provider 路由 |
| 📚 | `kb_manage` | 出 | KB 全管线：写 source/claim/topic/entity + FTS5 + context |
| 💾 | `save_markdown_note` | 出 | 标准化 Markdown 笔记写入 vault |
| 🔎 | `search_vault` | 入 | 原始 vault tag index 搜索（KB fallback） |
| 🆘 | `rescue` | 出入 | CDP 兜底：失败 URL 的浏览器抓取补救 |

---

### Provider 蛛丝 (Research Provider Threads)

| 蛛丝 | Provider ID | 类型 | 覆盖域 |
|------|-------------|------|--------|
| 🧠 | `llm_wiki_lite` | 本地 | 本地知识库语义检索 |
| 🔍 | `websearch` | 搜索 | 通用 Web 搜索引擎 |
| 🌐 | `webfetch` | 抓取 | 单页 HTTP 抓取 |
| 🐙 | `github` | 代码 | GitHub 仓库/代码/Issue 搜索 |
| 📖 | `wikipedia` | 参考 | Wikipedia 百科查询 |
| 📄 | `official_docs` | 参考 | 官方技术文档 |
| ▶️ | `youtube_data_api` | 视频 | YouTube 视频/字幕 |
| 📺 | `bilibili_mcp` | 视频 | B站 视频/字幕/弹幕/评论 |
| 🎵 | `douyin_mcp` | 短视频 | 抖音 视频/搜索/用户 |
| 📕 | `xiaohongshu_mcp` | 社交 | 小红书 笔记/搜索/评论 |
| 🎬 | `tiktok_mcp` | 短视频 | TikTok 视频/搜索 |
| 🎯 | `site_search` | 定向 | 指定站点内搜索 |

---

### MCP 平台丝 (MCP Platform Threads)

| 蛛丝 | MCP Server | 关键工具 |
|------|------------|---------|
| 🔴 | `bilibili-readonly` | bili_search, bili_video_info, bili_subtitle, bili_comments, bili_danmaku, bili_hot_videos, bili_rank, bili_user_videos, bili_user_info, bili_weekly_hot, bili_favorite_lists, bili_favorite_content |
| 🔵 | `bilibili-video-info` | get_subtitles, get_comments, get_danmaku |
| 🎵 | `douyin-cli` | search, user, video, comments, hot, posts |
| 📕 | `xhs-local` | search_notes, get_note_content, get_note_comments, home_feed, check_cookie |
| 🌐 | `chrome-devtools` | navigate_page, new_page, take_snapshot, take_screenshot, click, fill, evaluate_script, wait_for, list_pages, close_page |
| 🧠 | `browsercode-knowledge` | 本地知识库 MCP（harness/mcp-server.ts） |

---

### Agent 类型丝 (Agent Type Threads)

| 蛛丝 | Agent Type | 模式 | 用途 |
|------|------------|------|------|
| 🕷 | `proreader` | subagent | 研究专家：12 provider 规划 + 执行 + Worker 调度 |
| 🤖 | `general-purpose` | subagent | 通用子代理：解析/审查/PPT/写报告 |
| 📋 | `plan` | primary | 软件架构师：设计方案规划 |
| 🔍 | `explore` | subagent | 只读搜索代理：宽域代码探索 |
| 📖 | `claude-code-guide` | subagent | Claude Code 用法问答 |

---

## 架构组件 — ARCH_FRAMEWORK

```
┌─────────────────────────────────────────────┐
│              TASK ROUTING LAYER              │
│  ┌──────────┐                    ┌────────┐ │
│  │ DIRECT   │                    │RESEARCH│ │
│  │ Channel  │                    │Channel │ │
│  │ (URL/KB/ │                    │(Multi- │ │
│  │  Single  │                    │Source) │ │
│  │  Fact)   │                    └───┬────┘ │
│  └──────────┘                        │      │
│        │                    task({subagent │
│        │                    _type:"proreader"│
│        │                            })     │
│        ▼                             ▼      │
│  ┌──────────┐              ┌──────────────┐ │
│  │  MAIN    │              │  PROREADER   │ │
│  │  AGENT   │              │  SUBAGENT    │ │
│  │  (全工具)│              │  (只读+研究) │ │
│  └────┬─────┘              └──────┬───────┘ │
│       │                           │         │
│       │    ┌──────────────┐      │         │
│       ├───▶│KB PIPELINE   │◀─────┘         │
│       │    │save_source   │   (返回结构化   │
│       │    │save_claims   │    JSON结果)    │
│       │    │link_topic    │                │
│       │    │link_entity   │                │
│       │    │after_capture │                │
│       │    └──────────────┘                │
│       │                                    │
│       │    ┌──────────────┐                │
│       ├───▶│RESCUE LANE   │                │
│       │    │(CDP机械补充) │                │
│       │    └──────────────┘                │
│       │                                    │
│       │    ┌──────────────┐                │
│       └───▶│VAULT WRITE   │                │
│            │save_markdown │                │
│            │_note         │                │
│            └──────────────┘                │
└─────────────────────────────────────────────┘
```

### 管线组件 (Pipeline Components)

| 组件 | 代号 | 职责 |
|------|------|------|
| 路由层 | `task_routing` | 判断 Direct vs Research 通道 |
| 上下文工厂 | `core_context` / `buildBrowserCodeCoreContext` | 动态 phase 注入、LLM Wiki Lite 状态 |
| URL 检测 | `triage` / `dispatchInput` | URL pipeline 触发 |
| 回答引擎 | `answer` / `make_answer_context` | 本地知识库问答检索 |
| 检索管线 | `KB_PIPELINE` | save_source → save_claims → link_* → after_capture |
| 索引引擎 | `FTS5` | 全文搜索引擎（w3 claims / w2 topics / w1 entities / w0 sources） |
| 验证器 | `validator` / `RuntimeValidator` | hard‑block + soft‑warning 校验 |
| 协议层 | `protocol` | ProReaderTaskInput / ProReaderTaskOutput 类型定义 |
| 格式规范 | `VAULT_FORMAT` | 所有 Markdown 格式的单一事实来源 |
| CDP 救援 | `rescue_lane` | 事后 CDP 兜底（Chrome DevTools Protocol） |
| 丰富引擎 | `enrichment` / `enrichment_adapter` | 搜索结果后处理与增强 |
| 审阅服务 | `review` / `review_service` | 候选结果审阅与评分 |
| 发现引擎 | `discovery` | 跨平台内容发现 |
| Wiki 状态 | `llm_wiki_lite` / `llm_wiki_state` | 本地 LLM Wiki 知识状态摘要 |
| 子代理权限 | `subagent_permissions` | 子代理工具 deny/allow 继承规则 |
| Agent 配置 | `agent_config` / `ConfigAgent` | agent type 定义与加载 |
| 指令加载 | `instruction` / `Instruction` | AGENTS.md / CLAUDE.md 自动发现与注入 |

---

## KB 管线 7 步 — KB_PIPELINE_FLOW

```
save_source ──► save_claims ──► link_topic ──► link_entity ──► after_capture
    │               │               │               │               │
    ▼               ▼               ▼               ▼               ▼
kb/sources/    kb/claims/      kb/topics/     kb/entities/     FTS5 REBUILD
{date}-        {name}.         {name}.         {name}.         + VALIDATE
{slug}.md      claims.md       topic.md       entity.md
```

---

## 蜘蛛拼图 — SPIDER_PUZZLE (ASCII Art)

```
              llm_wiki_lite
                   ▲
                   │
     github ────────┼──────── wikipedia
         ╲          │          ╱
          ╲    ┌────┴────┐    ╱
  webfetch ╲   │PRO_READER│   ╱ websearch
            ╲  └────┬────┘  ╱
             ╲      │      ╱
    youtube ──╲─────┼─────╱── official_docs
               ╲    │    ╱
      bilibili ─╲   │   ╱── site_search
                 ╲  │  ╱
        douyin ───╲ │ ╱─── xiaohongshu
                   ╲│╱
          tiktok ───●─── chrome-devtools
                    │
              ┌─────┴─────┐
              │  SPIDER    │
              │  (MAIN     │
              │   AGENT)   │
              └─────┬─────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │  TASK   │ │   READ  │ │  WRITE  │
   │(spawn)  │ │         │ │  EDIT   │
   └────┬────┘ └─────────┘ └────┬────┘
        │                       │
   ┌────┴────┐            ┌─────┴──────┐
   │ SUBAGENT│            │ KB_MANAGE  │
   │ WORKERS │            │ (save_*)   │
   └────┬────┘            └─────┬──────┘
        │                       │
        │              ┌────────┴────────┐
        │              │ SAVE_MD_NOTE    │
        │              │ SEARCH_VAULT    │
        │              └────────┬────────┘
        │                       │
        └───────────┬───────────┘
                    │
              ╔═════╧═════╗
              ║  VAULT    ║
              ║  + KB     ║
              ║  (THE WEB)║
              ╚═══════════╝
                    │
         ┌──────────┼──────────┐
         │          │          │
    articles/   videos/   snippets/
    sources/    claims/   topics/
    entities/   assets/   resources/
```

---

## 守护蛛 — GUARDIAN_THREADS

| 守护丝 | 组件 | 职责 |
|--------|------|------|
| 🛡 运行时验证 | `validator.ts` | KB 管线完整性校验 |
| 🔒 路径安全 | `external_directory` | 文件写入路径沙箱 |
| 📋 格式契约 | `VAULT_FORMAT.md` | 所有格式单一事实来源 |
| 🔄 重试上限 | `stepGuard` | 超时 + 最多 3 次重试 |
| 📐 协议类型 | `protocol.ts` | 标准化 ProReader 输入/输出 |

---

*Spider weaves the web. The web captures knowledge. Knowledge feeds the spider.*
*Browser Code — 蜘蛛结网，网捕知识，知识反哺蜘蛛。*
