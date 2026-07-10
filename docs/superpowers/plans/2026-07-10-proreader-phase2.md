# ProReader 阶段二：Subagent 转型 —— 实施计划

> **对于执行代理：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施。

**目标：** 将 ProReader 从单次 tool 调用转型为 OpenCode task 子代理 —— 独立上下文、独立工具作用域、Worker 调度能力。

**架构：** 在 browser-code.jsonc 中定义 proreader agent type（自定义 system prompt + 权限），简化 core-context.ts（删除 preflight 阶段），更新 prompt（主 Agent 路由框架 + ProReader 内部使用说明）。ProReader 子代理保持只读，写入继续走 Direct 通道。

**技术栈：** TypeScript, OpenCode Agent Config, browser-code plugin system

## 全局约束

- 不修改 `opencode/packages/opencode/src/agent/agent.ts`（agent type 扩展机制已存在，配置文件直接生效）
- 不修改 `packages/research/src/enhanced-research.ts`（保留阶段一标注）
- 不修改 `.browser-code/tool/rescue.ts` / `save_markdown_note.ts` / `kb_manage.ts` / `search_vault.ts`
- 不修改 `proreader.ts` 的核心逻辑（只改 description 字符串）
- 不添加新 npm 依赖
- 全部改动在配置文件 + 文本文件（prompt）级别

---

### 任务 1：browser-code.jsonc —— 新增 proreader agent type 配置

**文件：**
- 修改：`.browser-code/browser-code.jsonc`

**接口：**
- 产出：`agent.proreader` 配置块，在 OpenCode 重启后自动生效
- 消费方：任务 6（编译验证 agent 类型可用）

- [ ] **步骤 1：读取现有 browser-code.jsonc**

读取 `.browser-code/browser-code.jsonc`，确认当前 `provider` 配置段之后的位置，准备追加 `agent` 块。

- [ ] **步骤 2：在 provider 配置段之后追加 agent 块**

在 `provider` 配置段的右花括号之后追加：

```jsonc
  // ProReader subagent — research expert with independent context.
  // Spawned by the main agent via task({subagent_type: "proreader", ...}).
  "agent": {
    "proreader": {
      "mode": "subagent",
      "description": "Browser Code research expert. Receives research tasks, generates plans via the proreader tool, executes searches across 12 providers, spawns worker subagents for parallel batch work, synthesizes results. Returns structured findings — does NOT write vault/kb/sqlite.",
      "model": {
        "modelID": "deepseek-v4-flash",
        "providerID": "deepseek"
      },
      "permission": {
        "proreader": "allow",
        "websearch": "allow",
        "webfetch": "allow",
        "read": "allow",
        "bash": "allow",
        "task": "allow",
        "question": "deny",
        "todowrite": "deny",
        "write": "deny",
        "edit": "deny",
        "save_markdown_note": "deny",
        "kb_manage": "deny",
        "search_vault": "deny"
      },
      "steps": 25
    }
  }
```

- [ ] **步骤 3：验证 JSON 语法**

```bash
cd ".browser-code" && bun -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('browser-code.jsonc','utf8').replace(/\/\/.*$/gm,'')),null,2))" | head -5
# 预期：无 parse error，正常输出 JSON
```

- [ ] **步骤 4：提交**

```bash
git add .browser-code/browser-code.jsonc
git commit -m "feat: add proreader agent type config for subagent transition"
```

---

### 任务 2：browser-code.txt —— Prompt 更新

**文件：**
- 修改：`opencode/packages/opencode/src/session/prompt/browser-code.txt`

**接口：**
- 消费方：任务 6（编译后 prompt 随二进制生效）

- [ ] **步骤 1：读取当前 browser-code.txt**

确认 `# ProReader research routing` 段的范围（约第 41-48 行）和 `# Retrieval policy` 段（约第 49-54 行）。

- [ ] **步骤 2：替换 ProReader research routing 段**

将 `# ProReader research routing` 整个段替换为：

