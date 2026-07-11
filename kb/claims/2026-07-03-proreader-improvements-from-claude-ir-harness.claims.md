# Claims: ProReader 改进方案

## Metadata

source: [[kb/sources/2026-07-03-proreader-improvements-from-claude-ir-harness]]
source_path: kb/sources/2026-07-03-proreader-improvements-from-claude-ir-harness.md
status: active
updated_at: 2026-07-03

## Claims

- [mechanism] Claude IR Harness 使用多阶段检索管线：意图分类 → 源选择 → 并行检索 → 结果融合
- [mechanism] 质量门控（Quality Gate）通过置信度阈值过滤低质量检索结果，防止噪声进入上下文
- [mechanism] 上下文压缩（Context Compression）在注入 LLM 前对检索结果进行摘要和去重，减少 token 消耗
- [conclusion] 查询类型（事实型/分析型/指令型）应动态决定路由策略和检索源选择
- [design-pattern] 并行检索多个源后用融合排序（Fusion Ranking）合并结果，优于单源串行检索
- [design-pattern] 可以缓存常见查询的检索结果以减少重复检索，但需设计缓存失效策略
