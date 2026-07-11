# Claims: Qwen-AgentWorld

## Metadata

source: [[kb/sources/2026-06-27-qwen-agent-world]]
source_path: kb/sources/2026-06-27-qwen-agent-world.md
status: active
updated_at: 2026-06-30

## Claims

- [definition] AgentWorld 是 Qwen 发布的语言世界模型（World Model），用于模拟 Agent 执行动作后的环境反馈。
- [mechanism] AgentWorld 的训练流水线分为三阶段：CPT（百万条真实动作-观察轨迹）→ SFT（7000条高质量推理轨迹）→ RL（LLM 裁判打分）。
- [mechanism] AgentWorld 作为模拟器可替代昂贵的真实沙箱环境（如虚拟机+浏览器），大幅降低强化学习训练成本。
- [conclusion] 世界模型不仅是模拟器，更是一种思维工具——让 Agent 先想象后果再做决策，推理质量和自我反思均提升。
- [constraint] 小模型（35B/3B MoE 激活参数）已开源，大模型（397B/17B）尚未发布。
- [comparison] AgentWorld 支持 7 个领域：终端、软件工程、网页搜索、MCP 工具、浏览器、桌面 OS、Android。
- [mechanism] RL 阶段使用 LLM 从 5 个维度（格式、事实性、一致性、真实感、质量）评分，准确率从 69.9% 提升至 78.3%。