```markdown
# Task routing

收到用户请求后，按以下框架判断走哪条通道：

## Direct 通道（主 Agent 直接处理）
满足以下任一条件：
- 请求包含明确 URL → URL 管道（webfetch → web_to_markdown → save + kb_manage）
- 请求是"记笔记"/"搜KB"/"管KB" → kb_manage / search_vault / save_markdown_note
- 请求是单一事实查询（"X是什么"且不涉及多源对比）→ webfetch 直接抓

## Research 通道（ProReader 子代理）
不满足 Direct 条件时，默认走 Research。使用 task 工具 spawn ProReader 子代理：
任务描述和 prompt 中明确研究问题、期望的 provider 方向、输出格式。

## 判断原则
- 不确定时 → 走 Research。代价是一轮子代理，漏掉复杂任务的代价更大。
- 拒绝走 Research 的理由必须来自否定式边界：不需要多源对比、不需要跨平台搜索、不需要深度分析。
- ProReader 返回结构化结果后 → save_markdown_note 写入 vault → kb_manage 完整 KB 管线。

ProReader 研究用的 proreader tool 和 MCP 平台工具仅 ProReader 子代理权限内可用，主 Agent 只看到 task/todo/write/read/webfetch/websearch/save_markdown_note/kb_manage/search_vault/bash。
```

- [ ] **步骤 3：移除被搬走的 ProReader tool 使用细节**

确认 `# Tool orchestration` 段（约第 34-39 行）中关于 `proreader` tool 的具体使用说明已移出。保留通用 tool orchestration 建议。如果有 "Read the returned JSON, then execute..." 这类 ProReader 专用指令，替换为简洁引用：

```markdown
- Research tasks: delegate to ProReader subagent via task tool. See Task routing above.
```

- [ ] **步骤 4：提交**

```bash
git add opencode/packages/opencode/src/session/prompt/browser-code.txt
git commit -m "docs: replace ProReader routing with task-based Research/Direct framework"
```

---

### 任务 3：core-context.ts —— 简化（删除 preflight，简化 phase）

**文件：**
- 修改：`opencode/packages/opencode/src/browser-code/core-context.ts`

- [ ] **步骤 1：读取 core-context.ts 当前内容**

确认以下目标区域：
- `BrowserCodePhase` 类型定义（第 9-15 行）
- `PREFLIGHT_TOOLS`（第 27-31 行）
- `EXECUTE_BASE_TOOLS`（第 39-43 行）
- `PROREADER_SAVE_TOOLS`（第 45-48 行）
- `buildBrowserCodeCoreContext` 函数（第 59-195 行）
- `allowToolForBrowserCodeCoreContext` 函数（第 197-209 行）

- [ ] **步骤 2：简化 BrowserCodePhase 类型**

将：
```typescript
export type BrowserCodePhase =
  | "url_pipeline"
  | "explicit_skill_direct"
  | "l1_direct"
  | "proreader_preflight"
  | "proreader_execute"
  | "proreader_save_confirmed"
```

替换为：
```typescript
export type BrowserCodePhase =
  | "url_pipeline"
  | "explicit_skill_direct"
  | "direct"
  | "research"
  | "save_confirmed"
```

- [ ] **步骤 3：删除 PREFLIGHT_TOOLS 常量**

删除第 27-31 行的 `PREFLIGHT_TOOLS`。

- [ ] **步骤 4：更新 EXECUTE_BASE_TOOLS——移除 proreader**

将：
```typescript
const EXECUTE_BASE_TOOLS = new Set([
  "invalid",
  "question",
  "proreader",
])
```

替换为：
```typescript
// research phase: agent waits for ProReader subagent; only essential tools allowed
const RESEARCH_PHASE_TOOLS = new Set([
  "invalid",
  "question",
  "task",
])
```

- [ ] **步骤 5：更新 buildBrowserCodeCoreContext——preflight 逻辑替换**

找到 `l1_direct` 相关逻辑（约第 128-145 行），替换 `l1_direct` 为 `direct`，将 `"proreader_preflight"` 分支逻辑替换为 `"direct"`：

```typescript
// proreader_preflight → direct
// proreader_execute → research  
// proreader_save_confirmed → save_confirmed
// 
// 将所有 l1_direct 引用改为 direct
```

具体改动检查清单：
- `phase: "l1_direct"` → `phase: "direct"`
- `l1_direct` 字符串在 `allowToolForBrowserCodeCoreContext` 中的引用 → 改为 `direct`
- `proreader_preflight` → 删除相关分支，该值不再作为 phase
- `proreader_execute` → `research`（主 Agent 正在等 ProReader 子代理结果）
- `proreader_save_confirmed` → `save_confirmed`
- `buildBrowserCodeCoreContext` 中 proreader preflight 的判断逻辑删除

- [ ] **步骤 6：更新 allowToolForBrowserCodeCoreContext**

