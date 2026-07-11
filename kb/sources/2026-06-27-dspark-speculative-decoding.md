# DSpark — DeepSeek 投机解码提速 85%

## Metadata

source_type: video
source_url: https://www.youtube.com/watch?v=EMs7jHxIPyM
captured_at: 2026-06-29
status: active

## Summary

DeepSeek 发布 DSpark 投机解码（Speculative Decoding）模块，搭载在 DeepSeek V4 Pro DSpark 模型上，使文本生成速度提升 60%~85% 而输出质量不变。核心思路是"猜得更好，验得更聪明"（Draft Better, Verify Smarter）。

## Key Points

- 不是新模型，而是给 V4 Pro 检查点额外加投机解码模块
- 草稿模型并行猜测 → 大模型一次性验证
- 两大创新：让猜测能看到前文（解决猜测脱节）+ 置信度调度器（解决验证瓶颈）
- 聊天场景提升最明显
- 完全开源：模型权重 HF + 训练代码库 DeepSpec

## Related Topics

- speculative-decoding
- deepseek
- ai-inference

## Original Reference

vault/videos/2026-06-27__DSpark-DeepSeek-Just-Made-Inference-85%-Faster__EMs7jHxIPyM.md
