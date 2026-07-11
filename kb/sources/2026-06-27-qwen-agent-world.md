# Qwen-AgentWorld：给 Agent 用的世界模型

## Metadata

source_type: video
source_url: https://www.youtube.com/watch?v=VzmMQWRhlBw
captured_at: 2026-06-29
status: active

## Summary

Qwen 发布 AgentWorld，一个语言世界模型（World Model）。它会自己"脑补"环境，预测 agent 执行某个动作后的结果，替代昂贵的真实沙箱环境。支持 7 个领域（终端、软件工程、网页搜索、MCP 工具、浏览器、桌面 OS、Android）。

## Key Points

- 两大用途：作为模拟器做强化学习训练，以及让 Agent 做世界感知推理
- 训练流水线：CPT 注入（百万条真实轨迹）→ SFT 激活（7000条思考轨迹）→ RL 打磨（LLM 裁判从5维度打分）
- 小模型（35B/3B MoE）已开源，大模型（397B/17B）未发布
- RL 阶段准确率从 69.9% 提升至 78.3%
- 在 Terminal Bench、SWE-Bench Pro 等基准测试中大幅提升

## Related Topics

- world-model
- agent-framework
- qwen

## Original Reference

vault/videos/2026-06-27__Qwen-AgentWorld-The-World-Model-for-Agents__VzmMQWRhlBw.md
