# ProReader 阶段一：边界固定与 KB 管道完整实现 —— 实施计划

> **对于执行代理：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施。步骤使用 checkbox（`- [ ]`）语法追踪。

**目标：** 将 ProReader 隐式边界显式化、复活 kb_manage 覆盖全 KB 管线、统一 Vault 格式规范、实现 Runtime Validator 基础版。

**架构：** 全部在插件层完成，不碰 OpenCode 核心。新增 `kb_manage.ts`（KB 全管线工具）、`protocol.ts`（ProReader 协议类型）、`validator.ts`（Runtime Validator）、`VAULT_FORMAT.md`（单一格式真相来源）。现有工具和 bash 脚本向后兼容。

**技术栈：** TypeScript, Bun, @opencode-ai/plugin, Node.js fs/crypto, 现有 harness/ bash 管线

## 全局约束

- 所有改动在 `.browser-code/` 和 `packages/research/src/` 下，不修改 `opencode/` 核心
- 不引入新 npm 依赖
- 向后兼容：现有 `write() + bun run kb:after-capture` 工作流继续有效
- 不修改 `harness/` 下任何 bash 管线脚本
- 不修改 `.browser-code/tool/rescue.ts` 和 `search_vault.ts`

---

### 任务 1：创建 VAULT_FORMAT.md —— Vault 格式单一真相来源

**文件：**
- 创建：`docs/superpowers/specs/VAULT_FORMAT.md`

**接口：**
- 产出：`VAULT_FORMAT.md` 文件，供后续任务的 tool description 引用

- [ ] **步骤 1：编写 VAULT_FORMAT.md**

```markdown
# Vault Format Specification

> 单一格式真相来源。所有写入 Vault/KB 的操作以此文件为准。
> 其他文件（save_markdown_note.ts、browser-code.txt、kb/ 模板）应引用本文档对应章节。

---

## 1. Vault Note Frontmatter

每个 vault 笔记必须包含以下 YAML frontmatter：

```yaml
---
title: "笔记标题"
source_url: "https://example.com/article"   # web 模式必填，local 模式用 local://<hash>
date: 2026-07-10                             # YYYY-MM-DD
content_type: article | video | document | snippet | resource
tags: [tag1, tag2]
captured_at: "2026-07-10T12:00:00.000Z"      # ISO 8601
---
```

字段说明：
| 字段 | 必填 | 说明 |
|------|------|------|
| title | 是 | 笔记标题，用于文件名生成 |
| source_url | web 模式必填 | Web 来源 URL，local 模式自动生成为 `local://<sha1前8位>` |
| date | 是 | 捕获日期，YYYY-MM-DD 格式 |
| content_type | 否 | 默认为 article。决定存储子目录 |
| tags | 否 | 标签数组 |
| captured_at | 自动 | ISO 8601 时间戳，由 save_markdown_note 自动生成 |

文件名规则：`{date}__{slugified_title}__{sha1前8位}.md`

---

## 2. KB Source 格式

存储位置：`kb/sources/{date}-{slug}.md`

```markdown
# {标题}

## Metadata
source_type: webpage | video | transcript | document | manual
source_url: {来源 URL}
captured_at: {ISO 8601}
vault_path: vault/articles/{note}.md
status: active

## Summary
{一段话摘要，不超过 200 字}

## Key Points
- {要点 1}
- {要点 2}

## Details
{详细内容，可多段落}

## Related Topics
- [[kb/topics/{topic_slug}]]

## Original Reference
- Vault: vault/articles/{note}.md
```

字段说明：
| 字段 | 必填 | 说明 |
|------|------|------|
| source_type | 是 | 枚举值：webpage, video, transcript, document, manual |
| source_url | 是 | 原始来源 URL |
| captured_at | 是 | ISO 8601 时间戳 |
| vault_path | 是 | 对应的 vault 笔记路径 |
| status | 是 | 枚举值：draft, active, reviewed, stale |

---

## 3. KB Claim 格式

存储位置：`kb/claims/{name}.claims.md`

```markdown
# Claims: {source_title}

## Metadata
source: [[kb/sources/{source_file}]]
source_path: kb/sources/{source_file}.md
status: active
updated_at: {ISO 8601}

## Claims
- [definition] 一个定义性质的原子知识
- [mechanism] 一个机制/原理描述
- [constraint] 一个约束条件
- [comparison] 一个对比关系
- [conclusion] 一个结论
- [open-question] 一个开放问题
- [warning] 一个需要注意的警告
- [procedure] 一个操作步骤
```

Claim 类型枚举（8 种）：
| 类型 | 用途 |
|------|------|
| `[definition]` | 定义/概念解释 |
| `[mechanism]` | 机制/原理 |
| `[constraint]` | 限制/条件/前提 |
| `[comparison]` | 对比/比较 |
| `[conclusion]` | 结论/推论 |
| `[open-question]` | 未解决的开放问题 |
| `[warning]` | 需要注意的风险/陷阱 |
| `[procedure]` | 可操作步骤 |

规则：
- 每条 claim 只表达一个想法
- 通过 source_path 保留来源追溯
- 避免长引用
- 避免无依据的确定性断言
- 区分事实和推断

---

## 4. KB Topic 格式

存储位置：`kb/topics/{slug}.md`

```markdown
# {Topic Title} / {中文主题名}

## 当前定义
{对主题的稳定定义}

## 关键 Claims
<!-- browsercode:managed:start related-claims -->
- [[kb/claims/...]]
<!-- browsercode:managed:end related-claims -->

## 相关来源
<!-- browsercode:managed:start related-sources -->
- [[kb/sources/...]]
<!-- browsercode:managed:end related-sources -->

## 相关实体
<!-- browsercode:managed:start related-entities -->
- [[kb/entities/...]]
<!-- browsercode:managed:end related-entities -->

## 相关主题
- [[kb/topics/...]]

## 待确认问题
-

## 最近更新
- YYYY-MM-DD：初始创建。
```

managed-block 注释区域（`<!-- browsercode:managed:start ... -->` 和 `<!-- browsercode:managed:end ... -->`）由 kb_manage 的 link_topic action 自动管理。agent 不需要手动编辑这些区域。

---

## 5. KB Entity 格式

存储位置：`kb/entities/{slug}.md`

```markdown
# {Entity Name}

## 类型
tool | project | concept | framework | person | organization

## 简介
{一句话简介}

## 相关主题
<!-- browsercode:managed:start related-topics -->
- [[kb/topics/...]]
<!-- browsercode:managed:end related-topics -->

## 相关 Claims
<!-- browsercode:managed:start related-claims -->
- [[kb/claims/...]]
<!-- browsercode:managed:end related-claims -->

## 相关来源
<!-- browsercode:managed:start related-sources -->
- [[kb/sources/...]]
<!-- browsercode:managed:end related-sources -->

## 别名
-
```

