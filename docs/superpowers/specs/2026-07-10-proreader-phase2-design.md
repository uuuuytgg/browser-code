# ProReader 阶段二：Subagent 转型 —— 设计规范

> **版本**：v1.0
> **日期**：2026-07-10
> **状态**：待审核

---

## 1. 背景

阶段一已完成 ProReader 的边界固定与 KB 管道标准化的完整实现。ProReader 当前是嵌入 OpenCode Runtime 内部的领域专用 Agent 层——它已有 Agent 雏形，但作为单次 tool 调用运行在主 Agent loop 内。

阶段二的目标：将 ProReader 从"主 Agent 调用的 tool"转型为"独立的 OpenCode task 子代理"，获得独立上下文、独立工具作用域、Worker 调度能力。

### 1.1 阶段一交付物（已部署）

- kb_manage 全管线工具（7 个 action）
- VAULT_FORMAT.md 格式规范
- ProReader 协议类型（TaskInput / TaskOutput / TaskState）
- Runtime Validator
- enhanced-research.ts 阶段二对齐标注

### 1.2 阶段二不做的

- ProReader 子代理不获得写入权限（留给阶段三）
- 不做多轮状态机 / Replan（留给阶段三）
- 不做动态工具暴露按阶段切换（留给阶段三）
- 不把 L0 爬虫 agent 化（留给 Multi-Agent 阶段）
- 不实现复杂的 Agent 队列/调度器（依赖 OpenCode 原生 TodoWrite + task）
- 不实现自定义子代理持久化（依赖 OpenCode 原生 task_id + SQLite session storage）

### 1.3 KB 位置行为确认

所有写入工具使用 `process.cwd()` 确定知识库路径：

```typescript
// save_markdown_note.ts
const vaultDir = join(process.cwd(), "vault")

// kb_manage.ts
const KB_DIR = join(process.cwd(), "kb")
```

**行为：** 在哪个项目目录启动 browser-code，知识库就建在哪个目录下。每个项目维持独立的知识空间。全局安装后，不同项目目录之间没有知识库交叉污染。这是期望行为——与旧 Runtime（`C:\Users\lishi\.browser-code\config.json` 中硬编码 vaultDir）不同。

### 1.4 ProReader 子代理持久化确认

**问题：** ProReader 转型为子代理后，研究过程中遇到 `/compact` 或会话中断时，子代理的上下文是否会丢失？

**结论：** **不会。** OpenCode 的 `task` 机制原生支持会话持久化：

- 每个 task 子代理拥有独立的 `task_id`，其完整上下文（系统 prompt + 对话历史 + 工具调用记录）通过 SQLite 持久化存储
- 主 Agent 通过 `task_id` 恢复子代理会话——和主 Agent 自身的会话恢复是同一套机制
- ProReader 研究过程中断：主 Agent `/compact` 后通过 `task_id` 继续等待结果即可
- ProReader 完成后断连：结果已持久化在主 Agent 会话中，恢复后直接可见

**Why 不需要额外实现：** OpenCode 的 task 持久化是内置的，不是 browser-code 需要额外开发的。ProReader 作为标准 `task` 子代理自动继承这套机制。

**阶段二不需要做的：**
- 不需要实现自定义持久化层
- 不需要修改 OpenCode session storage
- 不需要手动管理 subagent 状态恢复

---

## 2. 架构概览

```
用户请求
    │
主 Agent（prompt 引导分类）
    │
    ├── URL / 查KB / 写笔记 ──→ Direct 通道（主 Agent 直接操作）
    │                         工具：webfetch, web_to_markdown, save_markdown_note,
    │                               kb_manage, search_vault, bash
    │
    └── 研究任务 ──→ Research 通道
                      │
                      task({ subagent_type: "proreader", prompt: "..." })
                      │
               ProReader 子代理（独立上下文）
                      │
                      ├── 调用 proreader tool 生成 plan（代码确定性）
                      │
                 ┌────┴────┐
                 ▼         ▼
          普通复杂度   火力全开
          (自行执行)   (spawn worker 子代理)
                          │
                   ┌──────┴──────┐
                   ▼             ▼
             worker-1       worker-2
             (搜索)         (抓取)
                   │             │
                   └──────┬──────┘
                          ▼
                 ProReader 综合结果
                 返回主 Agent
                      │
                主 Agent 写入
                (save_markdown_note + kb_manage)
```

