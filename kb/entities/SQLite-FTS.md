# SQLite FTS5

## Metadata

status: active
updated_at: 2026-06-30

## Description

SQLite FTS5（全文搜索引擎）是 BrowserCode 知识库的检索缓存层。支持标准 FTS5 查询语法和中文 LIKE fallback。Markdown 文件是正本，SQLite 只是可重建的检索缓存。

## Implementation

在 BrowserCode 项目中：
- `harness/build_index.ts` — 扫描 kb/ 构建 FTS5 全文索引
- `harness/search.ts` — 支持 FTS MATCH + LIKE fallback + kind boost 排序
- `harness/make_answer_context.ts` — 生成 answer_context.md（四层结构）

## Principles

- claims 权重 +3，topics +2，entities +1，sources +0
- answer_context 限制：claims max 6, topics max 3, entities max 3, sources max 3
- 排序输出按 rank DESC + kind boost + updated_at DESC

## Related Topics

- sqlite-fts
- retrieval

## Sources

- kb/sources/2026-06-30-kb-design.md
