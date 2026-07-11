# Capture Workflow

## 架构

```
                                ┌───────────────────────┐
  git commit (vault/ 变化) ────▶│  .githooks/post-commit │  ← 自动触发
                 ┌─────────────▶│  (自动调用 enqueue)    │
                 │              └───────────────────────┘
                 │
  手动调用 ───────┤
                 │
                 ▼
       ┌─────────────────┐          ┌────────────────────┐
       │  kb:enqueue      │  ──────▶│  processing_queue  │
       │  (<vault-path>)  │         │  (SQLite 状态表)    │
       └─────────────────┘          └─────────┬──────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │  kb:process-queue  │  ← 状态机
                                    │  step 0 → 1 → 2 → 3 │
                                    └─────────┬──────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────┐
                    ▼                         ▼                     ▼
           step 0→1:                   step 1→2:             step 3→4:
        kb/sources/ 存在?           kb/claims/ 存在?       重建 FTS 索引
        (手动创建 source)           (手动提取 claims)       (全自动)
```

## 使用方式

### 方式 A：一键快捷（手动保存后）

```bash
# 入队 + 处理，一步完成
bun run kb:after-capture vault/articles/<note>.md
```

### 方式 B：分步执行（推荐，更清晰）

```bash
# 1. 入队
bun run kb:enqueue vault/articles/<note>.md

# 2. 处理（可多次执行，每次自动推进一步）
bun run kb:process-queue

# 2a. 如果提示创建 source → 手动创建 kb/sources/YYYY-MM-DD-*.md
# 2b. 重新运行 process-queue，继续推进
bun run kb:process-queue

# 2c. 如果提示创建 claims → 手动提取原子知识
# 2d. 重新运行 process-queue，自动重建索引
bun run kb:process-queue
```

### 方式 C：Git 自动触发

```bash
# 一次性安装（每个 clone 只需运行一次）
bun run kb:install-hooks

# 之后每次 git commit 涉及 vault/ 变化，自动入队
# 然后手动运行: bun run kb:process-queue
```

### 方式 D：跳过 claims 的快速路径

```bash
bun run kb:enqueue vault/articles/<note>.md --skip-claims
```

## 状态机

| Step | Status | 含义 | 自动化 | 人工 |
|------|--------|------|--------|------|
| 0 | pending | 已入队，等待处理 | — | — |
| 1 | source_done | kb/sources/ 已创建 | 检查文件存在 | 写 source 总结 |
| 2 | claims_done | kb/claims/ 已提取 | 检查文件存在 | 提取原子知识 |
| 3 | topics_done | topics/entities 已检查 | 自动推进（仅警示） | 补充引用 |
| 4 | done | 索引重建完成 | 自动重建 FTS | — |

## 一次性验证全绿

```bash
bun run kb:process-queue
# 输出中不应有任何 ⏳ 或 ❌
```

## Source 模板

```markdown
# 标题

## Metadata

source_type: webpage | video | transcript | document | manual
source_url:
captured_at:
status: draft | active | reviewed | stale

## Summary

## Key Points

## Details

## Related Topics

## Original Reference
```

## Claims 模板

参考 `kb/claims/.template.md`。

## 规则

- claims 每条只表达一个事实/机制/结论
- 禁止把猜测写成事实
- 所有 claims 必须有 `source_path`
- claims 不超过 1~2 句话
