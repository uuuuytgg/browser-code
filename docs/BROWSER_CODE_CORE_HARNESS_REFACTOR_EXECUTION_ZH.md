# Browser Code 核心 Harness 改造执行版

日期：2026-07-03
状态：设计 / 审批用，不包含代码实现
上一版文档：`docs/BROWSER_CODE_CORE_HARNESS_REFACTOR_RESEARCH.md`

## 0. 这版文档解决什么问题

上一版文档的问题是“方向对，但偏空”。它说明了要借鉴 Claude / Claude Code 的 Harness、IR、工具调度思路，但没有把“Claude 里具体怎么做”和“Browser Code 里具体改哪里”写到可以执行。

这版补齐三件事：

1. 明确参考的是哪个 Claude 公开 prompt / tool 片段，以及截至 2026-07-03 的新旧程度。
2. 把 Claude 机制拆成可迁移模式，不直接照抄 coding 偏置。
3. 给出 Browser Code 的函数级 / 文件级落点，后续开发不需要边写边重新查资料。

重要修正：

Browser Code 的入口不是“ProReader 或 LLM Wiki Lite 二选一”。正确链路是：

```text
非 URL 输入
  -> ProReader 第一入口
  -> ProReader 内部 agentic 意图判定
  -> 根据意图选择倾向
     -> QA: 优先 KB / LLM Wiki Lite
     -> KB 不足: 外部检索
     -> 知识向: Wikipedia / official docs / websearch
     -> 代码向: GitHub / official docs / websearch
     -> 视频/平台向: Bilibili / YouTube / Douyin / XHS 等平台 provider
```

所以 LLM Wiki Lite 是 ProReader QA 路径里的优先知识层，不是和 ProReader 平级抢入口。

## 1. 参考来源与最新性锁定

参考仓库：

- `asgeirtj/system_prompts_leaks`
- GitHub Public repository
- README 标注 CC0-1.0 license
- README 显示仓库持续更新

本次调研锁定时间：

- 2026-07-03

本次参考的公开材料：

| 材料 | README 显示更新时间 | 本次用途 |
| --- | --- | --- |
| Claude Sonnet 5 | 2026-07-01 | 检查是否已有比 Fable 5 更新的 Claude prompt。后续开发前建议刷新一次。 |
| Claude Fable 5 | 2026-06-09 | 借鉴 IR / 搜索分级 / 搜索行为原则。 |
| Claude Opus 4.8 | 2026-06-09 | 和 Fable 5 对比时作为前代参照。 |
| Claude Code Opus 4.8 | 2026-05-28 | 借鉴 Harness、工具注入、Skill、Workflow、deferred tools。 |
| Claude Code deferred tools | README Anthropic 区域列出 | 借鉴“工具存在但 schema 不立即暴露”的设计。 |
| Claude Code bundled skills | README Anthropic 区域列出 | 借鉴 skill 包装，但不能让 skill 抢 ProReader。 |

最新性判断：

- 这不是“永远最新”的文档。
- 它是 2026-07-03 时点的执行版快照。
- 如果后续开发前 `system_prompts_leaks` 新增了 Claude Code / Fable / Sonnet 的更新，应先刷新本节。
- 当前可作为 P0/P1 开发依据，因为我们要借鉴的是稳定结构：工具分层、skill 仲裁、workflow opt-in、检索分级，而不是某一句 prompt。

## 2. Claude 机制 -> Browser Code 映射总表

