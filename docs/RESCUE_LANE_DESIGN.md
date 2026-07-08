# Rescue Lane Design

> ProReader 失败兜底机制 —— 截停 + 救援巷 + 轻量 Loop

---

## 一、问题定义

### 1.1 当前痛点

| # | 问题 | 表现 |
|---|------|------|
| P0 | 无截停 | 某 step 失败 → 无限卡死，整个流程挂 |
| P1 | 无降级 | 失败就是失败，没有第二条路 |
| P2 | CDP 无处安放 | chrome-devtools MCP 在手但接不进流程 |

### 1.2 核心思路

**不改造 ProReader 的工具暴露逻辑，不碰 L0 写路径。** 在 ProReader 外面挂一条轻量救援巷，复用 L0 绕路模式。

```
ProReader（只读，不变）          Rescue Lane（新增）         L0 写（不变）
─────────────────────          ──────────────          ──────────
plan → execute → report       遍历 failures[]          save → vault/
  │                              │                        ↑
  ├── timeout → skip             ├── match reason          │
  ├── 3x retry → skip            ├── CDP scrape ──────────┘
  └── 完成 → report               └── 结果汇总
       + failures[]
```

---

## 二、Phase 1：Executor 截停机制

### 2.1 改动范围

`packages/research/src/provider-executor.ts` —— 在 step 执行循环中插入保护。

### 2.2 per-step 保护参数

```ts
const STEP_GUARD = {
  timeout: {
    web_fetch: 30_000,     // web_to_markdown / firecrawl
    api_call: 15_000,       // GitHub / Wikipedia API
    platform_mcp: 30_000,   // B站 / 抖音 / 小红书 MCP
    video_download: 120_000,// yt-dlp / ffmpeg
    default: 30_000,
  },
  maxRetries: 3,
  retryDelay: 2_000,        // 重试间隔
}
```

### 2.3 执行循环伪代码

```
for each step in plan.steps:
  retries = 0
  while retries < STEP_GUARD.maxRetries:
    result = execute_with_timeout(step, STEP_GUARD.timeout[step.kind])
    if result.ok:
      collect success
      break
    else:
      retries++
      if retries == STEP_GUARD.maxRetries:
        failures.push({
          step: step.id,
          provider: step.provider,
          kind: step.kind,
          url: step.url,
          reason: classifyFailure(result.error),
          retries: retries,
        })
        // → 跳过，继续下一个 step
```

### 2.4 失败分类

```ts
type FailureReason =
  | "timeout"              // 超时，无响应
  | "connection_refused"   // 目标拒绝连接
  | "dns_not_resolvable"   // DNS 解不了
  | "http_404"             // 页面不存在
  | "http_403"             // 被禁止（可能是反爬）
  | "http_5xx"             // 服务端炸了
  | "jsdom_empty_shell"    // JSDOM 拿到空壳（SPA 页面）
  | "low_quality"          // 拿到了内容但质量极低（<50 有效词）
  | "cloudflare_blocked"   // Cloudflare 盾 / 验证码
  | "rate_limited"         // API 限频
  | "cookie_expired"       // 平台 cookie 过期
  | "mcp_unavailable"      // MCP server 不在线
  | "parse_error"          // 内容拿到了但解析失败
  | "unknown"              // 未知错误
```

### 2.5 输出变更

在 `ProReaderResult` 中新增 `failures` 字段：

```json
{
  "report": "...",
  "answerContext": "...",
  "failures": [
    {
      "step": "web_fetch_3",
      "provider": "web_to_markdown",
      "kind": "web_fetch",
      "url": "https://xxx.com/pricing",
      "reason": "jsdom_empty_shell",
      "retries": 3,
      "timestamp": "2026-07-08T12:00:00Z"
    }
  ],
  "recommendedActionIndexes": [...]
}
```

---

## 三、Phase 2：Rescue Lane Loop

### 3.1 定位

- **不进 ProReader** —— ProReader 完全不知道它的存在
- **不进 L0** —— L0 只管写 vault，不管抓取
- **独立巷子** —— 在 ProReader 和 L0 之间，薄薄一层

### 3.2 存储位置

新建文件：`.browser-code/tool/rescue.ts`

（或者放在 `harness/rescue.ts`，和 `enqueue.ts` / `process-queue.ts` 同级）

### 3.3 Loop 结构

