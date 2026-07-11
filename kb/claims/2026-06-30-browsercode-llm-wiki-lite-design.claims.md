# Claims: BrowserCode LLM Wiki Lite Technical Design

## Metadata

source: [[kb/sources/2026-06-30-browsercode-llm-wiki-lite-design]]
source_path: kb/sources/2026-06-30-browsercode-llm-wiki-lite-design.md
status: active
updated_at: 2026-06-30

## Claims

- [definition] BrowserCode LLM Wiki Lite 是一个 Markdown 正本 + Claims 原子层 + Topic/Entity 串联层 + SQLite FTS 检索层的轻量知识库管理方案。
- [constraint] Lite 版不做向量检索、不做自动合并 topic、不做复杂 gardener loop。
- [constraint] SQLite 只是可重建的检索缓存，不是正本；Markdown 是正本。
- [definition] Claims 是 AI 回答的最小知识单元，每条只表达一个事实、机制或结论，1~2 句话。
- [definition] Topic 页面用于串联多个来源和 claims，Entity 页面用于记录工具、项目、概念等实体。
- [mechanism] 检索流程：搜索 claims → 搜索 topics/entities → 搜索 sources → 合并结果 → 生成 answer_context → LLM 回答。
- [mechanism] 排序策略使用 kind boost：claim +3, topic +2, entity +1, source +0。
- [mechanism] 中文检索使用 LIKE fallback 弥补 FTS5 中文分词不足。
- [constraint] AI 默认只改 managed block 内部，不允许重写 block 外的人工定义区。
- [procedure] Phase 实施顺序：建目录→claims 生成→build_index→search→make_answer_context→topic/entity 半自动维护。
