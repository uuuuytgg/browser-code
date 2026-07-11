# ProReader 改进方案：从 Claude IR Harness 借鉴的设计模式

## Metadata

source_type: article
source_url: https://github.com/asgeirtj/system_prompts_leaks
captured_at: 2026-07-03
status: active

## Summary

分析 Claude IR Harness（信息检索框架）的设计模式，提出 ProReader 的改进方案。覆盖了多源路由、结果融合、质量门控、上下文压缩等核心模式，以及如何在 ProReader 中应用这些设计来提升检索和问答质量。

## Key Points

- Claude IR Harness 使用多阶段检索管线：意图分类 → 源选择 → 并行检索 → 结果融合
- 质量门控（Quality Gate）确保只有高置信度的结果进入上下文
- 上下文压缩（Context Compression）减少 token 浪费
- 路由决策基于查询类型动态选择搜索引擎和 MCP 工具
- 可缓存常见查询结果以减少重复检索

## Related Topics

- proreader
- claude
- information-retrieval
- architecture
- design-pattern
- research

## Original Reference

vault/articles/proreader-improvements-from-claude-ir-harness.md