| Claude 机制 | Claude 侧具体表现 | Browser Code 当前问题 | Browser Code 改造落点 | 采用方式 |
| --- | --- | --- | --- | --- |
| Deferred tools | Claude Code 把部分工具列为“可用但未加载 schema”，必须先 ToolSearch 选择 | Browser Code 第一轮暴露太多工具，skill/search/platform 可抢 ProReader | `SessionTools.resolve()` / `ToolRegistry.tools()` 增加 phase gate | 直接借鉴思想，Browser Code 化 |
| Skill blocking | Claude Code 说匹配 skill 是 blocking requirement | Browser Code skill 会抢在 ProReader 前 | `SystemPrompt.skills()` 在 ProReader preflight 阶段降权/隐藏 | 反向借鉴：保留 skill，但加更高仲裁 |
| Workflow explicit opt-in | Claude Code Workflow 只有用户明确 opt-in 才可调用 | OpenCode task 文案鼓励尽可能并发 | `tool/task.txt`、agent 描述、tool gate | 直接借鉴 opt-in 原则 |
| Harness reminders | Claude Code 用 system-reminder 注入 harness/环境/工具状态 | Browser Code preflight 只是 synthetic user part | `SessionPrompt.loop()` system 数组最前插入 `BrowserCodeCoreContext` | 直接借鉴结构 |
| Search decision tree | Claude Fable 5 按信息变化率/复杂度决定搜索 | ProReader 仍偏静态 route/provider list | `packages/research/src/index.ts` 增加 complexity / mode / action batch | Browser Code 化 |
| Research loop | Claude 复杂研究会搜索、评估、改写、再搜 | ProReader 当前基本 one-shot plan | `packages/research/src/provider-actions.ts` / executor 增加 evaluate/refine/batch | 分阶段实现 |
| Tool category match | Claude 强调用最适合任务的工具 | Browser Code 可能凭上下文记忆直接 KB / web / skill | ProReader 成为统一入口，KB 是 QA 路径优先 provider | 直接采用 |
| Parallel bounded | Claude Code 允许独立工具并发，但 Workflow 大规模并发需 opt-in | Browser Code 第一轮并发 `aihot + proreader + bilibili` | phase gate 禁止 first-turn fan-out | 直接采用，但更严格 |

## 3. Claude Code 具体机制拆解

### 3.1 Deferred Tools

Claude Code 侧机制：

- 系统提示中列出 deferred tools。
- 这些工具“名字可见，但 schema 未加载”。
- 直接调用会失败。
- 必须先用 ToolSearch 选择并加载 schema。

Browser Code 需要借鉴的不是 ToolSearch 本身，而是“工具分阶段可见”：

```text
阶段 1: ProReader preflight
  可见: proreader, question, core_context_read
  不可见: skill, task, websearch, platform search, aihot

阶段 2: ProReader route returned
  可见: ProReader plan 选中的 provider tools
  不可见: 未选中的工具

阶段 3: review / enrichment / vault
  可见: 当前阶段允许的读取/写入/富化工具
```

Browser Code 文件落点：

- `opencode/packages/opencode/src/session/tools.ts`
  - 当前负责把 `registry.tools()` 结果转成模型可调用 tools。
  - 应加入 `BrowserCodeCoreContext.phase`，过滤工具。
- `opencode/packages/opencode/src/tool/registry.ts`
  - 当前统一返回 builtin/custom tools。
  - 应支持按 Browser Code phase 过滤或标注工具类别。
- `opencode/packages/opencode/src/session/prompt.ts`
  - 当前先 resolve tools，再组装 system。
  - 应先生成 core context，再把它传给 tools resolve。

验收：

用“帮我找飞波舞相关内容”测试，第一轮可调用工具里不能出现：

- `skill`
- `task`
- `websearch`
- Bilibili / Douyin / XHS search MCP
- `aihot`

第一轮只能走：

- `proreader`
- 必要时 `question`

### 3.2 Skill Blocking

Claude Code 侧机制：

- Skill 是工具。
- 系统提示要求：如果 skill 匹配任务，需要先调用 skill。
- 但 Claude Code 是 coding/CLI 产品，skill 是它的主扩展机制。

Browser Code 当前问题：

- Browser Code 的最高仲裁应该是 ProReader。
- 如果照搬 Claude Code 的 skill blocking，`aihot` 这类强描述 skill 会抢 ProReader。
- 截图里已经出现 `skill(aihot) + proreader + bilibili_search` 同轮并发。

Browser Code 改造原则：

