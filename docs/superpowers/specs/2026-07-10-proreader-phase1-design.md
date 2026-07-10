# ProReader 阶段一：边界固定与 KB 管道完整实现 —— 设计规范

> **版本**：v1.0  
> **日期**：2026-07-10  
> **状态**：待审核  

---

## 1. 背景与动机

### 1.1 当前状态

ProReader 是嵌入 OpenCode Runtime 内部的领域专用 Agent 层。它已具备 Agent 雏形（意图识别、任务规划、工具暴露、失败截停），但存在以下结构性问题：

- **边界是"被 bug 逼出来的"**：ProReader 的只读性、Plan 固化、L0 隔离等边界客观存在，但不是设计出来的——是限制和遗漏的副产品
- **KB 写入端无标准化路径**：agent 用 `write()` 手写 `kb/sources/*.md` 和 `kb/claims/*.claims.md`，格式靠 4 个分散的 MD 模板文件和 prompt 描述。格式终点明确，但写入过程是"抽盲盒"——快时一次到位，慢时多轮试错
- **kb_manage 是幽灵工具**：曾在 prompt 中被引用但从未实现，后被删除引用而非填实实现
- **Vault 格式散落四处**：`save_markdown_note.ts`（frontmatter 逻辑）、`browser-code.txt`（Vault discipline 段）、`kb/` 模板文件、`wiki/` 策略文件

### 1.2 阶段一目标

1. 把隐式契约写成显式类型和文档
2. 把散落的 KB 流程封装为标准工具（kb_manage 复活并完整实现）
3. 统一 Vault 格式规范为单一真相来源
4. 实现 Runtime Validator 基础版
5. 清理遗留代码标注

**全部在插件层完成，不碰 OpenCode 核心。**

---

## 2. 系统架构

### 2.1 受影响文件总览

```
新增文件：
  .browser-code/tool/kb_manage.ts          ← KB 全管线工具（核心交付）
  docs/superpowers/specs/VAULT_FORMAT.md   ← Vault 格式单一真相来源
  packages/research/src/validator.ts       ← Runtime Validator
  packages/research/src/protocol.ts        ← ProReader 协议类型定义

修改文件：
  .browser-code/tool/save_markdown_note.ts ← 引用 VAULT_FORMAT.md
  .browser-code/tool/proreader.ts          ← 引用新协议类型
  opencode/packages/opencode/src/session/prompt/browser-code.txt ← 更新 KB 管理段
  opencode/packages/opencode/src/browser-code/core-context.ts     ← 更新 L1 工具描述
  packages/research/src/index.ts           ← 导出新模块
  packages/research/src/enhanced-research.ts ← 标注"待阶段二对齐"

不修改文件（向后兼容）：
  harness/                                 ← 所有 bash 管线脚本保持不变
  .browser-code/tool/rescue.ts             ← 不修改
  .browser-code/tool/search_vault.ts       ← 不修改（继续作为回退方案）
  config/mcp.tools.json                    ← 不修改
```

### 2.2 数据流：改造前 vs 改造后

```
改造前（KB 写入 —— "抽盲盒"）：
  agent 读取 prompt 中的格式描述
    → agent 回忆 4 个 MD 模板的内容
    → agent 用 write() 手写 kb/sources/xxx.md
    → 可能格式错误 → 重写 → 可能再错 → 再重写
    → bash: kb:after-capture
    → process-queue 检查文件存在 → 推进或阻塞

改造后（KB 写入 —— "自动售货机"）：
  agent 调用 kb_manage({ action: "save_source", title, url, summary, key_points, ... })
    → kb_manage 内部按模板生成标准格式 → 写入文件
    → agent 调用 kb_manage({ action: "save_claims", source_file, claims: [...] })
    → kb_manage 内部按 CLAIM_POLICY 生成标准格式 → 写入文件
    → agent 调用 kb_manage({ action: "after_capture", vault_path })
    → 自动 enqueue → process-queue → rebuild FTS5
    → 返回验证结果（硬阻断检查 + 软警告）
```

---

## 3. 详细设计

### 3.1 kb_manage 工具（核心交付件）

#### 3.1.1 7 个 Action