managed-block 注释区域由 kb_manage 的 link_entity action 自动管理。

---

## 6. 目录结构总览

```
vault/
├── articles/          # 保存的文章/网页剪辑
├── videos/            # 视频摘要 + 字幕
├── snippets/          # 短文本摘录
├── resources/         # 设计参考 / 其他资源
│   └── design-style/  # 捕获的设计风格
├── documents/         # PDF/DOCX 等文档
└── index/
    └── index.json     # 自动生成的索引

kb/
├── sources/           # 结构化的来源摘要
├── claims/            # 原子知识声明
├── topics/            # 主题聚合页
├── entities/          # 工具/项目/概念/人物实体页
└── queries/           # 查询日志（可选）

index/
└── browsecode.sqlite  # FTS5 全文索引 + processing_queue
```
```

- [ ] **步骤 2：验证文件完整**

```bash
wc -l docs/superpowers/specs/VAULT_FORMAT.md
# 预期：>100 行
```

- [ ] **步骤 3：提交**

```bash
git add docs/superpowers/specs/VAULT_FORMAT.md
git commit -m "docs: add Vault Format Specification as single source of truth"
```

---

### 任务 2：创建 ProReader 协议类型定义

**文件：**
- 创建：`packages/research/src/protocol.ts`
- 修改：`packages/research/src/index.ts`（添加导出）

**接口：**
- 产出：`ProReaderTaskInput`、`ProReaderTaskOutput`、`ProReaderTaskState`、`PROREADER_DEPENDENCIES`
- 消费方：任务 3（kb_manage 引用协议类型）、任务 4（Validator 引用 FailureReason）

- [ ] **步骤 1：创建 protocol.ts**

```typescript
import type {
  AgenticResearchDepth,
  AgenticSaveMode,
  FailureReason,
  ProReaderIntent,
  ProviderId,
} from "./index"

/**
 * ProReader 输入协议
 * 
 * 定义主 Agent 调用 ProReader 时必须提供的字段。
 * 字段来自当前 proreader.ts 的 args 定义，此处为类型级标准化。
 */
export interface ProReaderTaskInput {
  query: string
  intent: ProReaderIntent
  researchDepth: AgenticResearchDepth
  providerBias: ProviderId[]
  needsCandidateReview: boolean
  saveMode: AgenticSaveMode
}

// ── 输出协议 ──

export interface ProReaderTaskOutput {
  /** 执行状态 */
  status: "success" | "partial" | "failed"
  /** 人类可读的执行摘要 */
  summary: string
  /** 生成的文件产物列表 */
  artifacts: ProReaderArtifact[]
  /** 使用的来源列表 */
  sources: ProReaderSource[]
  /** 非阻断警告 */
  warnings: string[]
  /** 未完成的步骤 */
  unfinished: ProReaderUnfinishedItem[]
  /** 建议的下一步操作 */
  suggestedNextAction: string | null
}

export interface ProReaderArtifact {
  type: "markdown" | "source" | "claim" | "topic" | "entity"
  /** vault/ 或 kb/ 下的相对路径 */
  path: string
  title: string
}

export interface ProReaderSource {
  url: string
  title: string
  provider: string
  retrieved: boolean
  failureReason?: FailureReason
}

export interface ProReaderUnfinishedItem {
  step: string
  reason: string
  recommendation: string
}

// ── 任务状态结构 ──

export interface ProReaderTaskState {
  taskId: string
  taskType: string
  goal: string
  stage: "planning" | "searching" | "fetching" | "processing" | "writing" | "complete"
  planVersion: number
  completedSteps: string[]
  pendingSteps: string[]
  artifacts: ProReaderArtifact[]
  toolFailures: Record<string, FailureReason>
  blockingError: string | null
  finalStatus: "running" | "success" | "partial" | "failed"
}

// ── 依赖边界标注（文档级常量，非运行时强制） ──

export const PROREADER_DEPENDENCIES = {
  /** OpenCode Runtime 提供的底层能力 */
  providedByOpenCode: [
    "ToolDefinition / tool() — @opencode-ai/plugin",
    "MCP tool discovery — config/mcp.tools.json → runtime-config.ts",
    "File system access — Node.js fs / path",
    "Session context management — BrowserCodeCoreContext",
    "Plugin tool auto-discovery — OpenCode plugin system",
  ],
  /** ProReader 自身包含的领域逻辑 */
  selfContained: [
    "Input dispatch — dispatchInput()",
    "Route matching — routeQuery()",
    "Provider planning — planProviders() / planProReader()",
    "Execution request building — buildProviderExecutionRequests()",
    "Executable action building — buildProviderExecutableActions()",
    "Step guard instructions — buildStepGuardInstructions()",
    "Failure classification — classifyFailure()",
    "Provider runtime diagnosis — diagnoseProviderRuntime()",
    "Tool exposure synthesis — buildDynamicToolExposure()",
  ],
} as const
```

- [ ] **步骤 2：从 index.ts 导出新类型**

修改 `packages/research/src/index.ts`，在文件末尾的导出区域添加：

```typescript
// 从 index.ts 现有导出之后追加
export {
  type ProReaderTaskInput,
  type ProReaderTaskOutput,
  type ProReaderArtifact,
  type ProReaderSource,
  type ProReaderUnfinishedItem,
  type ProReaderTaskState,
  PROREADER_DEPENDENCIES,
} from "./protocol"
```

**具体操作**：读取 `packages/research/src/index.ts`，找到最后一个 export 语句之后，追加以上内容。

- [ ] **步骤 3：TypeScript 编译检查**

```bash
cd packages/research && npx tsc --noEmit src/protocol.ts 2>&1
# 预期：无错误（可能有已存在的项目级错误，但 protocol.ts 本身无新错误）
```

- [ ] **步骤 4：提交**

```bash
git add packages/research/src/protocol.ts packages/research/src/index.ts
git commit -m "feat: add ProReader protocol types (TaskInput, TaskOutput, TaskState, dependencies)"
```

---

### 任务 3：创建 Runtime Validator

**文件：**
- 创建：`packages/research/src/validator.ts`
- 修改：`packages/research/src/index.ts`（添加导出）

**接口：**
- 产出：`ValidationResult`、`ValidationIssue`、`validateKbPipeline()`、`VALIDATION_CODES`
- 消费方：任务 4（kb_manage.after_capture 内部使用）

- [ ] **步骤 1：创建 validator.ts**

```typescript
/**
 * Runtime Validator — 基础版
 * 
 * 设计原则：
 * - 硬阻断：检查"该做的有没有做"（不是"够不够好"）
 * - 软警告：提示但不阻断
 * - 不评判质量：文章写得好不好是模型的事，Validator 不管
 */

