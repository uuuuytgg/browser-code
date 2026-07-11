# Claims: Claude System Prompt Leak Research

## Metadata

source: [[kb/sources/2026-07-03-claude-system-prompt-leak-research]]
source_path: kb/sources/2026-07-03-claude-system-prompt-leak-research.md
status: active
updated_at: 2026-07-03

## Claims

- [mechanism] 通过角色伪装（role-play）和多轮诱导可以绕过 Claude 的安全边界，使其泄露系统提示词
- [mechanism] 动态 prompt 混淆（Dynamic Prompt Obfuscation）使每次请求的 system prompt 编码不同，增加逆向难度
- [constraint] Anthropic 的运行时检测（Runtime Detection）能在推理过程中识别并阻断 prompt injection 攻击
- [warning] 泄露的系统提示词包含模型安全边界的具体定义，可被用于针对性越狱
- [conclusion] 没有绝对安全的 system prompt，安全依赖于多层级防御：混淆 + 检测 + 动态更新
- [open-question] 动态混淆对模型推理质量的影响尚未被充分研究
