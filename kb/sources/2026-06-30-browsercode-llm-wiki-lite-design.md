# BrowserCode LLM Wiki Lite Technical Design

## Metadata

source_type: document
source_url: file:///C:/Users/lishi/Downloads/browsercode_llm_wiki_lite_tech_design.md
captured_at: 2026-06-30
status: active

## Summary

BrowserCode LLM Wiki Lite 是在现有 browser-code 网页/视频转 Markdown 入库能力基础上新增的轻量 Wiki 检索层。它通过 claims（原子知识）、topics（主题串联）、entities（实体聚合）和 SQLite FTS 全文检索，防止知识库膨胀后 AI 难以查找和串联内容。

## Key Points

- 不做向量检索，不做复杂 gardener loop，不做自动主题合并
- Markdown 是正本，SQLite 只是可重建的检索缓存
- Claims 是 AI 回答的最小知识单元，每条只表达一个事实/机制/结论
- Topic 页面串联多个来源和 claims，Entity 页面记录工具/项目/概念
- 回答问题前先通过 make_answer_context.ts 生成稳定上下文
- 使用 managed block 机制防止 AI 重写 topic/entity 正文

## Details

数据分层：
- Source 层：kb/sources/，保存原始资料的 Markdown 总结
- Claim 层：kb/claims/，从 source 中拆出的可复用事实/定义/机制/约束/结论
- Topic 层：kb/topics/，串联多个 source/claims，形成主题页面
- Entity 层：kb/entities/，记录工具、项目、概念、框架、人物等实体
- Query 层：kb/queries/，保存复杂问题的检索路径和回答记录

检索流程：用户问题 → 搜索 claims → 搜索 topics/entities → 搜索 sources → 合并结果 → 生成 answer_context.md → 交给 LLM 回答

SQLite FTS 使用单表 documents_fts，kind 字段区分 source/claim/topic/entity。排序策略使用 kind boost：claim +3, topic +2, entity +1, source +0。中文检索使用 LIKE fallback 弥补 FTS5 中文分词不足。

## Related Topics

- browsercode-llm-wiki-lite
- hybrid-retrieval

## Original Reference

设计文档完整版位于用户本地：`C:\Users\lishi\Downloads\browsercode_llm_wiki_lite_tech_design.md`
