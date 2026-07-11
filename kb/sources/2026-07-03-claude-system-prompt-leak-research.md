# Claude System Prompt Leak Research — Full Findings

## Metadata

source_type: article
source_url: https://github.com/asgeirtj/system_prompts_leaks
captured_at: 2026-07-03
status: active

## Summary

对近期 Claude/Anthropic 系统提示词泄露事件的研究汇总。涉及通过 prompt injection / jailbreak 手法从 Claude 模型中提取 system prompt 的多种方法、泄露内容分析、以及 Anthropic 的应对措施。涵盖了多轮攻击、伪装角色、越狱 prompt 等手法及其实际效果。

## Key Points

- 泄露事件集中发生在 2026 年中，涉及多个独立研究者和安全团队
- 攻击手法包括角色伪装、多轮诱导、和基于上下文的 prompt injection
- 泄露内容包含 Claude 的核心系统指令、安全边界定义、和输出格式约束
- Anthropic 通过动态 prompt 混淆和运行时检测来应对
- 泄露的系统 prompt 显示了 Anthropic 对模型行为控制的深度

## Related Topics

- system-prompt-security
- claude
- anthropic
- llm-security
- prompt-injection

## Original Reference

vault/articles/claude-system-prompt-leak-research.md