### 2.1 通道定义

| 通道 | 触发条件 | 执行者 | 工具范围 |
|------|---------|--------|---------|
| **Direct** | URL 明确、KB 操作、单一事实查询 | 主 Agent | 全工具 |
| **Research** | 需要多源对比/跨平台搜索/深度分析 | ProReader 子代理 | 研究工具（只读） |

### 2.2 判断原则

- 不确定时 → 默认走 Research
- 拒绝走的理由必须来自**否定式边界**：不需要多源对比、不需要跨平台搜索、不需要深度分析

### 2.3 CDP Rescue Lane（简化）

**原设计（阶段一）：** ProReader 作为 tool 运行在主 Agent loop 内时，第三条 lane（CDP 监控层）可实时监控 ProReader 的 tool 调用，在抓取失败时注入 Chrome DevTools 兜底结果，走 ProReader 流程重新整合。

**阶段二的问题：** ProReader 转型为子代理后拥有独立上下文，主 Agent 无法穿透上下文监控其 tool 调用。三层 lane 架构中的 CDP 层不再可行。

**简化方案：** CDP rescue 降级为 **主代理事后机械补充**：

```
ProReader 子代理完成研究
    │
    ▼
返回结构化结果（含 failures 数组）
    │
    ▼
主 Agent 接收结果
    │
    ├── 成功部分 → save_markdown_note + kb_manage 写入
    │
    └── failures → 机械判断：
        ├── CDP 可兜底（页面需 JS 渲染）→ bash + headless Chrome 抓取 → 补入 vault
        └── CDP 无法兜底（需要登录、纯 API 数据）→ 标记为不可用
```

**Why 不需要重新回到 ProReader：** 写入格式由 save_markdown_note + kb_manage 标准化，主 Agent 直接用这些工具补入即可。CDP rescue 是纯机械操作——不需要重新规划 provider、不需要研究判断、不需要源交叉验证——这些已经在 ProReader 阶段完成了。

**实现影响：**
- `.browser-code/tool/rescue.ts` 保持不变（工具本身不需要改）
- ProReader 子代理 prompt 中保留失败收集指引
- 主 Agent prompt (browser-code.txt) 中新增：收到 ProReader 结果后检查 failures，机械 rescue 补入
- 不做的事：不把 rescue 重新注入 ProReader 上下文；不在 core-context.ts 中做 CDP 拦截

### 2.4 Team 编排：依赖 OpenCode 原生机制

**结论：** OpenCode 原生支持 `TodoWrite` + 并行 `task` spawning。实现多 Agent 协作时：

- **不需要** 在 browser-code 中实现额外的调度器/编排引擎
- **不需要** 复杂的 subagent 依赖图管理
- **只需要** 在 prompt 文件中写好约束：
  - 主 Agent prompt：什么情况下分解任务、如何写 task description、如何汇总结果
  - ProReader 子代理 prompt：什么时候 spawn worker、各 worker 的职责边界

**多步项目编排模式**（如"研究 + 写报告 + 生成 PPT"）：
1. 主 Agent 先 TodoWrite 列出步骤
2. 并行 spawn 独立 task（研究走 ProReader、PPT 走 guizang-ppt-skill）
3. 主 Agent 收集结果、组装最终输出

这与 Phase 2 的设计方向一致：ProReader 专注研究，不负责写文件和编排多 Agent 协作。

---

## 3. Agent 配置

### 3.1 ProReader Agent Type

在 `browser-code.jsonc` 中新增 `agent.proreader` 配置：