// ── 验证结果类型 ──

export interface ValidationIssue {
  /** 错误码，如 "MISSING_REQUIRED_SOURCE" */
  code: string
  /** 人类可读的描述 */
  message: string
  /** 具体哪个文件/步骤/来源 */
  detail: string
}

export interface ValidationResult {
  /** 硬阻断问题列表。任何一条存在 → 任务未完成 */
  hardBlocks: ValidationIssue[]
  /** 软警告列表。不阻塞完成但需要报告 */
  softWarnings: ValidationIssue[]
  /** hardBlocks.length === 0 */
  passed: boolean
}

// ── 验证码常量 ──

export const VALIDATION_CODES = {
  // 硬阻断
  MISSING_REQUIRED_SOURCE: "MISSING_REQUIRED_SOURCE",
  EMPTY_PARSE_RESULT: "EMPTY_PARSE_RESULT",
  FILE_NOT_WRITTEN: "FILE_NOT_WRITTEN",
  UNRESOLVED_BLOCKING_ERROR: "UNRESOLVED_BLOCKING_ERROR",
  KB_PIPELINE_INCOMPLETE: "KB_PIPELINE_INCOMPLETE",
  // 软警告
  PARTIAL_SOURCES: "PARTIAL_SOURCES",
  OPTIONAL_STEP_SKIPPED: "OPTIONAL_STEP_SKIPPED",
  LOW_QUALITY_CONTENT: "LOW_QUALITY_CONTENT",
} as const

// ── 验证函数 ──

/**
 * 验证 KB 管线的完成状态。
 * 
 * @param pipelineResult — after_capture 的 process-queue 输出
 * @param context — 附加上下文（已获取来源数、预期来源数等）
 */
export function validateKbPipeline(
  pipelineResult: {
    step: number
    status: string
    errors: string[]
  },
  context?: {
    totalSources?: number
    retrievedSources?: number
    expectedOutputFiles?: string[]
    actualOutputFiles?: string[]
    blockingErrors?: string[]
  },
): ValidationResult {
  const hardBlocks: ValidationIssue[] = []
  const softWarnings: ValidationIssue[] = []

  // 硬阻断 1：KB 管线未完成
  if (pipelineResult.step < 4 || pipelineResult.status !== "done") {
    hardBlocks.push({
      code: VALIDATION_CODES.KB_PIPELINE_INCOMPLETE,
      message: `KB 管线未完成：当前步骤 ${pipelineResult.step}/4，状态 ${pipelineResult.status}`,
      detail: pipelineResult.errors.join("; ") || "未提供错误详情",
    })
  }

  // 硬阻断 2：预期的输出文件不存在
  if (context?.expectedOutputFiles && context?.actualOutputFiles) {
    const missing = context.expectedOutputFiles.filter(
      (f) => !context.actualOutputFiles!.includes(f),
    )
    for (const file of missing) {
      hardBlocks.push({
        code: VALIDATION_CODES.FILE_NOT_WRITTEN,
        message: `预期输出文件不存在: ${file}`,
        detail: `文件 ${file} 在预期列表中但未在实际输出中找到`,
      })
    }
  }

  // 硬阻断 3：未处理的阻断错误
  if (context?.blockingErrors && context.blockingErrors.length > 0) {
    for (const err of context.blockingErrors) {
      hardBlocks.push({
        code: VALIDATION_CODES.UNRESOLVED_BLOCKING_ERROR,
        message: `未处理的阻断错误: ${err}`,
        detail: err,
      })
    }
  }

  // 硬阻断 4：内容为空
  if (pipelineResult.step < 1) {
    hardBlocks.push({
      code: VALIDATION_CODES.EMPTY_PARSE_RESULT,
      message: "KB source 文件未创建（step < 1），内容解析可能返回空壳",
      detail: "process-queue 未能推进到 source_done 阶段",
    })
  }

  // 软警告 1：部分来源未获取
  if (context?.totalSources && context?.retrievedSources !== undefined) {
    if (context.retrievedSources < context.totalSources) {
      softWarnings.push({
        code: VALIDATION_CODES.PARTIAL_SOURCES,
        message: `只获取了 ${context.retrievedSources}/${context.totalSources} 个来源`,
        detail: `${context.totalSources - context.retrievedSources} 个来源未成功获取`,
      })
    }
  }

  return {
    hardBlocks,
    softWarnings,
    passed: hardBlocks.length === 0,
  }
}

/**
 * 从 process-queue 的文本输出中解析管线状态。
 * process-queue 输出包含 "step X" 和状态标记行。
 */
