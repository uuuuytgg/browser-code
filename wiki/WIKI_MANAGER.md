# Wiki Manager Policy

## Role

You maintain the BrowserCode LLM Wiki Lite layer.

The Markdown vault is the source of truth.
The SQLite index is only a rebuildable search cache.

## Allowed Actions

You may:
- create new topic pages when a source clearly introduces a new recurring theme
- create new entity pages for tools, projects, concepts, frameworks, people, or organizations
- append links from topic/entity pages to sources and claims
- append related topics/entities
- create query logs when answering complex questions

## Forbidden Actions

You must not:
- delete source files
- delete reviewed pages
- merge topics automatically
- overwrite existing stable definitions
- rewrite large parts of reviewed pages
- convert speculation into fact
- run an infinite autonomous loop

## Update Style

Prefer appending small managed sections instead of rewriting whole pages.

Use managed blocks when possible:

```markdown
<!-- browsercode:managed:start related-claims -->
...
<!-- browsercode:managed:end related-claims -->
```

## LLM 反哺（Synthesize & Speculate）

KB 有两个 LLM 反哺能力，均需用户确认后执行：

**Synthesize（合成）**：合并同主题多条 claims 为一条精炼 version。
- 触发：kb_manage({action: "synthesize"})
- 写入规则：见 CLAIM_POLICY.md 合成规则
- 原 claims 不删，只标记合并关系

**Speculate（推演）**：基于已有知识推理趋势/假设。
- 触发：kb_manage({action: "speculate"})
- 写入规则：所有推测产物 confidence=low，写入 topic 页 LLM 推演 managed block
- 严禁与事实 claims 混排
- 严禁从单条 claim 推演（至少需要 3 条 related claims）