| Action | 类别 | 功能 | 输入关键参数 |
|--------|------|------|-------------|
| `save_source` | 写入 | 创建 `kb/sources/{date}-{slug}.md` | title, source_url, source_type, summary, key_points[], details, related_topics[], vault_path |
| `save_claims` | 写入 | 创建 `kb/claims/{name}.claims.md` | source_file, claims[{type, text}] |
| `link_topic` | 写入 | 创建/更新 `kb/topics/{name}.md` | topic_name, topic_name_zh, definition, related_claims[], related_sources[], related_entities[] |
| `link_entity` | 写入 | 创建/更新 `kb/entities/{name}.md` | entity_name, entity_type, description, related_topics[], related_claims[], related_sources[], aliases[] |
| `after_capture` | 管线 | enqueue → process-queue → rebuild FTS5 | vault_path |
| `search` | 读取 | FTS5 搜索 | query |
| `context` | 读取 | 生成回答上下文 | query |

#### 3.1.2 格式保证机制

**save_source** 生成的文件结构（代码保证，agent 不需要知道格式）：
```markdown
# {title}

## Metadata
source_type: {webpage|video|transcript|document|manual}
source_url: {url}
captured_at: {ISO timestamp}
vault_path: {path}
status: active

## Summary
{agent 提供的摘要文本}

## Key Points
- {agent 提供的要点1}
- {agent 提供的要点2}

## Details
{agent 提供的详细内容}

## Related Topics
- [[kb/topics/{topic_slug}]]

## Original Reference
- Vault: {vault_path}
```

**save_claims** 格式保证：
- claim type 用 TypeScript enum 约束：`"definition" | "mechanism" | "constraint" | "comparison" | "conclusion" | "open-question" | "warning" | "procedure"`
- 每条 claim 自动添加 `[type]` 前缀
- 自动注入 `source_path` 和 `updated_at`

**link_topic / link_entity** 格式保证：
- managed-block 注释区域（`<!-- browsercode:managed:start related-claims -->`）由代码管理
- agent 只提供引用列表（如 `["kb/claims/some-claim.claims"]`），tool 负责格式化 `[[kb/claims/some-claim]]`

#### 3.1.3 工具注册

`kb_manage` 在 `.browser-code/tool/kb_manage.ts` 中定义，与现有 4 个工具同目录，使用相同的 `@opencode-ai/plugin` 的 `tool()` API。OpenCode 的插件系统自动发现 `.browser-code/tool/` 目录下的工具文件，无需额外注册代码。

工具名 `kb_manage` 不会与现有工具冲突（现有工具：proreader、rescue、save_markdown_note、search_vault）。

### 3.2 ProReader 协议类型定义

#### 3.2.1 文件位置

`packages/research/src/protocol.ts`（新文件），从 `index.ts` 重新导出。

#### 3.2.2 类型定义

```typescript
// ── 输入协议 ──
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
  status: "success" | "partial" | "failed"
  summary: string
  artifacts: ProReaderArtifact[]
  sources: ProReaderSource[]
  warnings: string[]
  unfinished: ProReaderUnfinishedItem[]
  suggestedNextAction: string | null
}

export interface ProReaderArtifact {
  type: "markdown" | "source" | "claim" | "topic" | "entity"
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

// ── 状态结构 ──
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

// ── 依赖边界标注（文档级，非运行时） ──
export const PROREADER_DEPENDENCIES = {
  providedByOpenCode: [
    "ToolDefinition / tool() — @opencode-ai/plugin",
    "MCP tool discovery — config/mcp.tools.json → runtime-config.ts",
    "File system access — Node.js fs",
    "Session context — BrowserCodeCoreContext",
  ],
  selfContained: [
    "Route matching — dispatchInput / routeQuery",
    "Provider planning — planProviders / planProReader",
    "Execution request building — buildProviderExecutionRequests",
    "Step guard instructions — buildStepGuardInstructions",
    "Failure classification — classifyFailure",
    "Tool exposure synthesis — buildDynamicToolExposure",
  ],
} as const
```

### 3.3 Runtime Validator

#### 3.3.1 文件位置

`packages/research/src/validator.ts`（新文件）

#### 3.3.2 检查层级