export function parsePipelineStatus(output: string): {
  step: number
  status: string
  errors: string[]
} {
  const errors: string[] = []
  let step = 0
  let status = "unknown"

  // 解析 step
  const stepMatch = output.match(/step[:\s]*(\d)/i)
  if (stepMatch) {
    step = parseInt(stepMatch[1], 10)
  }

  // 解析状态
  if (output.includes("done") || output.includes("✅")) {
    status = "done"
  } else if (output.includes("failed") || output.includes("❌")) {
    status = "failed"
  } else if (output.includes("⏳")) {
    status = "pending"
  } else if (output.includes("source_done")) {
    status = "source_done"
    step = Math.max(step, 1)
  } else if (output.includes("claims_done")) {
    status = "claims_done"
    step = Math.max(step, 2)
  }

  // 收集错误行
  for (const line of output.split("\n")) {
    if (line.includes("❌") || line.includes("error") || line.includes("failed")) {
      errors.push(line.trim())
    }
  }

  return { step, status, errors }
}
```

- [ ] **步骤 2：从 index.ts 导出 validator**

修改 `packages/research/src/index.ts`，在导出区域添加：

```typescript
export {
  type ValidationResult,
  type ValidationIssue,
  validateKbPipeline,
  parsePipelineStatus,
  VALIDATION_CODES,
} from "./validator"
```

- [ ] **步骤 3：TypeScript 编译检查**

```bash
cd packages/research && npx tsc --noEmit src/validator.ts 2>&1
```

- [ ] **步骤 4：提交**

```bash
git add packages/research/src/validator.ts packages/research/src/index.ts
git commit -m "feat: add Runtime Validator with hard-block checks and soft warnings"
```

---

### 任务 4：创建 kb_manage 工具（核心交付件 —— 第 1 部分：类型与辅助函数）

**文件：**
- 创建：`.browser-code/tool/kb_manage.ts`

**接口：**
- 产出：`kb_manage` tool definition
- 依赖：任务 3 的 `validateKbPipeline`、`parsePipelineStatus`
- 消费方：任务 5（写入 action 实现）、任务 6（读取 action 实现 + 完整集成）

- [ ] **步骤 1：创建工具骨架、类型定义和辅助函数**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { tool, type ToolDefinition } from "../../opencode/node_modules/@opencode-ai/plugin/src/index"
import { validateKbPipeline, parsePipelineStatus } from "../../packages/research/src/validator"

// ── 常量 ──

const KB_DIR = join(process.cwd(), "kb")
const SOURCES_DIR = join(KB_DIR, "sources")
const CLAIMS_DIR = join(KB_DIR, "claims")
const TOPICS_DIR = join(KB_DIR, "topics")
const ENTITIES_DIR = join(KB_DIR, "entities")

const SOURCE_TYPES = ["webpage", "video", "transcript", "document", "manual"] as const
const SOURCE_STATUSES = ["draft", "active", "reviewed", "stale"] as const
const CLAIM_TYPES = [
  "definition", "mechanism", "constraint", "comparison",
  "conclusion", "open-question", "warning", "procedure",
] as const
const ENTITY_TYPES = ["tool", "project", "concept", "framework", "person", "organization"] as const

type SourceType = typeof SOURCE_TYPES[number]
type ClaimType = typeof CLAIM_TYPES[number]
type EntityType = typeof ENTITY_TYPES[number]

// ── 辅助函数 ──

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

function shortHash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 8)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoNow(): string {
  return new Date().toISOString()
}

/**
 * 安全写入文件，自动创建父目录。
 */
function safeWrite(filePath: string, content: string): void {
  const dir = filePath.split("/").slice(0, -1).join("/")
  // Windows 兼容：处理反斜杠
  const normalizedDir = dir.replace(/\//g, "\\")
  mkdirSync(normalizedDir, { recursive: true })
  writeFileSync(filePath, content, "utf8")
}

/**
 * 在 managed-block 区域内注入引用列表。
 * managed-block 格式：
 *   <!-- browsercode:managed:start block-name -->
 *   - 旧内容（将被替换）
 *   <!-- browsercode:managed:end block-name -->
 */
function updateManagedBlocks(
  existingContent: string,
  blockUpdates: Record<string, string[]>,
): string {
  let content = existingContent

  for (const [blockName, items] of Object.entries(blockUpdates)) {
    const startMarker = `<!-- browsercode:managed:start ${blockName} -->`
    const endMarker = `<!-- browsercode:managed:end ${blockName} -->`

    const startIdx = content.indexOf(startMarker)
    const endIdx = content.indexOf(endMarker)

    if (startIdx === -1 || endIdx === -1) {
      // 没有 managed-block → 不修改（避免破坏文件结构）
      continue
    }

    const before = content.slice(0, startIdx + startMarker.length)
    const after = content.slice(endIdx)
    const itemLines = items.length > 0
      ? "\n" + items.map((item) => `- ${item}`).join("\n") + "\n"
      : "\n"

    content = before + itemLines + after
  }

  return content
}

/**
 * 执行 shell 命令并返回 stdout。
 */
async function execCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

// ── Action 参数类型 ──

interface SaveSourceArgs {
  title: string
  source_url: string
  source_type: SourceType
  summary: string
  key_points: string[]
  details?: string
  related_topics?: string[]
  vault_path: string
}

interface SaveClaimsArgs {
  source_file: string   // 如 "kb/sources/2026-07-10-some-title.md"
  claims: Array<{
    type: ClaimType
    text: string
  }>
}

interface LinkTopicArgs {
  topic_name: string
  topic_name_zh?: string
  definition?: string
  related_claims?: string[]
  related_sources?: string[]
  related_entities?: string[]
}

interface LinkEntityArgs {
  entity_name: string
  entity_type: EntityType
  description?: string
  related_topics?: string[]
  related_claims?: string[]
  related_sources?: string[]
  aliases?: string[]
}
```

- [ ] **步骤 2：TypeScript 编译检查类型部分**

```bash
cd .browser-code && npx tsc --noEmit tool/kb_manage.ts 2>&1
# 注意：可能有已有项目的编译错误，但 kb_manage 的类型定义本身应正确
```

- [ ] **步骤 3：提交**

```bash
git add .browser-code/tool/kb_manage.ts
git commit -m "feat(kb_manage): add tool skeleton, types, and helper functions"
```

---

### 任务 5：kb_manage 写入 action 实现

**文件：**
- 修改：`.browser-code/tool/kb_manage.ts`（追加写入 action 实现）

**接口：**
- 实现：`handleSaveSource()`、`handleSaveClaims()`、`handleLinkTopic()`、`handleLinkEntity()`
- 依赖：任务 4 的辅助函数

- [ ] **步骤 1：实现 handleSaveSource**

在 `kb_manage.ts` 的辅助函数区域之后，添加：

```typescript
/**
 * 创建 kb/sources/{date}-{slug}.md
 * 格式由代码保证，agent 不需要知道模板细节。
 */
function handleSaveSource(args: SaveSourceArgs): {
  filePath: string
  created: boolean
} {
  const date = todayStr()
  const slug = slugify(args.title)
  const hash = shortHash(args.title + args.source_url)
  const filename = `${date}-${slug}.md`
  const filePath = join(SOURCES_DIR, filename)

  // 幂等：如果已存在同路径文件，返回现有路径
  if (existsSync(filePath)) {
    return { filePath: `kb/sources/${filename}`, created: false }
  }

  const relatedTopics = (args.related_topics ?? [])
    .map((t) => `- [[kb/topics/${t}]]`)
    .join("\n")

  const keyPoints = args.key_points
    .map((p) => `- ${p}`)
    .join("\n")

  const content = [
    `# ${args.title}`,
    "",
    "## Metadata",
    `source_type: ${args.source_type}`,
    `source_url: ${args.source_url}`,
    `captured_at: ${isoNow()}`,
    `vault_path: ${args.vault_path}`,
    "status: active",
    "",
    "## Summary",
    args.summary,
    "",
    "## Key Points",
    keyPoints,
    "",
    "## Details",
    args.details || args.summary,
    "",
    "## Related Topics",
    relatedTopics || "(none)",
    "",
    "## Original Reference",
    `- Vault: ${args.vault_path}`,
  ].join("\n")

  safeWrite(filePath, content)
  return { filePath: `kb/sources/${filename}`, created: true }
}

/**
 * 创建 kb/claims/{name}.claims.md
 * claim type 由 enum 约束，格式由代码保证。
 */