```jsonc
"agent": {
  "proreader": {
    "mode": "subagent",
    "description": "Browser Code 研究专家。接收研究任务，生成计划，调度 worker，综合分析结果。",
    "model": {
      "modelID": "deepseek-v4-flash",
      "providerID": "deepseek"
    },
    "permission": {
      // 研究核心
      "proreader": "allow",
      "websearch": "allow",
      "webfetch": "allow",
      "read": "allow",
      "bash": "allow",
      // Worker 调度（显式允许，突破子代理默认 deny）
      "task": "allow",
      // MCP 平台工具
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

### 3.2 权限继承链

```
主 Agent（全权限，包括 task）
    │
    └── ProReader 子代理
        ├── 继承主 Agent deny 规则
        ├── 显式 allow: proreader, websearch, webfetch, read, bash, task, MCP 平台
        ├── 显式 deny: write, edit, save_markdown_note, kb_manage, search_vault
        ├── 默认 deny: todowrite
        │
        └── Worker 子代理（同样 proreader agent type，不同 prompt）
            ├── 继承 ProReader 子代理 deny 规则
            ├── 显式工具集合由 spawn 时的 prompt 指定
            ├── 默认 deny: task（禁止三级递归）
            └── 仅给: websearch, webfetch, read
```

### 3.3 Worker 与 ProReader 的区别

| | ProReader 子代理 | Worker 子代理 |
|---|---|---|
| agent type | proreader | proreader |
| task 工具 | ✅ 允许 spawn worker | ❌ 默认 deny（防递归） |
| proreader tool | ✅ 调用生成 plan | ❌ 不需要 |
| 角色 | 规划 + 调度 + 综合 | 批量搜索/抓取 |

Worker 与 ProReader 共享同一 agent type。区分靠 spawn 时传入的 prompt：
- ProReader 的 prompt 含研究框架 + 规划工具说明
- Worker 的 prompt 只有"执行这批搜索，返回原始结果"

---

## 4. ProReader 子代理 System Prompt

```markdown
你是 Browser Code 的研究专家（ProReader）。你的职责是接收主 Agent 委托的研究任务，完成规划、执行、综合，返回结构化结果。

## 工作流程

1. **理解任务**：分析研究问题，判断复杂度和范围
2. **调用 ProReader 规划**：使用 `proreader` 工具生成 provider plan
   - 该工具返回：路由决策、provider 列表、executablePlan（含 action 列表）、stepGuard（超时/重试规则）、rescueLane（失败兜底）
3. **执行研究**：
   - 按 executablePlan.actions 逐条执行
   - action.kind = "agent_tool" → 调用对应的 websearch/webfetch 工具
   - action.kind = "mcp_tool" → 调用对应 MCP 工具
   - action.kind = "shell_command" / "harness_command" → 用 bash 执行
4. **失败处理**：
   - 遵循 stepGuard 的超时和重试规则
   - 步骤失败后收集到 failures 数组（记录失败原因和 URL），不阻塞整体流程
   - **不再**在 ProReader 上下文内调用 rescue 工具做 CDP 兜底——CDP rescue 由主 Agent 事后机械处理（见 2.3）
5. **判断复杂度**：
   - 满足以下任意两条 → 启动火力全开（spawn worker）：
     * 需要搜索 3 个以上独立 provider
     * 预期结果数量 > 15 条
     * 需要多源交叉验证
     * 涉及平台内搜索 + Web 搜索组合
6. **综合分析**：去重、排序、交叉验证、标注不可靠来源
7. **返回结果**：结构化输出返回主 Agent

## Worker 调度

当需要火力全开时，并行 spawn worker：
```
task({
  subagent_type: "proreader",
  description: "<简短任务描述>",
  prompt: "你是研究 Worker。只执行搜索/抓取，返回原始结构化数据。
任务：<具体搜索词和 provider>
工具：websearch, webfetch, read。
返回格式：[{title, url, snippet, provider, relevance_score}]"
})
```

每个 Worker 负责一类 provider 或一组搜索词。收集完所有 Worker 结果后综合。

## 输出格式

