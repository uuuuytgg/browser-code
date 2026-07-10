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
