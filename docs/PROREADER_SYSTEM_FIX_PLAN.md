# ProReader 系统修复方案（可执行技术文档）

> 版本: v2.1
> 日期: 2026-07-05
> 状态: 待执行
> 范围: ProReader 路由架构修正 + 工具注册补齐

---

## 目录

- [一、问题根因分析](#一问题根因分析)
- [二、修复策略](#二修复策略)
- [三、架构设计](#三架构设计)
- [四、执行步骤](#四执行步骤)
  - [Phase 1: Agentic Triage 分层路由](#phase-1-agentic-triage-分层路由)
  - [Phase 2: 工具注册补齐](#phase-2-工具注册补齐)
  - [Phase 3: System Prompt 对齐](#phase-3-system-prompt-对齐)
  - [Phase 4: 验证与收尾](#phase-4-验证与收尾)
- [五、涉及文件清单](#五涉及文件清单)
- [六、风险与回退](#六风险与回退)
- [七、验证用例](#七验证用例)

---

## 一、问题根因分析

### 1.1 核心矛盾

当前架构中 ProReader 被设计为**所有非 URL 输入的强制守门人**，导致两个方向的失败：

```
原始状态（太松）:
  Agent 天生倾向最短路径 → 绕过 ProReader → 用 skill/简单搜索 → 研究质量差
  ↓ 用户被迫加入强制路由

当前状态（太紧）:
  强制所有非 URL 输入进 ProReader → 门禁过度 → 简单操作也被卡死 → 什么都做不了
```

**两个状态都失败了，因为 ProReader 被放在了错误的位置。**

### 1.2 为什么 Agent 总是绕过 ProReader

不是 agent "懒"，是 LLM 的认知负荷最优化：

| 选择 | 认知负荷 | Agent 倾向 |
|------|:---:|:---:|
| 调 ProReader（填参数 → 等路由 → 解读 JSON → 按 plan 执行） | 高 | 避 |
| 直接 skill + multi-search-engine（一个调用 → 结果回来） | 低 | 选 |

这是 next-token-prediction 的固有倾向，prompt engineering 无法根治。

### 1.3 为什么强制路由反而失败

```
ProReader 被当作守门人:
  非 URL 输入 → ProReader 门禁 → agent 工具被严格限制
    ├── 写入工具不暴露（web_to_markdown 从未在 deriveAllowedTools 中）
    ├── 写入指令自相矛盾（"Do not write vault, kb, or sqlite"）
    ├── Save 确认脆弱（question 工具 + 关键词匹配）
    └── KB 管理工具不存在（全部是 CLI 脚本，未注册为工具）

结果: agent 被套上枷锁，连简单操作都无法完成。
```

### 1.4 根本原因

> **ProReader 不应该是一个守门人，应该是一个专用研究员。**
>
> 它的职责是"多源研究路由"，不是"所有任务的工作流编排"。
> 保存笔记、KB 管理这些操作不需要研究路由——它们需要的是完整的工具可用性。

---

## 二、修复策略

### 2.1 核心思路

```
不修 ProReader 内部（保留其现有研究路由能力）
而是在它前面加一层 Agentic Triage，让不需要研究路由的任务绕开它
同时补齐工具注册，让直通车道上有完整的工具可用
```

### 2.2 三条原则

1. **ProReader 只做它擅长的事**：多源研究路由。不做守门人。
2. **Agentic Triage 做入口分流**：模型自主判断任务是简单操作还是需要研究路由（二元判断）。
3. **工具注册补齐**：只注册那些"现有通用工具做不到"的专用能力。能用 `read`/`write`/`bash` 解决的不新建工具。

### 2.3 奥卡姆剃刀：不做的事情

| 项目 | 原因 |
|------|------|
| `build_index` 独立工具 | `save_markdown_note` 自动建 vault 索引 + `kb_manage build_fts5` 建 FTS5，已覆盖 |
| `read_note` 独立工具 | 现有 `read` 工具已覆盖。search 结果含 path，直接用 `read(path)` |
| ToolExposureAgent 子代理 | 分层后 L1 全工具、ProReader 内现有规则够用 |
| ProReader save flow 修复 | 保存不经过 ProReader，自然绕过 |
| vault-adapter 真实写入模式 | 保存走 L1 write 工具 |
| deriveAllowedTools 重写 | 分层后 L1 全放 + ProReader 内现有规则 |
| registry.ts 核心改动 | 通过 plugin tool 注册，不改核心 |

---

## 三、架构设计

### 3.1 分层路由架构

```
                         用户输入
                             │
                             ▼
                    ┌─────────────────┐
                    │  Agentic Triage  │  ← 极简 LLM 判断
                    │ L1（直通）还是   │     二元输出
                    │ PROREADER？      │
                    └──────┬──────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
         ┌────────┐              ┌──────────┐
         │  L1    │              │ PROREADER│
         │ 直通   │              │ 研究路由 │
         │ 车道   │              └────┬─────┘
         └───┬────┘                   │
             │                        │ ProReader 内部自行判断:
             │                        ├── 普通模式 (standard)
             │                        │   单 agent 定向路由
             │                        └── 增强模式 (comprehensive)
             │                             并行子代理+交叉验证
             ▼
      全工具可用
      ProReader 不干预
```

**Triage 只做二元判断**：简单操作走 L1，需要外部信息/研究的走 ProReader。ProReader 内部已有 `chooseExecutionProfile()` 根据查询关键词决定普通还是增强——不需要 triage 替它做这个决定。

### 3.2 各层级定义

#### L1：简单操作（直通车道）

**不走 ProReader。全工具可用。**

| 操作类型 | 示例 |
|---------|------|
| 保存/记录 | "保存这个页面"、"把分析结果记下来" |
| 知识库检索 | "知识库里有没有 XXX"、"我之前的 XXX 笔记在哪" |
| 知识库管理 | "整理知识库"、"重建索引" |
| 单页获取 | "获取这个链接的内容"、"转成 Markdown" |
| 对已有内容的查询 | "我之前记录的 XXX 是什么" |
| ProReader 后的保存确认 | 上一轮 ProReader 完成研究，用户说"保存" |

**检索优先顺序**：

```
主路径:
  kb_manage(action="search", query="...")
    → SQLite FTS5 全文搜索
    → 按金字塔权重排序: claims(权重3) > topics(2) > entities(1) > sources(0)
    → 如需详细上下文: kb_manage(action="context", query="...")
        生成结构化 answer_context（Claims 优先，含引用溯源）

回退路径（仅在 kb:search 空结果时）:
  search_vault(query="...")
    → vault 标签索引 + 原始 Markdown 关键词匹配
    → 用于查找孤儿笔记或刚保存未进 pipeline 的笔记
```

#### ProReader：需要外部信息的研究任务

**走 ProReader。内部自行判断普通/增强模式。**

| 操作类型 | 示例 |
|---------|------|
| 定向查询 | "帮我查 WebGPU 最新支持情况" |
| 多源搜索 | "B 站上有没有 Mate 80 的评测" |
| 多源对比 | "对比分析 A 和 B" |
| 趋势分析 | "XXX 领域的现状和趋势" |
| 深度研究 | "深入研究 XXX 的技术方案" |
| 任何模糊的研究请求 | 不确定的就走 ProReader |

### 3.3 完整交互流程

#### 场景 A：深度研究 + 保存

```
Turn 1: 用户 "深入研究 Mate 80 影像系统，写报告"
  → Triage agent: 需要外部研究 → PROREADER
  → ProReader（内部判断为增强模式）: 并行搜索 + 交叉验证
  → 生成报告 → Agent: "报告如下... 要保存吗？"

Turn 2: 用户 "保存"
  → Triage agent 看到上下文: 上一轮 ProReader 刚完成研究
  → 判断: L1（保存确认）
  → 直通车道: write(vault/articles/xxx.md, content=报告) → kb_manage(after_capture)
  → Agent: "已保存。KB 索引已更新。"
```

#### 场景 B：简单保存

```
Turn 1: 用户 "把这个页面保存到知识库 https://example.com/article"
  → Triage agent: 不需要研究路由 → L1
  → 直通车道: web_to_markdown(url) → save_markdown_note(...)
    → save_markdown_note 自动去重、生成规范文件名、重建 vault 标签索引
  → kb_manage(action="after_capture", vault_path="...")
  → Agent: "已保存。KB 索引已更新。"
```

#### 场景 C：知识库检索

```
Turn 1: 用户 "我知识库里有没有关于 WebGPU 的笔记？"
  → Triage agent: 对已有内容的查询 → L1
  → 主路径: kb_manage(action="search", query="WebGPU")
    → FTS5 搜索 kb/claims(权重3) + kb/topics(2) + kb/entities(1) + kb/sources(0)
    → 有结果: 展示提炼后的知识声明，可溯源到原始笔记
    → 无结果: 回退 search_vault("WebGPU") 查 orphan
  → Agent: "你的 KB 中有 X 条相关记录..."
```

---

## 四、执行步骤

### Phase 1: Agentic Triage 分层路由

#### 目标

在 `core-context.ts` 中实现一个极简的 LLM 判断层，替代当前的"非 URL 一律进 ProReader"逻辑。

#### 1.1 当前代码

**文件**: `opencode/packages/opencode/src/browser-code/core-context.ts`

当前 `triage.ts` 返回 4 种分类（`existing_url_pipeline` / `proreader` / `ambiguous` / `normal_agent`），但 `core-context.ts` 把它简化成了二元（URL vs ProReader），`normal_agent` 路径被吃掉了。

#### 1.2 改动方案

**核心思路**：不新增 triage 函数。在 system prompt 中注入 Triage 指令，让 agent 在做任何事之前先输出分类决定。这是 agentic 判断，不是 regex 规则。

**文件**: `opencode/packages/opencode/src/browser-code/core-context.ts`

**改动**: 在 system prompt 构建部分新增 Triage 指令块：

```markdown
## 任务分类（Triage）

在处理用户请求之前，先判断: 这个任务是否需要 ProReader 研究路由？

### L1 - 直通车道
以下情况**不需要** ProReader，直接使用工具完成:
- 保存/记录/归档内容到知识库（包括 ProReader 研究完成后的保存确认）
- 对已有知识库内容的检索（"知识库里有没有XXX"）
- 单纯的文件操作或知识库管理
- 单页面内容获取（"获取这个链接的内容"）
- 上一轮 ProReader 刚完成研究，用户现在确认保存

L1 特征: **不需要从外部获取新信息、不需要多源对比、不需要深度分析**

### PROREADER - 研究路由
以下情况**需要** ProReader:
- 需要从外部获取信息（搜索、查询）
- 需要多源对比或交叉验证
- 需要深入分析、趋势判断
- 不确定的、模糊的研究请求

### 安全侧规则
- **宁可误判进 PROREADER，不要漏掉研究任务**
- **结合对话上下文判断，不要只看当前这句话**
- **前一轮 ProReader 完成研究 + 用户说"保存"/"好的"/"行" → L1**
- **不确定 → PROREADER**

### 输出格式
判断完成后，首先输出:
```
[TRIAGE: L1]
原因: <一句话>
```
或
```
[TRIAGE: PROREADER]
原因: <一句话>
```

- L1: 直接完成任务，不调用 proreader
- PROREADER: 调用 proreader 工具。ProReader 内部自行判断 researchDepth
```

**改动**: 新增 L1 直通车道的 phase 配置

```typescript
// L1 直通车道: 所有内置工具可用，不经过 ProReader gate
const L1_DIRECT_PHASE = "l1_direct";
// 在此 phase 下，allowedTools = undefined（全部允许）
// ProReader 工具本身在 L1 不可用（不需要）
```

**文件**: `opencode/packages/opencode/src/session/tools.ts`

**改动**: `allowToolForBrowserCodeCoreContext` 增加 `l1_direct` phase 处理：

```typescript
case "l1_direct":
  // L1 直通车道: 所有工具可用，除了 proreader（L1 不需要它）
  if (toolID === "proreader") return false;
  return true;
```

#### 1.3 改动影响范围

| 文件 | 改动 |
|------|------|
| `opencode/packages/opencode/src/browser-code/core-context.ts` | Triage 指令注入 + L1 phase |
| `opencode/packages/opencode/src/session/tools.ts` | `l1_direct` phase 处理 |

---

### Phase 2: 工具注册补齐

#### 目标

将所有已实现但未注册为 LLM 可调用工具的能力，通过 `.browser-code/tool/` 目录注册为 plugin tool。

**奥卡姆剃刀原则**：能用现有通用工具（`read`/`write`/`bash`）做到的，不新建。只新建那些提供"通用工具做不到的专用能力"的工具。

#### 2.1 注册方式

```
Plugin Tool (不改 registry.ts 核心)
  路径: .browser-code/tool/<tool-name>.ts
  自动被 registry.ts 的 {tool,tools}/*.{js,ts} glob 加载
```

#### 2.2 需要注册的工具（3 个新建 + 1 个确保暴露）

##### 工具 1: `web_to_markdown`（已注册，确保 L1 可暴露）

- **状态**: 已在 registry 注册为 builtin ✅
- **需要做**: L1 直通车道 `allowedTools = undefined`，自然可用。**无需改动。**

##### 工具 2: `save_markdown_note`（新建）

- **为什么需要独立工具而非直接用 `write`**：`save_markdown_note` 提供 `write` 做不到的专用能力——自动去重（source_url 检测）、文件名规范化（`YYYY-MM-DD__slug__hash.md`）、自动重建 vault 标签索引（`buildIndex()`）、标签词汇表更新。这些是 vault 知识库管理必需的，`write` 只是通用文件写入。
- **对应代码**: `packages/tool-vault/src/save-note.ts`
- **创建文件**: `.browser-code/tool/save_markdown_note.ts`

```typescript
// .browser-code/tool/save_markdown_note.ts
import { Tool } from "../../opencode/packages/opencode/src/tool/core/types";
import { saveMarkdownNote } from "../../packages/tool-vault/src/save-note";

export default Tool.define("save_markdown_note", {
  description: `保存 Markdown 笔记到 vault 知识库。

与 write 工具的区别:
- write: 通用文件写入，不感知 vault 结构
- save_markdown_note: vault 专用
  - 自动去重（基于 source_url 检测是否已保存过）
  - 自动生成规范文件名（YYYY-MM-DD__标题__8位hash.md）
  - 自动选择正确的子目录（articles/videos/documents/snippets/resources）
  - 自动重建 vault 标签索引（vault/index/index.json）
  - 自动更新标签词汇表

保存完成后，应继续调用 kb_manage(action="after_capture") 完成 LLM Wiki Lite 的 FTS5 索引更新。`,
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "完整的 Markdown 内容" },
      title: { type: "string", description: "笔记标题" },
      source_url: { type: "string", description: "来源 URL，用于去重检查" },
      content_type: {
        type: "string",
        enum: ["article", "video", "document", "snippet", "resource"],
        description: "内容类型，决定保存到哪个子目录。默认 article"
      },
      tags: { type: "array", items: { type: "string" }, description: "标签列表" }
    },
    required: ["content", "title"]
  },
  execute: async (args) => {
    const result = await saveMarkdownNote({
      content: args.content,
      title: args.title,
      sourceUrl: args.source_url,
      contentType: args.content_type || "article",
      tags: args.tags || [],
    });
    return {
      filePath: result.filePath,
      isDuplicate: result.isDuplicate,
      existingPath: result.existingPath,
    };
  }
});
```

##### 工具 3: `search_vault`（新建——回退检索）

- **为什么需要独立工具而非用 `grep`**：`search_vault` 读取 vault 标签索引（`vault/index/index.json`），按标题(权重5) > 标签(4) > 关键词(3) > 正文(1) 的结构化权重搜索。`grep` 只是纯文本正则，没有 vault 结构感知。
- **定位**: **回退检索**。主检索路径是 `kb_manage(action="search")`（FTS5 + 金字塔权重）。`search_vault` 仅在 kb:search 空结果或查找孤儿笔记时使用。
- **对应代码**: `packages/tool-vault/src/search-vault.ts`
- **创建文件**: `.browser-code/tool/search_vault.ts`

```typescript
// .browser-code/tool/search_vault.ts
import { Tool } from "../../opencode/packages/opencode/src/tool/core/types";
import { searchVault } from "../../packages/tool-vault/src/search-vault";

export default Tool.define("search_vault", {
  description: `[回退检索] 搜索 vault 原始笔记的标签索引。

检索优先级:
  主路径: kb_manage(action="search", query="...")
    → FTS5 全文搜索 kb/claims + kb/topics + kb/entities + kb/sources
    → 按金字塔权重排序: claims > topics > entities > sources
    → 搜索经过提炼的结构化知识

  回退路径（本工具）: search_vault(query="...")
    → 仅在 kb_manage search 无结果时使用
    → 搜索 vault 原始 Markdown 笔记
    → 适用场景: 查找孤儿笔记、刚保存未进 pipeline 的笔记

搜索策略:
- 标题匹配权重 5
- 标签匹配权重 4
- 关键词匹配权重 3
- 正文匹配权重 1`,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" },
      limit: { type: "number", description: "返回数量上限，默认 10" },
      content_type: {
        type: "string",
        enum: ["article", "video", "document", "snippet", "resource"],
        description: "限定内容类型"
      }
    },
    required: ["query"]
  },
  execute: async (args) => {
    const results = await searchVault(args.query, {
      limit: args.limit || 10,
      contentType: args.content_type,
    });
    return {
      total: results.length,
      results: results.map(r => ({
        title: r.title,
        path: r.path,
        contentType: r.contentType,
        tags: r.tags,
        score: r.score,
        snippet: r.snippet,
      }))
    };
  }
});
```

##### 工具 4: `kb_manage`（新建——LLM Wiki Lite 统一入口）

- **为什么需要独立工具而非用 `bash`**：`bash` 可以跑 `bun run kb:search`，但 agent 不知道这些脚本的存在。`kb_manage` 作为具名工具，agent 在工具列表中看到它，描述说清楚了用途和用法。它本质上是 harness 脚本的"工具注册包装"。
- **对应代码**: `harness/search.ts` + `harness/make_answer_context.ts` + `harness/after-capture.ts` + `harness/build_index.ts` + `harness/process-queue.ts`
- **创建文件**: `.browser-code/tool/kb_manage.ts`

```typescript
// .browser-code/tool/kb_manage.ts
import { Tool } from "../../opencode/packages/opencode/src/tool/core/types";
import { spawn } from "child_process";

function runHarness(script: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", ["run", `harness/${script}.ts`, ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,  // 60s timeout
    });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d: Buffer) => stdout += d.toString());
    proc.stderr.on("data", (d: Buffer) => stderr += d.toString());
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${script} exited ${code}: ${stderr || stdout}`));
    });
  });
}

export default Tool.define("kb_manage", {
  description: `LLM Wiki Lite 知识库管理与检索工具。

## 检索（主路径）

### search — FTS5 全文搜索
搜索 kb/claims + kb/topics + kb/entities + kb/sources 的 FTS5 索引。
按金字塔权重排序: claims(权重3) > topics(2) > entities(1) > sources(0)
用法: action="search", query="关键词"

### context — 构建结构化回答上下文
搜索 KB 后按优先级分类输出到 .tmp/answer_context.md：
Claims(限6) → Topics(限3) → Entities(限3) → Sources(限3)
附带溯源引用。回答时优先引用 claims。
用法: action="context", query="关键词"

## 后处理

### after_capture — 一键后处理（保存笔记后使用）
enqueue → process_queue → build_fts5
用法: action="after_capture", vault_path="vault/articles/xxx.md"

### build_fts5 — 仅重建 FTS5 索引
用法: action="build_fts5"

## 维护

### status — 查看处理队列状态
用法: action="status"

### scan — 扫描孤儿笔记
查找 vault 中未进入 KB 流程的笔记
用法: action="scan"

## 知识库架构
vault/ (原始笔记) → kb/sources/ (来源摘要) → kb/claims/ (原子知识声明)
                                            → kb/topics/ + kb/entities/ (交叉组织)
                                            → index/browsercode.sqlite (FTS5 索引)

处理队列状态机:
0=pending → 1=source_done → 2=claims_done → 3=topics_done → 4=done(索引已重建)
步骤 0→1 和 1→2 需要创建 kb/sources/ 和 kb/claims/ 文件（参考 kb/.template.md）`,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "context", "after_capture", "build_fts5", "status", "scan"],
        description: "操作类型"
      },
      vault_path: {
        type: "string",
        description: "vault 笔记路径（after_capture 需要）"
      },
      query: {
        type: "string",
        description: "搜索关键词（search/context 需要）"
      },
    },
    required: ["action"]
  },
  execute: async (args) => {
    switch (args.action) {
      case "search":
        return { output: await runHarness("search", [args.query || ""]) };
      case "context":
        return { output: await runHarness("make_answer_context", [args.query || ""]) };
      case "after_capture":
        return { output: await runHarness("after-capture", [args.vault_path || ""]) };
      case "build_fts5":
        return { output: await runHarness("build_index", []) };
      case "status":
        return { output: await runHarness("process-queue", []) };
      case "scan":
        return { output: await runHarness("process-queue", ["--scan"]) };
      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  }
});
```

#### 2.3 工具清单总结

| # | 工具名 | 新建？ | 原因 |
|---|--------|:---:|------|
| 1 | `web_to_markdown` | 否 | 已有，L1 自然暴露 |
| 2 | `save_markdown_note` | **是** | vault 专用保存：去重+命名+索引。`write` 做不到 |
| 3 | `search_vault` | **是** | vault 结构化搜索。**回退路径**，主搜索走 kb_manage |
| 4 | `kb_manage` | **是** | KB 统一入口。`bash` 能做到但 agent 不知道这些脚本存在 |

**不建的**：`build_index`（被 save_markdown_note + kb_manage 覆盖）、`read_note`（`read` 已覆盖）

---

### Phase 3: System Prompt 对齐

#### 3.1 `browser-code.txt` 改动

**文件**: `opencode/packages/opencode/src/session/prompt/browser-code.txt`

**改动 1**: 替换模糊的 "update index"（约第 75 行）

```
改前:
  Use TodoWrite to plan multi-step captures (e.g. fetch -> convert -> localize images -> write note -> update index).

改后:
  Use kb_manage(action="after_capture", vault_path="<path>") after saving a note to vault/.
  This completes the post-capture pipeline: enqueue → process_queue → rebuild FTS5 index.
```

**改动 2**: 在文件末尾新增 KB 管理章节

```markdown
## Post-Save Knowledge Base Management

保存笔记到 vault/ 后，完成 KB 管理流水线:

1. 笔记已通过 write 或 save_markdown_note 写入 vault/

2. (可选) 创建 kb/sources/<同名>.md:
   - 来源元数据和摘要
   - 格式参考 kb/.template.md

3. (可选) 创建 kb/claims/<同名>.claims.md:
   - 从来源中提取原子知识声明
   - 每个声明标注来源、区分事实与推断
   - 格式参考 wiki/CLAIM_POLICY.md

4. 运行后处理:
   kb_manage(action="after_capture", vault_path="vault/articles/xxx.md")
   自动完成 enqueue → process_queue → build_fts5
```

#### 3.2 `core-context.ts` 改动

**改动 1**: L1 直通车道 system prompt

```typescript
const L1_DIRECT_PROMPT = `
## 当前模式: L1 直通车道

拥有完整工具集。不需要调用 proreader。直接完成任务。

### 知识库检索标准流程（重要）
检索优先走 KB 提炼层:
1. kb_manage(action="search", query="...") — 主路径
   → FTS5 搜索 kb/claims(权重3) + kb/topics(2) + kb/entities(1) + kb/sources(0)
   → 如需结构化上下文: kb_manage(action="context", query="...")
       生成 Claims→Topics→Entities→Sources 的分层 answer_context
2. 仅在 kb:search 空结果时: search_vault(query="...") — 回退
   → 查 vault 原始笔记（孤儿/刚保存未进 pipeline）

### 保存笔记标准流程
1. 有 URL: web_to_markdown(url) → Markdown
2. save_markdown_note(content=..., title=..., ...) → vault/
   (自动去重、规范文件名、重建 vault 标签索引)
   或 write(filePath="vault/.../xxx.md", content=...) → vault/
   (通用写入，无去重/索引)
3. kb_manage(action="after_capture", vault_path="...") → FTS5 索引更新

### 知识库管理
- 查看队列: kb_manage(action="status")
- 扫描孤儿: kb_manage(action="scan")
`;
```

**改动 2**: ProReader 执行阶段 system prompt

```typescript
const PROREADER_EXECUTE_PROMPT = `
## 当前模式: ProReader 执行阶段

ProReader 已完成路由规划。按 plan 执行信息获取和分析。

### 不要写入 vault/kb
研究阶段专注于搜索和分析。完成后展示结果，询问是否保存。
保存操作在下一轮走 L1 直通车道完成。
`;
```

#### 3.3 `proreader.ts` 指令修正

**文件**: `.browser-code/tool/proreader.ts`（约第 188 行）

```
改前:
  "Do not write vault, kb, or sqlite from ProReader."

改后:
  "ProReader 专注于研究路由和结果生成。
   研究阶段不要直接写入 vault/kb。
   研究完成后展示结果，保存由用户确认后走 L1 直通车道完成。"
```

---

### Phase 4: 验证与收尾

#### 4.1 清理项（低优先级）

| 项目 | 说明 |
|------|------|
| `"search"`, `"multi_search_engine"` 幽灵工具名 | `provider-actions.ts` 和 `core-context.ts` 中清理 |
| `proreader_save_confirmed` phase | 保留代码但实际不再触发 |
| vault-adapter.ts `assertVaultHandoffIsDryRun` | 不影响，保存走 L1 |

#### 4.2 明确不做

| 项目 | 原因 |
|------|------|
| `build_index` 独立工具 | save_markdown_note + kb_manage 覆盖 |
| `read_note` 独立工具 | `read` 覆盖 |
| ToolExposureAgent | L1 全工具 + ProReader 现有规则 |
| vault-adapter 改造 | 保存走 L1 |
| registry.ts 改动 | plugin tool 自动加载 |

---

## 五、涉及文件清单

### 新建文件（3 个）

| 文件 | 说明 |
|------|------|
| `.browser-code/tool/save_markdown_note.ts` | Plugin tool: vault 专用保存 |
| `.browser-code/tool/search_vault.ts` | Plugin tool: vault 回退搜索 |
| `.browser-code/tool/kb_manage.ts` | Plugin tool: KB 管理统一入口 |

### 修改文件（4 个）

| 文件 | 改动 |
|------|------|
| `opencode/packages/opencode/src/browser-code/core-context.ts` | L1 phase + Triage 指令 + L1/ProReader system prompt |
| `opencode/packages/opencode/src/session/tools.ts` | `l1_direct` phase（全工具放行，block proreader） |
| `opencode/packages/opencode/src/session/prompt/browser-code.txt` | "update index" → 明确指令 + Post-Save KB Management |
| `.browser-code/tool/proreader.ts` | 修正 "Do not write" 指令 |

### 不需要修改

| 文件 | 原因 |
|------|------|
| `opencode/packages/opencode/src/tool/registry.ts` | Plugin tool 自动加载 |
| `packages/research/src/*` | ProReader 内部逻辑保留 |
| `packages/tool-vault/src/*` | 实现保留，被 plugin tool 包装调用 |

---

## 六、风险与回退

### 6.1 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|:---:|:---:|------|
| Triage 误判研究任务为 L1 | 低 | 高 | Triage prompt 安全侧："不确定 → PROREADER" |
| Triage 误判简单操作为 PROREADER | 中 | 低 | 多一轮 ProReader 延迟 1-2s，不影响功能 |
| Plugin tool spawn 超时 | 中 | 低 | 60s timeout + 错误信息暴露给 agent |
| Agent 在 L1 仍然不调用 kb_manage search | 中 | 中 | L1 prompt 明确检索流程；tool description 说清楚用途 |

### 6.2 回退

```
A（临时）: 恢复全部进 ProReader，保留工具注册
B（中期）: Triage 只用脚本规则（恢复 triage.ts NPC），agentic 效果不好就退回
C（回退）: 移除 L1 phase，保留工具注册（正向改进不退回）
```

---

## 七、验证用例

### 用例 1: 简单保存

```
输入: "把这个页面保存到知识库 https://example.com/article"

预期 Triage: L1
预期流程:
  1. web_to_markdown(url) → Markdown
  2. save_markdown_note(content=..., title=..., source_url=..., content_type="article")
  3. kb_manage(action="after_capture", vault_path="...")
  4. Agent 确认

验证点:
  - Triage 判 L1 ✓
  - web_to_markdown 可用 ✓
  - save_markdown_note 可用（去重、文件名规范化） ✓
  - kb_manage after_capture 可用 ✓
  - vault 中文件存在 ✓
```

### 用例 2: 深度研究 + 保存

```
Turn 1: "深入研究 Mate 80 影像系统，写报告"
  → Triage: PROREADER
  → ProReader 增强模式: 并行搜索 + 交叉验证 → 展示报告

Turn 2: "保存"
  → Triage: L1（上下文感知）
  → write(vault/articles/xxx.md, content=<报告>)
  → kb_manage(after_capture)
  → Agent 确认

验证点:
  - Turn 2 正确识别为 L1（不是 PROREADER） ✓
  - 报告从 Turn 1 对话历史传递 ✓
```

### 用例 3: 知识库检索（主路径）

```
输入: "知识库里有没有关于 WebGPU 的笔记？"

预期 Triage: L1
预期流程:
  1. kb_manage(action="search", query="WebGPU")
     → FTS5 搜索 kb/claims + kb/topics + kb/entities + kb/sources
     → 按金字塔权重排序
  2. 如果有结果: 展示提炼后的知识声明
  3. 如果无结果: search_vault("WebGPU") 回退
  4. read(path) 读取具体笔记

验证点:
  - 主路径走 kb_manage search ✓
  - FTS5 按 claims > topics > entities > sources 排序 ✓
  - 空结果时回退 search_vault ✓
```

### 用例 4: 快速信息查询

```
输入: "帮我查一下 WebGPU 浏览器支持情况"

预期 Triage: PROREADER（需要外部信息）
预期流程:
  1. proreader(researchDepth 由 ProReader 内部判断)
  2. ProReader 路由: websearch + webfetch
  3. 展示结果

验证点:
  - 判为 PROREADER（不是 L1） ✓
  - ProReader 正常路由 ✓
```

### 用例 5: 文件操作

```
输入: "整理 vault/articles/ 下上周的笔记，按标签分类"

预期 Triage: L1
预期流程:
  1. glob("vault/articles/*.md") → 文件列表
  2. read 读取 → 分析标签 → edit/write 更新
  3. kb_manage(build_fts5) 重建索引

验证点:
  - 判为 L1 ✓
  - 全工具可用 ✓
  - 不经过 ProReader ✓
```

---

*文档版本: v2.1*
*最后更新: 2026-07-05*
*状态: 待执行*