function handleSaveClaims(args: SaveClaimsArgs): {
  filePath: string
  claimCount: number
  created: boolean
} {
  // 从 source_file 推导 claims 文件名
  // "kb/sources/2026-07-10-some-title.md" → "2026-07-10-some-title.claims.md"
  const sourceName = args.source_file
    .replace(/^kb\/sources\//, "")
    .replace(/\.md$/, "")
  const sourceTitle = sourceName
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-/g, " ")

  const filename = `${sourceName}.claims.md`
  const filePath = join(CLAIMS_DIR, filename)

  if (existsSync(filePath)) {
    return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, created: false }
  }

  // 验证 claim type
  for (const claim of args.claims) {
    if (!CLAIM_TYPES.includes(claim.type)) {
      throw new Error(
        `无效的 claim type: "${claim.type}"。有效值：${CLAIM_TYPES.join(", ")}`,
      )
    }
  }

  const claimLines = args.claims
    .map((c) => `- [${c.type}] ${c.text}`)
    .join("\n")

  const content = [
    `# Claims: ${sourceTitle}`,
    "",
    "## Metadata",
    `source: [[${args.source_file.replace(/\.md$/, "")}]]`,
    `source_path: ${args.source_file}`,
    "status: active",
    `updated_at: ${isoNow()}`,
    "",
    "## Claims",
    claimLines,
  ].join("\n")

  safeWrite(filePath, content)
  return { filePath: `kb/claims/${filename}`, claimCount: args.claims.length, created: true }
}

/**
 * 创建或更新 kb/topics/{slug}.md
 * 新 topic：从模板创建
 * 已有 topic：更新 managed-block 区域
 */
function handleLinkTopic(args: LinkTopicArgs): {
  filePath: string
  created: boolean
  updated: boolean
} {
  const slug = slugify(args.topic_name)
  const filename = `${slug}.md`
  const filePath = join(TOPICS_DIR, filename)
  const exists = existsSync(filePath)

  if (!exists) {
    // 创建新 topic 文件
    const relatedClaims = (args.related_claims ?? [])
      .map((c) => `- [[${c}]]`)
      .join("\n")
    const relatedSources = (args.related_sources ?? [])
      .map((s) => `- [[${s}]]`)
      .join("\n")
    const relatedEntities = (args.related_entities ?? [])
      .map((e) => `- [[${e}]]`)
      .join("\n")

    const content = [
      `# ${args.topic_name}${args.topic_name_zh ? ` / ${args.topic_name_zh}` : ""}`,
      "",
      "## 当前定义",
      args.definition || "",
      "",
      "## 关键 Claims",
      "<!-- browsercode:managed:start related-claims -->",
      relatedClaims,
      "<!-- browsercode:managed:end related-claims -->",
      "",
      "## 相关来源",
      "<!-- browsercode:managed:start related-sources -->",
      relatedSources,
      "<!-- browsercode:managed:end related-sources -->",
      "",
      "## 相关实体",
      "<!-- browsercode:managed:start related-entities -->",
      relatedEntities,
      "<!-- browsercode:managed:end related-entities -->",
      "",
      "## 相关主题",
      "",
      "## 待确认问题",
      "-",
      "",
      "## 最近更新",
      `- ${todayStr()}：初始创建。`,
    ].join("\n")

    safeWrite(filePath, content)
    return { filePath: `kb/topics/${filename}`, created: true, updated: false }
  }

  // 更新已有 topic 的 managed-block 区域
  const existingContent = readFileSync(filePath, "utf8")
  const blockUpdates: Record<string, string[]> = {}

  if (args.related_claims) {
    blockUpdates["related-claims"] = args.related_claims.map((c) => `[[${c}]]`)
  }
  if (args.related_sources) {
    blockUpdates["related-sources"] = args.related_sources.map((s) => `[[${s}]]`)
  }
  if (args.related_entities) {
    blockUpdates["related-entities"] = args.related_entities.map((e) => `[[${e}]]`)
  }

  if (Object.keys(blockUpdates).length === 0) {
    return { filePath: `kb/topics/${filename}`, created: false, updated: false }
  }

  const updatedContent = updateManagedBlocks(existingContent, blockUpdates)
  writeFileSync(filePath, updatedContent, "utf8")
  return { filePath: `kb/topics/${filename}`, created: false, updated: true }
}

/**
 * 创建或更新 kb/entities/{slug}.md
 */
function handleLinkEntity(args: LinkEntityArgs): {
  filePath: string
  created: boolean
  updated: boolean
} {
  const slug = slugify(args.entity_name)
  const filename = `${slug}.md`
  const filePath = join(ENTITIES_DIR, filename)
  const exists = existsSync(filePath)

  if (!exists) {
    const relatedTopics = (args.related_topics ?? [])
      .map((t) => `- [[${t}]]`)
      .join("\n")
    const relatedClaims = (args.related_claims ?? [])
      .map((c) => `- [[${c}]]`)
      .join("\n")
    const relatedSources = (args.related_sources ?? [])
      .map((s) => `- [[${s}]]`)
      .join("\n")
    const aliases = (args.aliases ?? []).length > 0
      ? args.aliases!.join(", ")
      : "-"

    const content = [
      `# ${args.entity_name}`,
      "",
      "## 类型",
      args.entity_type,
      "",
      "## 简介",
      args.description || "",
      "",
      "## 相关主题",
      "<!-- browsercode:managed:start related-topics -->",
      relatedTopics,
      "<!-- browsercode:managed:end related-topics -->",
      "",
      "## 相关 Claims",
      "<!-- browsercode:managed:start related-claims -->",
      relatedClaims,
      "<!-- browsercode:managed:end related-claims -->",
      "",
      "## 相关来源",
      "<!-- browsercode:managed:start related-sources -->",
      relatedSources,
      "<!-- browsercode:managed:end related-sources -->",
      "",
      "## 别名",
      aliases,
    ].join("\n")

    safeWrite(filePath, content)
    return { filePath: `kb/entities/${filename}`, created: true, updated: false }
  }

  // 更新已有 entity
  const existingContent = readFileSync(filePath, "utf8")
  const blockUpdates: Record<string, string[]> = {}

  if (args.related_topics) {
    blockUpdates["related-topics"] = args.related_topics.map((t) => `[[${t}]]`)
  }
  if (args.related_claims) {
    blockUpdates["related-claims"] = args.related_claims.map((c) => `[[${c}]]`)
  }
  if (args.related_sources) {
    blockUpdates["related-sources"] = args.related_sources.map((s) => `[[${s}]]`)
  }

  if (Object.keys(blockUpdates).length === 0) {
    return { filePath: `kb/entities/${filename}`, created: false, updated: false }
  }

  const updatedContent = updateManagedBlocks(existingContent, blockUpdates)
  writeFileSync(filePath, updatedContent, "utf8")
  return { filePath: `kb/entities/${filename}`, created: false, updated: true }
}
```

- [ ] **步骤 2：TypeScript 编译检查**

```bash
cd .browser-code && npx tsc --noEmit tool/kb_manage.ts 2>&1
```

- [ ] **步骤 3：提交**

```bash
git add .browser-code/tool/kb_manage.ts
git commit -m "feat(kb_manage): implement write actions (save_source, save_claims, link_topic, link_entity)"
```

---

### 任务 6：kb_manage 管线 + 读取 action 实现，并完成完整工具注册

**文件：**
- 修改：`.browser-code/tool/kb_manage.ts`（追加管线 + 读取 action，完成 execute 函数）

**接口：**
- 实现：`handleAfterCapture()`、`handleSearch()`、`handleContext()`
- 完成：完整的 `kbManageTool` 导出

- [ ] **步骤 1：实现管线 + 读取 action**

在 `kb_manage.ts` 末尾追加：

```typescript
/**
 * 执行 KB 管线：enqueue → process-queue → rebuild FTS5
 * 内部调用 `bun run kb:after-capture`，透传 stdout/stderr。
 * 执行完毕后运行 Validator。
 */
