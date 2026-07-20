# Retrieval Policy

## Goal

When answering a user question, BrowserCode should not scan the entire vault randomly.

It should use the Lite retrieval flow:

1. Search claims
2. Search topics/entities
3. Search sources
4. Build answer_context
5. Answer from answer_context

## Priority

Use evidence in this order:

1. Claims
2. Topic / Entity pages
3. Source pages
4. Query logs

## Insufficient Context

If retrieved context is insufficient:
- say what is missing
- suggest which source/topic should be added
- do not fabricate

## Query Logs

For complex answers, save a query log under `kb/queries`.

## 语义检索（Semantic Hybrid）

默认使用混合检索（FTS5 + 语义），由 kb_manage search 自动启用。

检索优先级：
1. Claims（语义相似度 + FTS5 RRF 融合，kind_boost=3）
2. Topics/Entities（标准 FTS5，kind_boost=2/1）
3. Sources（FTS5 末位，kind_boost=0）

使用 `--facts-only` 排除合成/推演产物（synthesized/speculated）。