```text
用户显式点名 skill:
  允许直接 skill

非 URL 自然语言:
  ProReader preflight 先执行
  skill 不可见或被提示为 post-route provider

ProReader 判定为 trend/news/AI hot:
  aihot 才作为 provider/action 进入执行阶段
```

Browser Code 文件落点：

- `opencode/packages/opencode/src/session/system.ts`
  - `SystemPrompt.skills(agent)` 当前会无条件输出 skill 列表。
  - 应按 `BrowserCodeCoreContext.phase` 控制。
- `opencode/packages/opencode/src/tool/skill.ts`
  - 当前 Skill tool 可执行任何 available skill。
  - 可增加 Browser Code phase 检查，preflight 阶段拒绝非显式 skill。
- `packages/research/src/provider-config.ts`
  - 可把 `aihot` 这种趋势源注册为 ProReader provider，而不是 skill 抢入口。

验收：

同样的 AI 热点 / B 站 / 模糊内容查询：

- 不允许 first tool batch 出现 `skill(aihot)`。
- 只有 ProReader 返回 `provider: aihot` 或类似 action 后才可用。

### 3.3 Workflow Explicit Opt-In

Claude Code 侧机制：

- Workflow 可大规模编排 subagents。
- 只有用户明确 opt-in 才能调用。
- 即使任务明显适合并发，也不能擅自 workflow。

Browser Code 当前问题：

- `opencode/packages/opencode/src/tool/task.txt` 仍写着尽可能并发启动多个 agents。
- 这会强化 OpenCode 原本的 coding-agent 风格。
- 对 ProReader 来说，第一步必须先判定意图，不能并发抢跑。

Browser Code 改造原则：

```text
默认:
  不允许 first-turn task fan-out

ProReader route 后:
  如果 action batch 标注 independent=true，可并发

用户明确要求 agent team / 子代理:
  可开启，但仍要先由 ProReader 或任务计划确定边界
```

Browser Code 文件落点：

- `opencode/packages/opencode/src/tool/task.txt`
  - 改写 generic 并发文案。
- `opencode/packages/opencode/src/agent/agent.ts`
  - `general` agent 描述现在偏“parallel work”。
  - Browser Code 主 agent 下应降权或重写。
- `opencode/packages/opencode/src/session/tools.ts`
  - preflight 阶段隐藏 `task`。

验收：

非 URL 查询第一轮不能启动 task/subagent。

### 3.4 Harness Reminders / System 注入顺序

Claude Code 侧机制：

- Harness、MCP instructions、deferred tools、skills、日期/环境以 system-reminder 形式进入上下文。
- 这些不是普通用户内容，而是 harness 注入。

Browser Code 当前问题：

- `browserCodePreflight()` 生成的是 synthetic user part。
- 它在用户消息尾部，不是 system root。
- 它不改变工具集合。
- 如果用户消息带多个 part，还有被重复追加的风险。

Browser Code 改造原则：

```text
BrowserCodeCoreContext 必须进 system 数组最前面
而不是作为用户消息附加文本
```

当前源码：

- `opencode/packages/opencode/src/session/prompt.ts`
  - `browserCodePreflight()` 在约 line 660。
  - `preflightInstruction` 在约 line 758 生成。
  - 当前在 resolve parts 后追加 synthetic text。
  - system 数组在约 line 1406 组装：env -> instructions -> MCP -> skills。

目标顺序：

```text
system = [
  browserCodeCoreContext,
  browserCodeIdentity,
  llmWikiLiteState,
  activePhaseGate,
  ...env,
  ...instructions,
  filteredMcpInstructions,
  filteredSkills
]
```

验收：

打印或测试 system prompt 组装结果时：

- Browser Code phase gate 位于最前。
- skills 位于其后且可被过滤。
- ProReader preflight 不再作为 user message 尾部文本。

## 4. ProReader 自身需要补的执行级结构

当前已做对的：

