---
id: "20260627_EMs7jHxIPyM"
title: "DSpark — DeepSeek Just Made Inference 85% Faster"
source_url: "https://www.youtube.com/watch?v=EMs7jHxIPyM"
source_platform: "youtube"
content_type: "video"
date: "2026-06-27"
captured_at: "2026-06-29T00:00:00.000Z"
author: "Fahd Mirza"
author_url: "https://www.youtube.com/@fahdmirza"
tags:
  - DeepSeek
  - DSpark
  - speculative-decoding
  - inference-speed
  - AI
  - open-source
keywords:
  - DSpark
  - DeepSeek V4 Pro DSpark
  - speculative decoding
  - inference optimization
  - DeepSpec
status: "processed"
duration: 529
---

# DSpark — DeepSeek Just Made Inference 85% Faster

> UP主：**Fahd Mirza** | 时长：8 分 50 秒 | 平台：YouTube
> 发布于：2026-06-27 | 播放量：7,677 | 点赞：288

---

## 核心内容

DeepSeek 发布了 **DSpark**，一个**投机解码（Speculative Decoding）** 模块，搭载在 **DeepSeek V4 Pro DSpark** 模型上。

> **这并非新模型**，而是给原有 V4 Pro 检查点额外装了一个投机解码模块，使得文本生成速度快了 **60% ~ 85%**，输出质量不变。

---

## 技术原理

### 常规方式（慢）

大模型一次生成一个 token，每步都要完整跑一遍整个模型。

### DSpark 方式（快）

1. **草稿模型并行猜**：一个快速的小模型同时猜出接下来几个 token
2. **大模型一次性验证**：大模型一次验证所有猜测，保留对的，修正错的

DSpark 解决了两大痛点：

| 痛点 | DSpark 的解法 |
|------|-------------|
| **猜测脱节**：并行猜测的 token 之间互不知情，导致后半段猜的准确率暴跌 | 加入一个轻量级"头"，让每个猜测能看到它前面的 token——**小改动，大效果**，猜测块的尾部不再崩坏 |
| **验证瓶颈**：高负载下验证所有猜测会堵死系统 | 给每个猜测打分（置信度），调度器根据系统负载动态调整——负载低时多查，负载高时只查靠谱的，丢弃低置信度猜测 |

**一句话**：**"猜得更好，验得更聪明"（Draft Better, Verify Smarter）**

### 执行流程图示

1. 大模型读入 prompt ABC，生成真实 token **D**
2. D 触发猜测阶段：并行块 + 轻量级顺序块猜测接下来 4 个 token **EFGH**，每个附带置信度分数 C
3. 调度器根据置信度和系统负载，保留 **E、F、G**，丢弃低置信度的 **H**
4. 大模型一次性验证 **E、F、G**：**E、F** 正确接受，**G** 错误被替换为 **G\***
5. 循环继续，每轮锁定多个 token 而非逐个生成

---

## 实测数据

- 在 **数学、代码、聊天** 三类任务上，DSpark 全面优于当前两个领先方法（Eagle 3 和 Dflash）
- **聊天场景**提升最明显——最难预测的任务上差距最大
- 生产环境实测：**DSpark（绿线）全面压制旧系统（蓝线）**，意味着每个用户更快 + 同时服务更多用户
- 旧系统完全跟不上的高负载场景，DSpark 解锁了此前不可能达到的速度

---

## 已知注意事项

- DeepSeek **已全部开源**：
  - 模型权重：`huggingface.co/deepseek-ai/DeepSeek-V4-Pro-DSpark`
  - 训练代码库：**DeepSpec**（链接在视频描述）
- 本地部署方式与原始 DeepSeek V4 基本相同
- ⚠️ **本次没有标准的 chat template 文件**，而是提供了一个 Python 编码文件夹，内含 `encode_message` 函数和测试用例，需要手动编码/解析输入格式（支持 thinking mode flag）

---

## 展望

投机解码正从"巧妙的附加组件"变成"前沿模型推理服务的默认标配"。DeepSeek 把训练配方完全开源后，这个"猜得更好、验得更聪明"的模式很快会扩散到其他开源模型中，意味着**更快、更便宜的推理对所有人可用**，而不仅限于大实验室。

---

## 视频元数据

| 指标 | 数据 |
|------|------|
| 播放量 | 7,677 |
| 点赞 | 288 |
| 时长 | 8:50 |
| 分类 | Science & Technology |