```json
{
  "status": "success|partial|failed",
  "summary": "一段话研究摘要",
  "sources": [
    {"title": "...", "url": "...", "provider": "...", "relevance": "high|medium|low"}
  ],
  "findings": [
    {"claim": "...", "confidence": "high|medium|low", "sources": ["url1", "url2"]}
  ],
  "failures": [
    {"url": "...", "reason": "timeout|blocked|empty_response", "provider": "..."}
  ],
  "method": "normal|full_power",
  "workerCount": 0,
  "warnings": ["部分来源未获取"],
  "suggestedActions": ["建议保存以下内容到 vault..."]
}
```

> failures 数组由主 Agent 接收后机械处理：CDP 可兜底（页面需 JS 渲染）→ headless Chrome 补抓 → save_markdown_note 补入；无法兜底 → 标记不可用。

## 禁止

- 不写 vault/kb/sqlite
- 不调用 save_markdown_note 或 kb_manage
- 不修改主 Agent 的会话状态
- 不扩大任务范围
```

### 4.1 从 browser-code.txt 搬入的内容

当前 `browser-code.txt` 中以下内容需搬入 ProReader 子代理 prompt：
- executablePlan.actions 的结构和 action kind 说明
- recommendedActionIndexes 的用法
- stepGuard 超时/重试/失败处理规则
- dynamicToolExposure 策略约束

> 注意：rescue lane 触发条件**不**搬入——CDP rescue 已降级为事后机械补充（见 2.3），ProReader 只收集 failures 不自行 rescue。

### 4.2 Team 编排约束（仅 prompt 级别）

ProReader 子代理的 Worker 调度走 OpenCode 原生 `task` spawning 机制。不需要额外调度器，只需在 prompt 中规定：
- **何时 spawn worker**：2/4 条复杂度条件满足时
- **Worker prompt 模板**：角色限制 + 工具白名单 + 输出格式
- **禁止**：Worker 内再 spawn（task 默认 deny 已在权限模型中处理）

主 Agent 的多步项目编排（如"研究 + PPT"）同理——TodoWrite 拆步 + 并行 task + 收集结果。ProReader 不负责任务编排，只负责研究。

---

## 5. 主 Agent Prompt 更新

### 5.1 browser-code.txt 变更

将 `# ProReader research routing` 段替换为：

```markdown
# Task routing

收到用户请求后，按以下框架判断走哪条通道：

## Direct 通道（主 Agent 直接处理）
满足以下任一条件：
- 请求包含明确 URL → URL 管道（webfetch → web_to_markdown → save）
- 请求是"记笔记"/"搜KB"/"管KB" → kb_manage / search_vault / save_markdown_note
- 请求是单一事实查询（"X是什么"且不涉及多源对比）→ webfetch 直接抓

## Research 通道（ProReader 子代理）
不满足 Direct 条件时，默认走 Research：
task({
  subagent_type: "proreader",
  description: "研究：<主题>",
  prompt: "研究问题：<用户原文>。返回结构化研究报告。"
})

## 判断原则
- 不确定时 → 走 Research（代价是一轮子代理，漏掉复杂任务的代价更大）
- 拒绝走 Research 的理由必须来自否定式边界：
  不需要多源对比、不需要跨平台搜索、不需要深度分析
- ProReader 返回后 → save_markdown_note 写入 vault → kb_manage 建 KB
```

### 5.2 KB Retrieval 段保持不变

阶段一已更新的 KB retrieval 段（kb_manage search/context + search_vault fallback）保持不变。

---

## 6. core-context.ts 改动

### 6.1 状态标记器化（从策略控制器 → 状态标记）

当前 `core-context.ts`（~430 行）做三件事：
1. URL 检测（dispatchInput）
2. ProReader 执行状态追踪（proreader_execute / proreader_save_confirmed）
3. 工具权限过滤（PREFLIGHT_TOOLS / EXECUTE_BASE_TOOLS / deriveAllowedTools）

改动：

1. **删除 `proreader_preflight` 阶段**：移除 `PREFLIGHT_TOOLS` 和相关拦截逻辑
2. **简化 phase 为三个**：
   ```typescript
   type BrowserCodePhase = "direct" | "research" | "save_confirmed"
   ```