- 显式 URL 不进 ProReader。
- 非 URL 进入 ProReader。
- ProReader 支持 provider bias。
- QA 路径应优先 KB / LLM Wiki Lite。
- 外部检索已有 Wikipedia / GitHub / official docs / platform providers。

当前不足：

- `routeQuery()` 仍偏 regex/static provider list。
- `planProviders()` 仍是一轮静态计划。
- `agentic triage` 更像提示词目标，还不是结构化输出。

建议新增结构：

```ts
type ProReaderIntent =
  | "qa"
  | "local_knowledge_qa"
  | "external_knowledge_qa"
  | "code_source_research"
  | "platform_discovery"
  | "trend_research"
  | "vault_ingest"
  | "ordinary_conversation";

type QueryComplexity =
  | "no_search"
  | "kb_first"
  | "single_external_search"
  | "multi_source_research"
  | "deep_iterative_research";

type ProReaderDecision = {
  intent: ProReaderIntent;
  complexity: QueryComplexity;
  providerBias: ProviderId[];
  kbPolicy: "required_first" | "optional" | "skip";
  externalPolicy: "none" | "fallback_if_kb_insufficient" | "required";
  actionBatches: ProReaderActionBatch[];
  evaluationCriteria: string[];
};
```

Browser Code 关键语义：

```text
QA:
  ProReader -> KB/LLM Wiki Lite first -> if insufficient external providers

代码向:
  ProReader -> GitHub/official docs/websearch

知识向:
  ProReader -> LLM Wiki Lite -> Wikipedia/official docs/websearch

平台向:
  ProReader -> Bilibili/YouTube/Douyin/XHS provider

普通聊天:
  ProReader 可返回 ordinary_conversation，让 Browser Code 正常回答，不强搜
```

文件落点：

- `packages/research/src/triage.ts`
  - 从“只返回 instruction 文本”升级为结构化 gate decision。
- `packages/research/src/index.ts`
  - `routeQuery()` 增加 intent/complexity/kbPolicy/externalPolicy。
- `packages/research/src/provider-actions.ts`
  - action 增加 batch/dependency/evaluation/refine 信息。
- `.browser-code/tool/proreader.ts`
  - 输出 JSON 增加 `decision` / `actionBatches`。

## 5. LLM Wiki Lite 的正确位置

错误表述：

```text
ProReader 或 LLM Wiki Lite
```

正确表述：

```text
ProReader 是统一入口。
LLM Wiki Lite 是 ProReader 在 QA / local knowledge 路径里的第一 provider。
```

需要注入的不是大块 vault 内容，而是 LLM Wiki Lite 的状态机摘要：

```text
source of truth:
  vault/*.md -> kb/sources -> kb/claims/entities -> index

answer:
  harness/make_answer_context.ts

search:
  harness/search.ts

MCP:
  给外部 agent 用；Browser Code 内部优先直接 harness/wiki

write boundary:
  ProReader discovery 不直接写 vault/kb
```

文件落点：

- 新增 `packages/research/src/llm-wiki-state.ts` 或 `opencode/.../browser-code/llm-wiki-state.ts`
- 在 `BrowserCodeCoreContext` 里注入 compact summary
- 不读全 vault，不膨胀上下文

验收：

问“刚才那个 Android 17 视频里说了什么”这类问题：

- 第一入口仍是 ProReader。
- ProReader 判成 QA / local knowledge。
- 执行 LLM Wiki Lite KB 优先。
- KB 不足才走外部。

## 6. Browser Code P0 具体开发任务

### P0.1 新增 BrowserCodeCoreContext

新增文件建议：

- `opencode/packages/opencode/src/browser-code/core-context.ts`

职责：

- 判断 explicit URL / non-URL / ordinary conversation。
- 生成 phase。
- 生成 allowed/suppressed tool ids。
- 生成 system directive。
- 附带 LLM Wiki Lite compact state。

最小类型：

