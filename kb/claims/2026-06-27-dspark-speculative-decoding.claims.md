# Claims: DSpark 投机解码

## Metadata

source: [[kb/sources/2026-06-27-dspark-speculative-decoding]]
source_path: kb/sources/2026-06-27-dspark-speculative-decoding.md
status: active
updated_at: 2026-06-30

## Claims

- [definition] DSpark 是 DeepSeek 发布的投机解码（Speculative Decoding）模块，搭载于 DeepSeek V4 Pro DSpark。
- [mechanism] 投机解码机制：草稿模型并行猜测多个 token → 大模型一次性验证，保留正确的修正错误的。
- [comparison] DSpark 使文本生成速度提升 60%~85%，输出质量保持不变。
- [mechanism] DSpark 两大创新：① 轻量级"头"让每个猜测能看到前文，解决猜测脱节；② 置信度调度器根据系统负载动态调整验证深度。
- [comparison] 在数学、代码、聊天三类任务上，DSpark 全面优于 Eagle 3 和 Dflash。
- [open-question] DSpark 没有标准 chat template 文件，需要手动编码/解析输入格式。
- [conclusion] 投机解码正从"巧妙的附加组件"变成"前沿模型推理服务的默认标配"。
- [constraint] DeepSeek V4 Pro DSpark 已完全开源，权重在 Hugging Face，训练代码库为 DeepSpec。
