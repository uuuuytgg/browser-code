# 05 Agent Runtime 核心循环

## 1. 职责

Runtime 是这个系统的 agent 大脑和执行循环。

它负责：

```text
1. 接收任务。
2. 推断 agent mode。
3. 构造 LLM 上下文。
4. 注入工具 schema。
5. 调模型。
6. 解析模型输出。
7. 校验工具调用。
8. 权限检查。
9. 执行工具。
10. 记录 session。
11. 循环直到 final。
```

## 2. 目录

```text
apps/runtime/src/
├─ runtime.ts
├─ agent/
│  ├─ loop.ts
│  ├─ context-builder.ts
│  ├─ output-parser.ts
│  ├─ task-runner.ts
│  └─ agent-modes.ts
├─ model/
├─ tools/
├─ session/
└─ config/
```

## 3. Agent Mode

```ts
type AgentMode = "reader" | "curator" | "media" | "resource" | "librarian"
```

映射：

```ts
function inferMode(task) {
  switch (task.task_type) {
    case "save_page":
    case "save_selection":
      return "curator"
    case "summarize_video":
      return "media"
    case "scan_resources":
      return "resource"
    case "search_vault":
      return "reader"
    default:
      return "reader"
  }
}
```

## 4. 最小循环

```ts
while (!session.done) {
  const context = buildContext(task, session, toolRegistry)
  const output = await model.generate(context)
  const parsed = parseModelOutput(output)

  if (parsed.type === "final") {
    return finish(parsed.answer)
  }

  if (parsed.type === "tool_call") {
    const valid = toolRegistry.validate(parsed.tool_call)
    if (!valid.ok) {
      session.addError(valid.error)
      continue
    }

    const permission = permissionGuard.check(parsed.tool_call, mode)
    if (permission.decision === "confirm") {
      return needConfirmation(parsed.tool_call)
    }
    if (permission.decision === "deny") {
      session.addError(permission.reason)
      continue
    }

    const result = await toolRouter.execute(parsed.tool_call)
    session.addToolResult(result)
  }
}
```

## 5. 最大步数

```text
save_page：6
summarize_video：8
scan_resources：5
search_vault：4
默认：8
```

防止模型死循环。

## 6. 输出格式

tool_call：

```json
{
  "type": "tool_call",
  "tool_call": {
    "name": "web_to_markdown",
    "input": {}
  }
}
```

final：

```json
{
  "type": "final",
  "answer": {
    "message": "已保存",
    "note_id": "20260624_xxx",
    "file_path": "vault/articles/xxx.md"
  }
}
```

## 7. Session 日志

```text
temp/sessions/{task_id}.jsonl
```

事件：

```text
task_received
model_output
tool_call
tool_result
error
final
```

## 8. 验收

```text
MockModelProvider 能驱动 mock web_to_markdown
ToolRouter 能执行 mock tool
save_page task 最终返回 note_id
超过 max steps 会失败
schema 错误会返回给模型重试
```