```
输入：ProReader 返回的 failures[]
输出：rescued / skipped / failed_again 分类汇总

rescue(failures[]):
  results = []
  
  for each failure in failures:
    // ── Gate: 该不该救 ──
    verdict = match(failure.reason)
    
    if (verdict === "skip"):
      results.push({ ...failure, outcome: "skipped" })
      continue
    
    if (verdict === "uncertain"):
      results.push({ ...failure, outcome: "uncertain", hint: "CDP may help, agent to decide" })
      continue
    
    if (verdict === "rescue"):
      // ── Rescue: CDP 重抓 ──
      cdpResult = cdp_scrape(failure.url, timeout=60_000)
      
      if (cdpResult.ok):
        // 直接走 L0 写入 vault
        vaultNote = save_to_vault(cdpResult.markdown, failure.url)
        results.push({
          ...failure,
          outcome: "rescued",
          vaultPath: vaultNote.path,
        })
      else:
        results.push({
          ...failure,
          outcome: "failed_again",
          rescueError: cdpResult.error,
        })
  
  return {
    total: failures.length,
    rescued: results.filter(r => r.outcome === "rescued"),
    skipped: results.filter(r => r.outcome === "skipped"),
    uncertain: results.filter(r => r.outcome === "uncertain"),
    failedAgain: results.filter(r => r.outcome === "failed_again"),
  }
```

### 3.4 Rescue 决策矩阵

```
failure.reason             → 决策       说明
──────────────────────────────────────────────────
jsdom_empty_shell          → rescue     SPA 页面，CDP 最擅长
cloudflare_blocked         → rescue     真实 Chrome 能过盾
low_quality                → rescue     CDP 拿完整内容
timeout                    → rescue     可能只是慢，CDP 给 60s
rate_limited               → rescue     CDP 不受 API 限频
cookie_expired             → uncertainty agent 可能需要重新登录
mcp_unavailable            → uncertainty agent 可能要重启 MCP
http_403                   → uncertainty 可能反爬，CDP 不一定能过
http_5xx                   → skip       服务端问题，CDP 也没用
dns_not_resolvable         → skip       DNS 死了，谁都解不了
http_404                   → skip       页面真不存在
connection_refused         → skip       端口都没开
```

### 3.5 Loop 自我约束

```ts
const LOOP_GUARD = {
  maxItems: 10,              // 最多救 10 个
  perItemTimeout: 60_000,    // 单个 CDP 超时
  loopTotalTimeout: 300_000, // 整个 rescue 最多 5 分钟
}
```

每轮 rescue 开始前检查：
```
if rescued.length >= LOOP_GUARD.maxItems → 截停，剩余直接标记 skipped
if elapsed > LOOP_GUARD.loopTotalTimeout → 截停，输出部分结果
```

### 3.6 最终返回

agent 看到的结构：

```
Rescue Results:
  5 failures received from ProReader
  ✅ 3 rescued → vault/articles/xxx.md
  ❌ 1 skipped → DNS dead
  🟡 1 uncertain → agent you decide (cookie expired)
  💀 0 failed again

Rescued entries already saved to vault, ready for KB pipeline.
```

---

## 四、需要配置的 MCP

### 4.1 新增配置

在 `.browser-code/browser-code.jsonc` 的 MCP 段中确认 CDP 可用：

```jsonc
"chrome-devtools": {
  "type": "local",
  "command": ["npx", "-y", "@anthropic-ai/mcp-server-chrome-devtools"],
  "enabled": true
}
```

如果已经通过 Claude Code 的 MCP 配置了，需要确认 opencode/Browser-Code 侧也能访问（或者 rescue lane 直接用 `mcp__chrome-devtools__*` 工具而非独立配置）。

### 4.2 CDP 调用封装

```ts
async function cdpScrape(url: string, timeout: number) {
  // 1. 打开新页面
  await mcp__chrome-devtools__new_page({ url })
  
  // 2. 等待页面加载完成
  await mcp__chrome-devtools__wait_for({ text: "body", timeout })
  
  // 3. 提取内容（两种策略）
  const snapshot = await mcp__chrome-devtools__take_snapshot({})
  // 或者直接注入提取逻辑：
  const text = await mcp__chrome-devtools__evaluate_script({
    expression: "document.body.innerText"
  })
  
  // 4. 关闭页面
  await mcp__chrome-devtools__close_page({})
  
  return text
}
```

---

## 五、Phase 3：修复 kb_manage 幽灵工具

### 5.1 当前状况