```typescript
export function allowToolForBrowserCodeCoreContext(toolID: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "direct") return true
  if (context.phase === "save_confirmed" && PROREADER_SAVE_TOOLS.has(toolID)) return true
  if (context.phase === "research" && context.allowedTools) {
    return context.allowedTools.includes(toolID)
  }
  if (context.phase === "explicit_skill_direct" && context.allowedTools) {
    return context.allowedTools.includes(toolID)
  }
  return true
}
```

- [ ] **步骤 7：更新 allowMcpToolForBrowserCodeCoreContext**

将 `l1_direct` 引用替换为 `direct`，将 `proreader_preflight` 引用替换为 `direct`。

- [ ] **步骤 8：提交**

```bash
git add opencode/packages/opencode/src/browser-code/core-context.ts
git commit -m "refactor: simplify core-context — remove preflight, rename phases, drop tool filtering"
```

---

### 任务 4：task.txt + proreader.ts description 更新

**文件：**
- 修改：`opencode/packages/opencode/src/tool/task.txt`
- 修改：`.browser-code/tool/proreader.ts`

- [ ] **步骤 1：更新 task.txt 规则 1**

读取 `opencode/packages/opencode/src/tool/task.txt`。

将第 1 条：
```
1. In Browser Code, do not launch subagents as the first action for non-URL natural-language research. Let ProReader return a route/plan first, then use subagents only for independent action batches or when the user explicitly asks for an agent team.
```

替换为：
```
1. In Browser Code, for non-URL natural-language research, consider whether the task needs the ProReader subagent. Spawn it via task({subagent_type: "proreader", ...}). Do not launch general subagents as the first action — let ProReader analyze and return a route/plan first if research is needed.
```

- [ ] **步骤 2：更新 proreader.ts 的 tool description**

读取 `.browser-code/tool/proreader.ts`。将 description 字符串从：

```
Route fuzzy research requests through BrowserCode ProReader.

Use this for natural-language research, local LLM Wiki Lite questions, GitHub/Wikipedia/official-docs planning, and video/social platform discovery.

Do not use this for explicit URLs. Explicit URLs must stay on the existing BrowserCode URL pipeline and current web/video/resource/vault tools.

Before calling this tool, make your own agentic intent decision.
```

替换为：

```
Internal research planning tool. Called by the ProReader subagent (not by the main agent).

Generates a provider plan with route, executable actions, step guards, and rescue lane. The ProReader subagent then executes the plan, delegates parallel work to worker subagents when complexity warrants, and synthesizes results for return to the main agent.

This tool does not fetch URLs, does not write vault/kb/sqlite. It returns the plan; execution is the ProReader subagent's responsibility.

Before calling this tool, the ProReader subagent should assess: intent, research depth, provider bias, review needs, and save mode.
```

- [ ] **步骤 3：提交**

```bash
git add opencode/packages/opencode/src/tool/task.txt .browser-code/tool/proreader.ts
git commit -m "docs: update task.txt rule for ProReader subagent, update proreader description for internal use"
```

---

### 任务 5：ProReader 子代理 system prompt 文件

**文件：**
- 创建：`opencode/packages/opencode/src/agent/prompt/proreader.txt`

- [ ] **步骤 1：创建 proreader.txt**