```typescript
export interface ValidationResult {
  hardBlocks: ValidationIssue[]    // 任何一条存在 → 任务未完成
  softWarnings: ValidationIssue[]  // 不阻塞完成，但需要报告
  passed: boolean                   // hardBlocks.length === 0
}

export interface ValidationIssue {
  code: string          // 如 "MISSING_REQUIRED_SOURCE"
  message: string       // 人类可读的描述
  detail: string        // 具体哪个文件/步骤
}

// 硬阻断检查项
const HARD_BLOCK_CHECKS = [
  "MISSING_REQUIRED_SOURCE",   // 标记为必需的来源未获取
  "EMPTY_PARSE_RESULT",        // 内容解析返回空壳
  "FILE_NOT_WRITTEN",          // 预期输出文件不存在
  "UNRESOLVED_BLOCKING_ERROR", // 有未处理的阻断错误
  "KB_PIPELINE_INCOMPLETE",    // KB 管线步骤未全部完成
]

// 软警告检查项
const SOFT_WARNING_CHECKS = [
  "PARTIAL_SOURCES",           // 部分来源未获取
  "OPTIONAL_STEP_SKIPPED",     // 可选步骤未执行
  "LOW_QUALITY_CONTENT",       // 内容质量可能不足
]
```

#### 3.3.3 集成方式

Validator 被 `kb_manage` 的 `after_capture` action 内部调用。返回值中包含验证结果：

```json
{
  "pipeline": {
    "enqueued": true,
    "step": 4,
    "status": "done"
  },
  "validation": {
    "passed": true,
    "hardBlocks": [],
    "softWarnings": [
      {
        "code": "PARTIAL_SOURCES",
        "message": "只获取了 3/5 个来源",
        "detail": "来源 github 和 wikipedia 未成功获取"
      }
    ]
  }
}
```

### 3.4 Vault 格式规范统一

#### 3.4.1 文件位置

`docs/superpowers/specs/VAULT_FORMAT.md`（新文件）

#### 3.4.2 内容结构

```markdown
# Vault Format Specification

## 1. Note Frontmatter（对应 save_markdown_note.ts）

## 2. KB Source 格式（对应 kb/sources/）

## 3. KB Claim 格式（对应 kb/claims/、wiki/CLAIM_POLICY.md）

## 4. KB Topic 格式（对应 kb/topics/）

## 5. KB Entity 格式（对应 kb/entities/）

## 6. 目录结构总览
```

此文件是所有写入操作的**单一格式真相来源**。`kb_manage` 各 action 的 tool description 中引用此文件对应章节。`browser-code.txt` 的 Vault discipline 段引用此文件。

### 3.5 enhanced-research.ts 处理

不在此阶段改动代码。在文件顶部添加注释：

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

---

## 4. 设计约束

### 4.1 不在此阶段做的事
- 不改 ProReader 运行方式（仍为单次 tool 调用，由主 Agent loop 驱动）
- 不引入 OpenCode task 子代理（留给阶段二）
- 不改 Plan 生成逻辑（Replan 留给阶段三）
- 不添加新的 npm 依赖包

### 4.2 向后兼容
- 现有 `write()` + `bun run kb:after-capture` 工作流继续有效
- `search_vault` 继续作为 kb:search 的回退方案
- `harness/` 下所有 bash 管线脚本不修改
- `browser-code.txt` 的修改是增量的（添加 kb_manage 引用，保留现有 bash 命令描述）

### 4.3 安全
- kb_manage 的写入 action（save_source/save_claims/link_topic/link_entity）仅写入 `kb/` 目录
- 不授予任意路径写入权限
- 不执行 Shell 命令（after_capture 通过 `Bun.spawn` 调用，不允许任意命令）

---

## 5. 测试策略

| 测试对象 | 测试类型 | 测试内容 |
|---------|---------|---------|
| kb_manage.save_source | 单元测试 | 输入参数 → 验证输出文件格式正确 |
| kb_manage.save_claims | 单元测试 | claim type enum 约束、格式正确 |
| kb_manage.after_capture | 集成测试 | 完整 enqueue → process → index 流程 |
| Runtime Validator | 单元测试 | 各检查项的触发条件 |
| ProReader 协议 | 类型检查 | TypeScript 编译通过 |

---

## 6. 验收标准

- [ ] `kb_manage` 7 个 action 全部可用，格式由代码保证
- [ ] `VAULT_FORMAT.md` 作为单一格式真相来源，被 tool description 引用
- [ ] ProReader 输入/输出/状态类型在 `protocol.ts` 中定义
- [ ] Runtime Validator 在 `after_capture` 返回时附带验证结果
- [ ] `enhanced-research.ts` 有阶段二对齐标注
- [ ] 现有 `write() + bash` KB 工作流不受影响
- [ ] 所有新代码通过 TypeScript 编译