3. **直接通道改名**：`l1_direct` → `direct`，全工具可用
4. **移除 proreader 的 tool 过滤**：`EXECUTE_BASE_TOOLS` 不再包含 `proreader`；`deriveAllowedTools()` 和 `allowToolForBrowserCodeCoreContext()` 中的 ProReader plan 工具过滤逻辑移除
5. **保留**：URL 管道检测、save 确认检测、LLM Wiki Lite 状态注入

目标：`core-context.ts` 从 ~430 行缩减到 ~200 行。

### 6.2 task.txt 更新

当前 `task.txt`（task 工具 prompt）第 1 条规则提到：

> "do not launch subagents as the first action for non-URL natural-language research. Let ProReader return a route/plan first"

这在转型后**过时了**——ProReader 本身就是子代理。改为：

> "do not launch subagents as the first action for non-URL natural-language research. Consider whether the task needs the ProReader subagent via task({subagent_type: 'proreader', ...})."

---

## 7. 文件改动清单

| 文件 | 操作 | 内容 |
|------|------|------|
| `.browser-code/browser-code.jsonc` | 修改 | 新增 agent.proreader 配置 |
| `opencode/packages/opencode/src/agent/agent.ts` | 不修改 | 已有 agent type 扩展机制，配置文件直接生效 |
| `opencode/packages/opencode/src/session/prompt/browser-code.txt` | 修改 | ProReader 段 → 路由框架；搬出 ProReader 使用说明 |
| `opencode/packages/opencode/src/browser-code/core-context.ts` | 修改 | 删除 preflight；简化 phase；移除工具过滤 |
| `opencode/packages/opencode/src/tool/task.txt` | 修改 | 更新第 1 条规则描述 |
| `.browser-code/tool/proreader.ts` | 修改 | 更新 tool description（目标用户从主 Agent 变为 ProReader 子代理） |
| `packages/research/src/enhanced-research.ts` | 不修改 | 保留阶段一标注，阶段二不碰 |
| 所有其他 `.browser-code/tool/*.ts` | 不修改 | — |

---

## 8. 不做

- ProReader 子代理不获得写入权限（save_markdown_note / kb_manage 被 deny）
- 不做多轮状态机 / Replan
- 不做动态工具暴露按阶段切换
- 不把 L0 爬虫 agent 化
- 不添加新 npm 依赖
- enhanced-research.ts 不改动（保留阶段一标注）
- 不实现 CDP rescue lane 三层实时监控（降级为主 Agent 事后机械补充，见 2.3）
- 不实现复杂的 Agent 队列/调度器（依赖 OpenCode 原生 TodoWrite + task）

### 8.1 CDP Rescue 简化（讨论结论）

- 原设计：三层 lane 架构中 CDP 层实时监控 ProReader tool 调用
- 阶段二问题：ProReader 成子代理后上下文隔离，主 Agent 无法穿透监控
- 简化方案：ProReader 返回 failures 数组 → 主 Agent 机械判断补入 → 直接用 save_markdown_note 补
- 不重新注入 ProReader 上下文，因为 CDP 补齐是纯机械操作不需研究判断

---

## 9. 验收标准

- [ ] ProReader 子代理可被主 Agent 通过 task tool spawn
- [ ] ProReader 子代理拥有独立上下文（不包含主 Agent 对话历史）
- [ ] ProReader 子代理可以调用 proreader tool 生成 plan
- [ ] ProReader 子代理可以自行执行 plan 中的搜索/抓取步骤
- [ ] 火力全开模式下 ProReader 可以 spawn worker 子代理
- [ ] Worker 子代理无权再递归 spawn（task 被 deny）
- [ ] ProReader 子代理无权写 vault/kb（write/save_markdown_note/kb_manage 被 deny）
- [ ] 主 Agent 收到 ProReader 结构化结果后可以写入
- [ ] Direct 通道不受影响（URL 抓取、KB 搜索、写笔记正常）
- [ ] core-context.ts 不再自动拦截非 URL 请求