async function handleAfterCapture(vaultPath: string): Promise<{
  pipeline: {
    enqueued: boolean
    step: number
    status: string
    output: string
    errors: string[]
  }
  validation: {
    passed: boolean
    hardBlocks: Array<{ code: string; message: string; detail: string }>
    softWarnings: Array<{ code: string; message: string; detail: string }>
  }
}> {
  // 1. enqueue
  const enqueueResult = await execCommand("bun", [
    "run", "harness/enqueue.ts", vaultPath,
  ])

  // 2. process-queue（可能多次执行直到 stable）
  let processOutput = ""
  let lastOutput = ""
  let attempts = 0
  const maxAttempts = 5

  do {
    lastOutput = processOutput
    const result = await execCommand("bun", [
      "run", "harness/process-queue.ts",
    ])
    processOutput = result.stdout + result.stderr
    attempts++
  } while (processOutput !== lastOutput && attempts < maxAttempts)

  // 3. 解析管线状态
  const pipelineStatus = parsePipelineStatus(processOutput)

  // 4. 运行 Validator
  const validation = validateKbPipeline(pipelineStatus)

  return {
    pipeline: {
      enqueued: enqueueResult.exitCode === 0,
      step: pipelineStatus.step,
      status: pipelineStatus.status,
      output: processOutput.slice(0, 2000), // 截断输出以避免过大的返回值
      errors: pipelineStatus.errors.slice(0, 10),
    },
    validation: {
      passed: validation.passed,
      hardBlocks: validation.hardBlocks,
      softWarnings: validation.softWarnings,
    },
  }
}

/**
 * FTS5 搜索 kb/claims + kb/topics + kb/entities + kb/sources
 */
async function handleSearch(query: string): Promise<{
  results: string
  resultCount: number
}> {
  const result = await execCommand("bun", [
    "run", "harness/search.ts", query,
  ])
  // 统计结果行数（每行一个结果）
  const lines = result.stdout.split("\n").filter((l) => l.trim())
  return {
    results: result.stdout.slice(0, 3000),
    resultCount: lines.length,
  }
}

/**
 * 生成结构化回答上下文
 */
async function handleContext(query: string): Promise<{
  outputPath: string
  output: string
}> {
  const result = await execCommand("bun", [
    "run", "harness/make_answer_context.ts", query,
  ])

  // 读取生成的 .tmp/answer_context.md
  const contextPath = join(process.cwd(), ".tmp", "answer_context.md")
  let contextContent = ""
  if (existsSync(contextPath)) {
    contextContent = readFileSync(contextPath, "utf8").slice(0, 5000)
  }

  return {
    outputPath: ".tmp/answer_context.md",
    output: contextContent || result.stdout.slice(0, 3000),
  }
}
```

- [ ] **步骤 2：完成完整 tool definition 和 execute 函数**

在 `kb_manage.ts` 末尾追加完整的 tool 定义：

```typescript
// ── 完整 Tool Definition ──