`kb_manage` 在 prompt 和工具 description 中被广泛引用，但实际上**代码里不存在**。

| Prompt 引用 | 实际执行 |
|---|---|
| `kb_manage action="search"` | `bash: bun run kb:search` |
| `kb_manage action="after_capture"` | `write` kb/sources → `write` kb/claims → `bash: kb:after-capture` |
| `kb_manage action="enqueue"` | `bash: bun run kb:enqueue` |

agent 能跑通是因为它读了那四个 wiki 文件（WIKI_MANAGER.md / CLAIM_POLICY.md / RETRIEVAL_POLICY.md / CAPTURE_WORKFLOW.md），知道每一步怎么做。但如果 agent 真去调 `kb_manage` 这个不存在的工具名，会浪费一轮调用。

### 5.2 改动

**不实现 kb_manage 工具**。改为在 prompt 中把 `kb_manage` 替换为实际命令：

```
旧（幽灵工具）：          新（明确命令）：
─────────────────────    ─────────────────────
kb_manage search "X"     bash: bun run kb:search "X"
kb_manage after_capture   write kb/sources/ + write kb/claims/ + bash: kb:after-capture
kb_manage enqueue         bash: bun run kb:enqueue
```

### 5.3 影响

- 去掉 agent 对不存在工具的依赖
- 不再受上下文/记忆影响——命令是明确的，不存在"忘了怎么调"的问题
- rescue lane 的 KB 入库也受益：rescued 的内容直接走 `bash: kb:after-capture`，跟 prompt 命令一致

---

## 六、Phase 4：save_markdown_note 本地文件短路

### 6.1 问题

`save_markdown_note` 要求 `source_url` 必须是有效 HTTP URL。但这套工具链不仅能处理网页——模型自身的多模态能力（Read 工具）能看 PDF、图片、DOCX，agent 能把任何内容整理成 Markdown。阻塞点是 save 工具不接受本地来源。

### 6.2 三层能力现状

```
文件类型          提取层                  清洗层             存储层
────────          ──────                  ──────             ──────
.md               Read（直接读）          不需要              ❌ 没有 URL 被拒
图片              ocr_text / Read         agent 整理成 MD     ❌ 同上
PDF               Read（唯一方案）        agent 整理成 MD     ❌ 同上
DOCX              Read（唯一方案）        agent 整理成 MD     ❌ 同上
网页              web_to_markdown         自动清洗            ✅ 正常
```

Read 已经是多模态兜底——不管什么格式，只要 LLM 能"看到"，就能提取。只是 save 的 URL 约束卡住了最后一步。

### 6.3 短路方案

在 `save_markdown_note` 中加一个本地模式，不改动提取层、不改动清洗层：

```ts
function saveMarkdownNote(input):
  
  if (input.source_url 存在 && 是 http(s)://):
    → 走现有路径（URL 校验、去重、规范命名）
  
  else if (input.markdown 存在 && input.title 存在):
    → 短路路径（本地模式）：
      1. 跳过 URL 校验
      2. source_url 自动生成 "local://<content_hash>"
      3. 用 title + 日期生成文件名
      4. 走同样的 frontmatter + 写文件 + 建 vault index
      5. 去重基于 content_hash（而非 source_url）
  
  → 返回 filePath
```

### 6.4 决策

**不造新工具，只给 save_markdown_note 加一个非 URL 入口。** 理由：

- 提取层不需要改——Read 已经是多模态兜底，ocr_text 已经能扫图
- 清洗层不需要改——agent 自己能把内容整理成 MD
- 存储层的后半段（frontmatter、标签、索引）跟来源无关
- 唯一卡住的是前半段的 URL 校验

### 6.5 改动量

`save_markdown_note.ts`（或 `packages/tool-vault/src/save-note.ts`）：在现有校验逻辑前加一个分支，约 +30 行。

---

## 七、不改的东西（明确边界）

| 不改 | 原因 |
|------|------|
| ProReader 工具暴露逻辑 | 只读研究器，工具面不变 |
| ProReader 的 plan/route | 失败信息附加在返回结果上，不参与 plan |
| L0 写路径 | rescue 成功的内容直接调 L0 写，不新建路径 |
| KB pipeline | 正常走 enqueue → process-queue → build_index |
| agent 手动 CDP | agent 仍然可以自己调 CDP，rescue lane 不替代 |
| kb_manage 工具 | 不实现，改为 prompt 明确命令 |

---

## 八、实现顺序