```ts
type BrowserCodeTurnPhase =
  | "normal"
  | "url_pipeline"
  | "proreader_preflight"
  | "proreader_execute";

type BrowserCodeCoreContext = {
  phase: BrowserCodeTurnPhase;
  query: string;
  explicitUrl?: string;
  allowedTools: string[];
  suppressedTools: string[];
  systemDirectives: string[];
};
```

### P0.2 改 system 注入顺序

文件：

- `opencode/packages/opencode/src/session/prompt.ts`
- `opencode/packages/opencode/src/session/system.ts`

动作：

- 不再把 ProReader preflight 追加为 user synthetic part。
- 在 loop 阶段组装 system 时，把 core context 放在第一位。
- skills/MCP instructions 根据 phase 过滤。

### P0.3 改工具可见性

文件：

- `opencode/packages/opencode/src/session/tools.ts`
- `opencode/packages/opencode/src/tool/registry.ts`

动作：

- `SessionTools.resolve()` 接收 core context。
- 根据 `allowedTools/suppressedTools` 过滤工具。
- preflight 阶段只给 ProReader/question/必要 read-only context。

### P0.4 改 task 并发文案和权限

文件：

- `opencode/packages/opencode/src/tool/task.txt`
- `opencode/packages/opencode/src/agent/agent.ts`

动作：

- 删除“尽可能并发”的默认导向。
- 改成“ProReader plan 明确允许后才能并发”。
- general/explore 这类 coding 子代理在 Browser Code 主路径下隐藏或降权。

### P0.5 ProReader 输出补强

文件：

- `.browser-code/tool/proreader.ts`
- `packages/research/src/index.ts`
- `packages/research/src/provider-actions.ts`

动作：

- 输出 `decision.intent`。
- 输出 `kbPolicy`。
- 输出 `externalPolicy`。
- 输出 `actionBatches`。
- 保持 explicit URL bypass。

## 7. 不该做的事

不要继续只加 prompt。

不要把 LLM Wiki Lite 提成和 ProReader 平级入口。

不要让 skill 继续在 first-turn 自选。

不要一上来删除大块 OpenCode 代码。

不要把普通 QA 强制外部搜索。

不要把 webfetch 当 websearch fallback。

不要把平台搜索作为所有非 URL 的默认并发动作。

## 8. 开发前检查清单

开发前需要确认：

- 当前参考 repo 是否有比 Claude Sonnet 5 / Fable 5 / Claude Code Opus 4.8 更新的相关 prompt。
- Browser Code 当前默认模型仍为 DeepSeek。
- `.browser-code/browser-code.jsonc` 是 TUI 实际读取的主配置。
- `.mcp.json` 和 `.browser-code/browser-code.jsonc` 的 MCP 开关是否需要统一。
- 是否保留旧英文文档，还是让本中文执行版成为主文档。

## 9. 最小验收场景

### 场景 1：飞波舞

输入：

```text
帮我找飞波舞相关内容
```

期望：

```text
first action: proreader
禁止 first batch: aihot, bilibili_search, websearch, task
ProReader 判定后再选择 provider
```

### 场景 2：刚看过的视频

输入：

```text
刚才那个 Android 17 视频里讲了什么
```

期望：

```text
first action: proreader
intent: QA / local knowledge
KB / LLM Wiki Lite first
KB 不足再外部检索
```

### 场景 3：明确 URL

输入：

```text
总结这个视频：https://...
```

期望：

```text
不进 ProReader
走原有 URL/video pipeline
```

### 场景 4：明确 skill

输入：

```text
用 aihot 看今天 AI 热点
```

期望：

```text
允许 skill 或 ProReader trend route
但必须能解释为什么显式 skill 绕过 preflight gate
```

## 10. 推荐下一步

等审批通过后，先做 P0.1 + P0.2 + P0.3 的竖切：

1. 新增 `BrowserCodeCoreContext`。
2. 把 core context 注入 system 最前。
3. preflight 阶段过滤工具。
4. 用最小测试锁住“非 URL 第一动作只能 ProReader”。

这一步成功后，再改 ProReader decision/action batch 和 task/skill 降权。