const kbManageTool: ToolDefinition = tool({
  description: `Knowledge base manager. Full pipeline: write → index → search.

## Actions

### Write side
- **save_source**: Create kb/sources/{date}-{slug}.md with standard template.
  Params: title, source_url, source_type (webpage|video|transcript|document|manual),
          summary, key_points[], details?, related_topics[]?, vault_path
- **save_claims**: Create kb/claims/{name}.claims.md with standard claim format.
  Params: source_file ("kb/sources/xxx.md"), claims[{type, text}]
  Claim types: definition, mechanism, constraint, comparison, conclusion, open-question, warning, procedure
- **link_topic**: Create or update kb/topics/{slug}.md. New topics created from template;
  existing topics updated via managed-block regions.
  Params: topic_name, topic_name_zh?, definition?, related_claims[]?, related_sources[]?, related_entities[]?
- **link_entity**: Create or update kb/entities/{slug}.md. 
  Params: entity_name, entity_type (tool|project|concept|framework|person|organization),
          description?, related_topics[]?, related_claims[]?, related_sources[]?, aliases[]?

### Pipeline side
- **after_capture**: Enqueue → process-queue → rebuild FTS5 index.
  Params: vault_path ("vault/articles/xxx.md")
  Returns validation result (hard blocks + soft warnings).

### Read side
- **search**: FTS5 search across kb/claims(w3)+topics(w2)+entities(w1)+sources(w0).
  Params: query
- **context**: Generate structured answer context (Claims→Topics→Entities→Sources).
  Params: query

Format reference: docs/superpowers/specs/VAULT_FORMAT.md`,
  args: {
    action: tool.schema
      .enum([
        "save_source", "save_claims", "link_topic", "link_entity",
        "after_capture", "search", "context",
      ])
      .describe("KB action to execute."),

    // ── save_source 参数 ──
    title: tool.schema.string().optional()
      .describe("(save_source) Source title."),
    source_url: tool.schema.string().optional()
      .describe("(save_source) Original source URL."),
    source_type: tool.schema
      .enum(["webpage", "video", "transcript", "document", "manual"])
      .optional()
      .describe("(save_source) Source type."),
    summary: tool.schema.string().optional()
      .describe("(save_source) One-paragraph summary (max ~200 chars)."),
    key_points: tool.schema.array(tool.schema.string()).optional()
      .describe("(save_source) Key points list."),
    details: tool.schema.string().optional()
      .describe("(save_source) Detailed content (optional)."),
    related_topics: tool.schema.array(tool.schema.string()).optional()
      .describe("(save_source / link_topic / link_entity) Related topic slugs."),
    vault_path: tool.schema.string().optional()
      .describe("(save_source / after_capture) Vault note path, e.g. vault/articles/xxx.md."),

    // ── save_claims 参数 ──
    source_file: tool.schema.string().optional()
      .describe("(save_claims) Path to kb/sources file, e.g. kb/sources/2026-07-10-title.md."),
    claims: tool.schema
      .array(tool.schema.object({
        type: tool.schema.enum([
          "definition", "mechanism", "constraint", "comparison",
          "conclusion", "open-question", "warning", "procedure",
        ]),
        text: tool.schema.string(),
      }))
      .optional()
      .describe("(save_claims) Array of {type, text} claim objects."),

    // ── link_topic 参数 ──
    topic_name: tool.schema.string().optional()
      .describe("(link_topic) Topic name in English."),
    topic_name_zh: tool.schema.string().optional()
      .describe("(link_topic) Topic name in Chinese."),
    definition: tool.schema.string().optional()
      .describe("(link_topic) Topic definition (for new topics)."),

    // ── link_entity 参数 ──
    entity_name: tool.schema.string().optional()
      .describe("(link_entity) Entity name."),
    entity_type: tool.schema
      .enum(["tool", "project", "concept", "framework", "person", "organization"])
      .optional()
      .describe("(link_entity) Entity type."),
    description: tool.schema.string().optional()
      .describe("(link_entity) Entity description."),
    aliases: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_entity) Alternative names."),

    // ── 共享参数 ──
    related_claims: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_topic / link_entity) Related claim paths, e.g. kb/claims/xxx.claims."),
    related_sources: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_topic / link_entity) Related source paths, e.g. kb/sources/xxx."),
    related_entities: tool.schema.array(tool.schema.string()).optional()
      .describe("(link_topic) Related entity paths, e.g. kb/entities/xxx."),

    // ── 读取参数 ──
    query: tool.schema.string().optional()
      .describe("(search / context) Search query string."),
  },
  async execute(args) {
    const action = args.action as string

    switch (action) {
      case "save_source": {
        if (!args.title || !args.source_url || !args.source_type || !args.summary || !args.key_points || !args.vault_path) {
          throw new Error("save_source requires: title, source_url, source_type, summary, key_points, vault_path")
        }
        const result = handleSaveSource({
          title: args.title as string,
          source_url: args.source_url as string,
          source_type: args.source_type as SourceType,
          summary: args.summary as string,
          key_points: args.key_points as string[],
          details: args.details as string | undefined,
          related_topics: args.related_topics as string[] | undefined,
          vault_path: args.vault_path as string,
        })
        return JSON.stringify(result, null, 2)
      }

      case "save_claims": {
        if (!args.source_file || !args.claims) {
          throw new Error("save_claims requires: source_file, claims")
        }
        const result = handleSaveClaims({
          source_file: args.source_file as string,
          claims: args.claims as Array<{ type: ClaimType; text: string }>,
        })
        return JSON.stringify(result, null, 2)
      }

      case "link_topic": {
        if (!args.topic_name) {
          throw new Error("link_topic requires: topic_name")
        }
        const result = handleLinkTopic({
          topic_name: args.topic_name as string,
          topic_name_zh: args.topic_name_zh as string | undefined,
          definition: args.definition as string | undefined,
          related_claims: args.related_claims as string[] | undefined,
          related_sources: args.related_sources as string[] | undefined,
          related_entities: args.related_entities as string[] | undefined,
        })
        return JSON.stringify(result, null, 2)
      }

      case "link_entity": {
        if (!args.entity_name || !args.entity_type) {
          throw new Error("link_entity requires: entity_name, entity_type")
        }
        const result = handleLinkEntity({
          entity_name: args.entity_name as string,
          entity_type: args.entity_type as EntityType,
          description: args.description as string | undefined,
          related_topics: args.related_topics as string[] | undefined,
          related_claims: args.related_claims as string[] | undefined,
          related_sources: args.related_sources as string[] | undefined,
          aliases: args.aliases as string[] | undefined,
        })
        return JSON.stringify(result, null, 2)
      }

      case "after_capture": {
        if (!args.vault_path) {
          throw new Error("after_capture requires: vault_path")
        }
        const result = await handleAfterCapture(args.vault_path as string)
        return JSON.stringify(result, null, 2)
      }

      case "search": {
        if (!args.query) {
          throw new Error("search requires: query")
        }
        const result = await handleSearch(args.query as string)
        return JSON.stringify(result, null, 2)
      }

      case "context": {
        if (!args.query) {
          throw new Error("context requires: query")
        }
        const result = await handleContext(args.query as string)
        return JSON.stringify(result, null, 2)
      }

      default:
        throw new Error(`Unknown kb_manage action: ${action}`)
    }
  },
})

export default kbManageTool
```

- [ ] **步骤 3：TypeScript 编译检查**

```bash
cd .browser-code && npx tsc --noEmit tool/kb_manage.ts 2>&1
```

- [ ] **步骤 4：提交**

```bash
git add .browser-code/tool/kb_manage.ts
git commit -m "feat(kb_manage): implement pipeline + read actions, complete tool definition"
```

---

### 任务 7：更新 browser-code.txt prompt 和 core-context.ts

**文件：**
- 修改：`opencode/packages/opencode/src/session/prompt/browser-code.txt`
- 修改：`opencode/packages/opencode/src/browser-code/core-context.ts`

**接口：**
- 产出：prompt 中引用 kb_manage 工具、VAULT_FORMAT.md
- 保持向后兼容：保留现有 bash 命令引用

- [ ] **步骤 1：更新 browser-code.txt 的 KB 管理段**

读取 `opencode/packages/opencode/src/session/prompt/browser-code.txt`，定位到 `# Post-Save Knowledge Base Management` 段（约第 56-62 行），替换为：

```markdown
# Post-Save Knowledge Base Management
After saving a note to vault/, complete the KB pipeline using kb_manage:

**Primary path (standardized, recommended):**
1. `kb_manage({ action: "save_source", title, source_url, source_type, summary, key_points, details?, related_topics?, vault_path })` — creates kb/sources/{date}-{slug}.md with standard template. Format is code-guaranteed.
2. `kb_manage({ action: "save_claims", source_file: "kb/sources/xxx.md", claims: [{type: "definition", text: "..."}, ...] })` — creates kb/claims/{name}.claims.md. Claim types: definition, mechanism, constraint, comparison, conclusion, open-question, warning, procedure.
3. If new topics or entities emerge, use `kb_manage({ action: "link_topic", ... })` or `kb_manage({ action: "link_entity", ... })` to create/update cross-reference pages.
4. `kb_manage({ action: "after_capture", vault_path: "vault/.../xxx.md" })` — enqueue → process-queue → rebuild FTS5 index. Returns validation result with hard blocks + soft warnings.

**Fallback path (manual, for edge cases):**
- `write("kb/sources/<name>.md", ...)` + `write("kb/claims/<name>.claims.md", ...)` + `bash: bun run kb:after-capture vault/.../xxx.md`
- Only use when kb_manage's structured input doesn't fit the content shape.

Format reference: docs/superpowers/specs/VAULT_FORMAT.md

# KB Retrieval
1. **Primary**: `kb_manage({ action: "search", query: "..." })` — FTS5 search
2. **Context**: `kb_manage({ action: "context", query: "..." })` — structured answer_context
3. **Fallback**: `search_vault` — raw vault tag index (only when search returns nothing)
```