| 阶段 | 内容 | 预估改动量 |
|------|------|-----------|
| **P1** | executor 截停机制 | `provider-executor.ts` 约 +60 行 |
| **P2** | 失败分类 + failures[] 返回 | `provider-executor.ts` + `index.ts` 约 +40 行 |
| **P3** | rescue lane 主体 | 新建 `rescue.ts` 约 120 行 |
| **P4** | CDP 调用封装 | `rescue.ts` 内 +30 行 |
| **P5** | kb_manage 幽灵工具清理 | `browser-code.txt` 替换引用（不改代码） |
| **P6** | save_markdown_note 本地短路 | `save_markdown_note.ts` 约 +30 行 |
| **P7** | agent prompt 告知 rescue + 本地短路 | `browser-code.txt` 约 +15 行 |

---

## 九、流程图（全链路）

```
                          ┌─ Read (多模态) ← PDF/图片/DOCX/MD
                          │
                          ▼
                        agent 整理成 MD
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    save_markdown_note                         │
│  ┌──────────────────┐    ┌─────────────────────────────┐     │
│  │ 正常模式          │    │ 短路模式（Phase 4 新增）      │     │
│  │ source_url=http   │    │ source_url=local://hash     │     │
│  │ URL 去重 + 命名    │    │ 内容 hash 去重              │     │
│  └──────┬───────────┘    └──────────────┬──────────────┘     │
│         └──────────────┬───────────────┘                    │
│                        ▼                                     │
│            frontmatter + 写 .md + vault index                │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
                  vault/xxx.md
                         │
                         │ (agent 手动，Phase 3 后 prompt 明确)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    KB 入库（手动三步）                         │
│  1. write kb/sources/<name>.md                               │
│  2. write kb/claims/<name>.claims.md                         │
│  3. bash: bun run kb:after-capture                           │
│     → enqueue → process-queue → FTS5 index                   │
└──────────────────────────────────────────────────────────────┘

出处：
- web: web_to_markdown (JSDOM) / firecrawl / CDP
- 本地: Read → agent → save 短路
- 视频: B站/YouTube/抖音/小红书 MCP
- 代码: GitHub API
- 百科: Wikipedia API
- 本地知识库: kb:search (FTS5)

               ┌─────────────┐
               │  用户请求    │
               └──────┬──────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    网页 URL?    视频/平台?    本地文件?
         │            │            │
         ▼            ▼            ▼
   ProReader      ProReader      Read 工具
   .routeQuery    .routeQuery    (多模态)
         │            │            │
         ▼            ▼            ▼
   ProReader      ProReader      agent
   .planProviders .planProviders 整理成 MD
         │            │            │
         ▼            ▼            ▼
┌────────────────────┐     save 短路模式
│ ProReader.execute  │     (Phase 4)
│ ┌────────────────┐ │          │
│ │ per-step 截停   │ │          ▼
│ │ timeout+retry  │ │    vault/xxx.md
│ │ (Phase 1)      │ │
│ │                │ │
│ │ step 1 ✅      │ │
│ │ step 2 ❌ ─────┼─┼──→ failures[]
│ │ step 3 ✅      │ │
│ │ step 4 ❌ ─────┼─┼──→ failures[]
│ └────────────────┘ │
└────────┬───────────┘
         │
    { report, failures[] }
         │
         ▼
┌────────────────────┐
│   Rescue Lane      │  ← Phase 3
│   (轻量 Loop)       │
│ ┌────────────────┐ │
│ │ per failure:   │ │
│ │  match(reason) │ │
│ │   ├─ rescue ───┼─┼──→ CDP scrape
│ │   ├─ skip      │ │        │
│ │   └─ uncertain │ │        ▼
│ │                │ │   拿到内容
│ └────────────────┘ │        │
│  自我约束:          │        ▼
│   maxItems=10      │   save正常模式
│   totalTimeout=5min│        │
└────────┬───────────┘        │
         │                    ▼
    { rescued,         vault/xxx.md
      skipped,
      uncertain,
      failedAgain }
         │
         ▼
    agent 拿到汇总
         │
    ┌────┴────┐
    │         │
    ▼         ▼
rescued     agent
已入库     手动 CDP
         uncertain 项

所有 vault 新文件:
    → 手动三步 KB 入库（Phase 3 后 prompt 明确）
    → 不走 kb_manage（已删除幽灵工具）
```

---

*方案定稿，待讨论确认后实现。*
