---
title: "Qwen-AgentWorld: The World Model for Agents"
source_url: "https://www.youtube.com/watch?v=VzmMQWRhlBw"
date: 2026-06-27
tags: [qwen, agent-world, world-model, rl, reinforcement-learning, agent-framework, open-source]
channel: Sam Witteveen
channel_url: https://www.youtube.com/channel/UC55ODQSvARtgSyc8ThfiepQ
published: 2026-06-25
duration: 16:31
views: ~16K
---

# Qwen-AgentWorld：给 Agent 用的世界模型

## 什么是 AgentWorld？

Qwen 发布了 **AgentWorld** —— 一个**语言世界模型**，它会自己"脑补"环境，预测 agent 执行某个动作后会发生什么。传统方式需要在真实环境里跑 agent（又贵又慢），AgentWorld 直接在模型里模拟出结果。

### 支持 7 个领域

1. 终端 / CLI
2. 软件工程
3. 网页搜索
4. MCP 工具
5. 网页浏览器
6. 桌面操作系统
7. Android 操作系统

## 两大用途

### 1. 作为模拟器（强化学习训练）
- 替代昂贵的真实沙箱环境（比如跑虚拟机+浏览器做 web 任务）
- Agent 在廉价、快速的"脑补"环境里训练
- 用 LLM 当裁判给 agent 的轨迹打分
- 训练完后，agent 学到的知识可以直接迁移回真实环境

### 2. 让 Agent 更聪明（世界感知推理）
- 教模型**做动作之前先想象后果**，能提升推理能力和自我反思
- 模型学会预测结果 → 做出更好的决策

## 模型规格

| 版本 | 总参数量 | 激活参数量 |
|------|---------|-----------|
| 小模型（已开源） | 35B | 3B（MoE） |
| 大模型（未发布） | 397B | 17B（MoE） |

## 训练流水线："CPT 注入，SFT 激活，RL 打磨"

### 第一阶段 — 持续预训练（CPT）
- 上百万条真实世界的 **动作→观察** 轨迹，覆盖全部 7 个领域
- 加上世界知识语料库：法律、医学、金融、网络安全
- 教会模型*什么动作会导致什么结果*

### 第二阶段 — 监督微调（SFT）
- 约 7,000 条高质量的**思考**轨迹
- 拒绝采样（只保留成功的轨迹）
- 教会模型*如何推理动作序列*

### 第三阶段 — 强化学习（RL）
- LLM 当裁判，从 5 个维度打分：格式、事实性、一致性、真实感、质量
- 再加上基于规则的验证器做确定性检查
- **结果**：准确率从 69.9% 飙升到了 **78.3%**

## 基准测试结果

- **Terminal Bench**：大幅提升
- **SWE-Bench Pro**：大幅提升
- **Open Claw Personal Agent**：大幅提升

## 核心收获

> 世界模型不只是模拟器，更是一种思维工具。让 agent 先想象行动后果再做决策，推理质量、自我反思和真实世界表现都会上一个台阶。

## 相关链接
- [Qwen AgentWorld GitHub](https://github.com/QwenLM/AgentWorld)
- [Sam Witteveen 原视频](https://www.youtube.com/watch?v=VzmMQWRhlBw)
