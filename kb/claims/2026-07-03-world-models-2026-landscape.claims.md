# Claims: 2026 世界模型全景

## Metadata

source: [[kb/sources/2026-07-03-world-models-2026-landscape]]
source_path: kb/sources/2026-07-03-world-models-2026-landscape.md
status: active
updated_at: 2026-07-03

## Claims

- [definition] 世界模型是通过学习环境状态与观测的演化规律，构建能够进行未来预测、内部仿真、规划搜索和行动决策的模型框架。
- [paradigm-shift] Orca 论文（2026-07）提出"预测下一个状态"新范式，取代 GPT 的"预测下一个词"、Sora 的"预测下一帧"和机器人模型的"预测下一个动作"。
- [paradigm-shift] 英伟达 Jim Fan：下一个词预测是第一个预训练范式，世界建模（下一个物理状态预测）是第二个预训练范式。
- [comparison] Jim Fan 认为 VLM 本质是以语言为中心的架构，视觉仍是二等公民，世界模型需要以视觉为中心的架构，视觉占大脑皮层 1/3 而语言只是紧凑区域。
- [mechanism] Genie 3（DeepMind）一张静态图即可生成可交互 2D 游戏世界，1080p 分辨率，完全来自无标注视频训练。
- [mechanism] V-JEPA 2（Meta/LeCun）坚持"预测表征而非像素"路线，以 1/50 算力追平视频生成范式的性能。
- [mechanism] NVIDIA Cosmos 2 引入"物理对齐 token"，减少 Sim-to-Real 落差，专门服务机器人/自动驾驶。
- [mechanism] 小鹏 X-Mind 采用循环块扩散机制，单次前向传播生成紧凑抽象草图，轨迹预测误差显著降低，具备车规级量产可行性。
- [mechanism] 地平线 HSD V2.0 基于世界模型 + 端到端强化学习，无接管里程提升 56%，博弈能力提升 167%，已 OTA 推送。
- [paper] WorldDirector（2026-07）将语义运动编排与视觉生成解耦，支持持久动态对象记忆和不受限视点探索。
- [paper] DreamForge-World 0.1（2026-06）低算力实时交互世界模型，单张 RTX 4090 以 480p 达 14-15 FPS。
- [paper] MemLearner（2026-06）为视频世界模型学习查询上下文记忆，解决长时生成的场景不一致问题。
- [paper] Valdi（Value Diffusion World Models, 2026-07）将端到端在线 MPC 与潜在扩散动力学结合。
- [policy] 韩国（2026-07）发布物理 AI 国家战略，以世界模型仿真推演为三大核心技术之一。
- [policy] 中国市场监管总局加快智能体、具身智能、世界模型等前沿技术标准制定。
- [open-question] Jim Fan 提出系列开放问题：像素重建是否最优目标？需要多少机器人数据？远程操作扩展是否可行？何时迎来机器人 GPT-3 时刻？
- [open-question] 前英伟达机器人主管 Arsalan Mousavian 指出世界模型需要解决：几何一致性、同一性保持、推理速度、动作采样。
- [conclusion] 2026 年被定义为世界模型全面爆发元年，AI 从"预测下一个词"跨越至"预测世界下一状态"的认知范式革命。