- [ ] **步骤 2：更新 core-context.ts 的 L1 描述**

读取 `opencode/packages/opencode/src/browser-code/core-context.ts`，找到第 138-145 行（L1 direct 段的 KB 管理描述），替换为：

```typescript
      "KB retrieval priority:",
      "  Primary: kb_manage({ action: \"search\", query: \"...\" }) → FTS5 over kb/claims(w3)+topics(w2)+entities(w1)+sources(w0)",
      "  Context: kb_manage({ action: \"context\", query: \"...\" }) → structured answer_context",
      "  Fallback: search_vault → raw vault tag index (only when search returns nothing)",
      "",
      "Save flow: web_to_markdown(url) → save_markdown_note(...) or write(...) → kb_manage({ action: \"after_capture\", vault_path: \"...\" })",
      "",
      "KB writing: kb_manage({ action: \"save_source\", ... }) / kb_manage({ action: \"save_claims\", ... }) / kb_manage({ action: \"link_topic\", ... }) / kb_manage({ action: \"link_entity\", ... })",
```

- [ ] **步骤 3：提交**

```bash
git add opencode/packages/opencode/src/session/prompt/browser-code.txt opencode/packages/opencode/src/browser-code/core-context.ts
git commit -m "docs: update KB management prompt to use kb_manage as primary path"
```

---

### 任务 8：标注 enhanced-research.ts + 更新 save_markdown_note 引用

**文件：**
- 修改：`packages/research/src/enhanced-research.ts`
- 修改：`.browser-code/tool/save_markdown_note.ts`

- [ ] **步骤 1：在 enhanced-research.ts 顶部添加阶段二对齐标注**

读取 `packages/research/src/enhanced-research.ts`，在文件顶部（第 1 行之前）插入：

```typescript
/**
 * ⚠️ 阶段二对齐标注
 *
 * 当前实现通过关键词触发"enhanced research"模式并生成 subagent plan。
 * 这与 OpenCode task 子代理机制（参见 ProReader 转型纲领 Section 7）不一致。
 *
 * 阶段二（独立上下文与状态）将利用 OpenCode 原生 task 工具替代此处的
 * 关键词检测 + subagent plan 生成逻辑。当前保留但不再扩展。
 *
 * 决策日期：2026-07-10
 * 计划对齐：阶段二
 */
```

- [ ] **步骤 2：更新 save_markdown_note 的 tool description 引用**

读取 `.browser-code/tool/save_markdown_note.ts`，在 description 末尾（"After saving, complete the KB pipeline:" 段之后）添加对 kb_manage 和 VAULT_FORMAT.md 的引用。找到第 50-54 行：

```typescript
// 将 description 中的 KB pipeline 段替换为：
// After saving, complete the KB pipeline:
// 1. kb_manage({ action: "save_source", title, source_url, source_type, summary, key_points, vault_path })
// 2. kb_manage({ action: "save_claims", source_file: "kb/sources/xxx.md", claims: [...] })
// 3. kb_manage({ action: "link_topic", topic_name, ... }) / kb_manage({ action: "link_entity", entity_name, ... }) (optional)
// 4. kb_manage({ action: "after_capture", vault_path: "vault/.../xxx.md" })
//
// Format reference: docs/superpowers/specs/VAULT_FORMAT.md
```

**具体实现**：使用 Edit 工具修改 save_markdown_note.ts 的 description 字符串，将原来的 4 行 KB pipeline 步骤替换为上述内容。

- [ ] **步骤 3：提交**

```bash
git add packages/research/src/enhanced-research.ts .browser-code/tool/save_markdown_note.ts
git commit -m "docs: annotate enhanced-research for phase-2 alignment, update save_markdown_note KB pipeline reference"
```

---

### 任务 9：验证 —— TypeScript 编译 + 工具可以被发现

**文件：** 无新文件

- [ ] **步骤 1：全局 TypeScript 编译检查**

```bash
cd packages/research && npx tsc --noEmit 2>&1 | head -30
# 预期：无新引入的错误（已存在的项目级警告/错误不计入失败）
```

- [ ] **步骤 2：确认 kb_manage.ts 文件语法正确**

```bash
cd .browser-code && bun --eval "import('./tool/kb_manage.ts').then(() => console.log('OK')).catch(e => console.error(e.message))" 2>&1
# 预期：OK 或 "Cannot find module" 以外的非致命错误
```

- [ ] **步骤 3：确认 kb_manage.ts 可被解析**

```bash
bun run --print "typeof (await import('./.browser-code/tool/kb_manage.ts')).default" 2>&1
# 预期：输出 "function" 或类似
```

- [ ] **步骤 4：手动检查文件完整性**

```bash
echo "=== kb_manage.ts ===" && wc -l .browser-code/tool/kb_manage.ts
echo "=== protocol.ts ===" && wc -l packages/research/src/protocol.ts
echo "=== validator.ts ===" && wc -l packages/research/src/validator.ts
echo "=== VAULT_FORMAT.md ===" && wc -l docs/superpowers/specs/VAULT_FORMAT.md
# 所有文件 > 0 行
```

- [ ] **步骤 5：提交**

```bash
git add -A
git commit -m "chore: final verification and cleanup for phase-1"
```

---

## 实施顺序

```
任务 1 (VAULT_FORMAT.md)       ← 无依赖，可独立开始
    ↓
任务 2 (protocol.ts)           ← 无依赖，可独立开始
    ↓
任务 3 (validator.ts)          ← 依赖任务 2（引用 FailureReason 类型）
    ↓
任务 4 (kb_manage 骨架)         ← 依赖任务 3（引用 validator）
    ↓
任务 5 (kb_manage 写入)         ← 依赖任务 4（骨架 + 辅助函数）
    ↓
任务 6 (kb_manage 管线+读取)    ← 依赖任务 5（完整工具结构已就绪）
    ↓
任务 7 (prompt 更新)           ← 依赖任务 6（kb_manage 已可用）
    ↓
任务 8 (标注 + 引用更新)        ← 依赖任务 1 + 任务 6
    ↓
任务 9 (最终验证)              ← 依赖所有前序任务
```

任务 1 和任务 2 可并行执行。