```text
你是 Browser Code 的研究专家（ProReader）。你由主 Agent 通过 task 工具 spawn，拥有独立上下文。

## 你的角色

接收研究任务 → 规划 → 执行 → 综合 → 返回结构化结果给主 Agent。

你**不写文件**。主 Agent 负责写入 vault/kb。

## 工作流程

1. **理解任务**：分析主 Agent 委托的研究问题，确定复杂度和范围
2. **调用 proreader tool**：生成 provider plan（路由决策、executablePlan、stepGuard、rescueLane）
3. **执行研究**：按 executablePlan.actions 执行
   - action.kind = "agent_tool" → websearch / webfetch
   - action.kind = "mcp_tool" → 对应 MCP 工具
   - action.kind = "shell_command" / "harness_command" → bash
4. **失败处理**：遵循 stepGuard（超时/重试规则），收集失败后调用 rescue tool 获取 CDP 兜底
5. **复杂度判断**：满足以下**任意两条** → 火力全开（spawn worker 子代理）：
   - 搜索 3+ 独立 provider
   - 预期结果 > 15 条
   - 需多源交叉验证
   - 平台内搜索 + Web 搜索组合
6. **分析综合**：去重、排序、交叉验证、标注不可靠来源
7. **返回结果**：见输出格式

## Worker 调度

火力全开时并行 spawn worker：
- agent type: "proreader"
- prompt 中写："你是研究 Worker。只执行搜索/抓取，不综合。返回 [{title, url, snippet, provider}]"
- 每个 Worker 负责一个 provider 类别或一组搜索词
- 收集所有 Worker 结果后综合去重

## 输出格式

返回给主 Agent：

{
  "status": "success|partial|failed",
  "summary": "研究摘要",
  "sources": [{"title": "", "url": "", "provider": "", "relevance": "high|medium|low"}],
  "findings": [{"claim": "", "confidence": "high|medium|low", "sources": []}],
  "method": "normal|full_power",
  "workerCount": 0,
  "warnings": [],
  "suggestedSaveTargets": ["建议保存到 vault/articles/ 的路径"]
}

## ProReader tool 使用说明

### executablePlan.actions
每个 action 有：
- actionIndex: 执行顺序
- kind: "agent_tool" | "mcp_tool" | "shell_command" | "harness_command" | "api_request"
- tool / toolCandidates: agent_tool 时使用的工具名
- toolName: mcp_tool 时的 MCP 工具名
- command + args: shell_command/harness_command 时的命令

### recommendedActionIndexes
proreader tool 返回的推荐执行 action 列表。优先执行这些，其余按需。

### stepGuard
每条 step 有：
- 超时：web_fetch 30s / api_call 15s / platform_mcp 30s / video_download 120s
- 重试：最多 3 次，间隔 2s
- 失败后记录到 failures 数组，继续下一步，不阻塞全部 plan

### dynamicToolExposure
研究过程中可用的工具暴露策略。按策略使用工具组合，但不改写路由意图。

### rescueLane
收集 failures 后调用 rescue tool。tool 返回：哪些可 CDP 兜底、哪些应跳过、哪些不确定。

## 禁止

- 不写 vault/kb/sqlite
- 不调用 save_markdown_note 或 kb_manage
- 不修改主 Agent 会话状态
- 不扩大研究范围
- 不在 Worker prompt 中给予综合判断权限（Worker 只返回原始数据）
```

- [ ] **步骤 2：提交**

```bash
git add opencode/packages/opencode/src/agent/prompt/proreader.txt
git commit -m "docs: add ProReader subagent system prompt"
```

---

### 任务 6：编译 + 验证

**文件：** 无新文件

- [ ] **步骤 1：编译**

```bash
cd opencode/packages/opencode && bun run script/build.ts --single --skip-install --skip-clean 2>&1 | tail -5
# 预期：Smoke test passed
```

- [ ] **步骤 2：复制二进制**

```bash
cp opencode/packages/opencode/dist/opencode-windows-x64/bin/opencode.exe bin/browser-code.exe
# 验证
ls -lh bin/browser-code.exe
```

- [ ] **步骤 3：检查 bro，ser-code.jsonc 中 agent 配置可被解析**

```bash
cd .browser-code && bun -e "
const c = JSON.parse(require('fs').readFileSync('browser-code.jsonc','utf8').replace(/\/\/.*$/gm,''));
console.log('agent.proreader:', JSON.stringify(c.agent?.proreader?.mode));
console.log('agent.proreader.task:', c.agent?.proreader?.permission?.task);
"
# 预期：agent.proreader: "subagent" 且 task: "allow"
```

- [ ] **步骤 4：验证所有改动的文件**

```bash
echo "=== Modified files ==="
git diff --stat HEAD~6..HEAD
echo ""
echo "=== Commit log ==="
git log --oneline -7
```

- [ ] **步骤 5：提交**

```bash
git add -A
git commit -m "chore: final verification and binary build for phase-2"
```

---

## 实施顺序

```
任务 1 (agent config)        ← 无依赖
    ↓
任务 2 (browser-code.txt)    ← 无依赖，可与 1 并行
    ↓
任务 3 (core-context.ts)     ← 依赖 1+2（phase 改名对得上）
    ↓
任务 4 (task.txt + proreader.ts) ← 依赖 3（新的 phase 名称已确定）
    ↓
任务 5 (proreader.txt)       ← 无依赖，可在 2 之后任意时间
    ↓
任务 6 (编译验证)            ← 依赖所有前序任务
```
