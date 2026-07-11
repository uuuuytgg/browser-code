---
title: "How Model Context Protocol (MCP) actually works"
source_url: "https://www.youtube.com/watch?v=cGuyrANVi4A"
date: 2026-06-29
tags: [mcp, model-context-protocol, ai, llm, agent, google-cloud, api]
author: "Google Cloud Tech"
speaker: "Smitha Kolan"
duration: 478
---

# How Model Context Protocol (MCP) actually works

> Google Cloud Tech 出品的视频，Smitha Kolan 讲解 MCP（Model Context Protocol）的核心原理、设计动机，以及为什么 MCP 正在成为 AI Agent 连接外部工具和数据的新标准。

## 视频概要

| 项目 | 内容 |
|------|------|
| 时长 | ~8 分钟 |
| 上传者 | Google Cloud Tech |
| 主讲 | Smitha Kolan |
| 链接 | [YouTube](https://www.youtube.com/watch?v=cGuyrANVi4A) |

## 章节

| 时间 | 章节 |
|------|------|
| 0:00 | 引言：API 与 AI 的问题 |
| 0:48 | 什么是 Model Context Protocol (MCP) |
| 1:26 | MCP 能连接什么 |
| 2:43 | MCP 如何工作：客户端 vs 服务端 |
| 4:03 | MCP 核心组件：Tools, Prompts, Resources & Context |
| 5:20 | MCP vs API：区别是什么 |
| 6:43 | 实战演示：用 MCP 构建 AI 助手 |
| 7:48 | 总结 |

## 核心要点

### 1. 为什么需要 MCP？

- **API 是给确定性程序设计的**，AI 模型是概率性推理的，两者不匹配
- 每次集成新工具都需要写"胶水代码"（glue code），脆弱且难以维护
- MCP 提供了一个**统一标准**，让模型能以一致方式发现和使用外部资源

### 2. MCP 是什么？

- MCP 是一个**开放标准**，用于连接模型与工具、数据和上下文
- 本质上是模型和周围系统之间的**共享语言**
- 由 **Anthropic** 提出，正被行业广泛采纳

### 3. 核心架构：客户端 vs 服务器

- **客户端 (Client)**：语言模型或 Agent 系统（如 Claude、Gemini、OpenAI Agent）
- **服务器 (Server)**：暴露资源的环境（数据库、文件系统、内部工具、文档搜索引擎）
- 通信通过**标准化的 JSON schema** 进行，客户端发送请求如 "列出可用资源"、"调用此操作"、"获取此数据"

### 4. 四大核心组件

| 组件 | 说明 |
|------|------|
| **Tools (工具)** | 模型可调用的操作（搜索数据库、发送邮件、分析文件等） |
| **Resources (资源)** | 数据和状态（文本文档、数据库行、图片等） |
| **Prompts (提示)** | 可复用的模板，描述模型在特定任务中的行为 |
| **Context (上下文)** | 外部信息（聊天历史、公司数据、用户偏好等） |

### 5. MCP vs API

| 维度 | API | MCP |
|------|-----|-----|
| 设计目标 | 为人类编写的程序服务 | 为推理型 AI 模型服务 |
| 调用方式 | 需预知端点、参数 | 动态发现可用能力 |
| 集成成本 | 每个服务写自定义集成代码 | 统一协议，即插即用 |
| 抽象层级 | 底层接口 | 位于 API 之上的抽象层 |

> MCP **不是替代 API**，而是在 API 之上加了一层"模型友好的抽象"。MCP 服务器底层仍然可以调用 REST 或 GraphQL API。

### 6. 实战示例

构建个人助手 Agent（查日历、拉会议纪要、撰写跟进邮件）：

- **传统方式**：集成 Google Calendar / Notion / Gmail API，每个服务写自定义代码，处理认证、限流、边界情况，再通过脆弱的 system prompt 教会模型如何使用
- **MCP 方式**：构建/安装各系统的 MCP Server（日历 Server、笔记 Server、邮件 Server），每个 Server 自动广告其能力，模型自动发现可用工具并推理使用顺序

### 7. 行业意义

- 就像 **HTTP 统一了 Web**，MCP 正在统一模型与工具之间的通信
- 未来每个严肃的 AI 开发者都需要让自己的系统 **MCP-aware**

## 相关资源

- [Google MCP Servers](https://goo.gle/3PYkjky)
- [用 ADK Agent 构建 Google MCPs](https://goo.gle/4o6h8DP)
- [将 MCP Server 连接到 AI Agent](https://goo.gle/4uk7YW2)
- [AI Agents Explained](https://goo.gle/AI-agents-explained)
- [如何构建 MCP Server](https://goo.gle/MCP-servers-explained)
- [Google 托管 MCP Servers](https://goo.gle/4e3Wobs)

## 完整英文转录

```
00:00 - 如果你曾尝试让 AI 模型与你的工具或数据对话，你可能发现了一件事：很乱。
00:12 - 每个 API 的行为都不同，每次集成都需要自定义代码，模型每次变化连接就会断掉。

00:23 - MCP 就是为了解决这个问题而创建的。视频结束时你将理解：
        MCP 是什么、为什么存在、以及它如何改变模型与世界的交互方式。

00:48 - MCP 是什么？
        MCP 是一个开放标准，用于在一致且结构化的方式下连接模型与工具、数据和上下文。
        可以将其理解为模型与周围系统之间的共享语言。
        它定义了模型如何发现可用工具、请求信息以及执行操作，
        而无需了解每个工具的具体实现细节。

01:19 - 该协议由 Anthropic 提出，现正被行业广泛采纳。

01:31 - API 从未为 AI 模型设计过。它们是为那些确切知道想要什么的确定性程序设计的。
        语言模型的工作方式不同——它概率性地生成文本，推理不确定的输入，
        经常需要在知道做什么之前先提问、澄清或探索。
        MCP 弥合了这一差距。

02:30 - MCP 如何工作？
        协议定义了两端：客户端和服务器。
        客户端通常是语言模型或 Agent 系统（如 Claude、Gemini 等）。
        服务器是暴露模型可用资源的环境（数据库、文件系统、内部工具等）。
        当客户端连接到服务器时，服务器不仅是响应数据，
        而是广告它支持的能力、存在的资源、可执行的操作以及所需的输入。
        客户端发送请求如 "列出可用资源"、"调用此操作"、"获取此数据"，
        服务器用结构化的 JSON 描述来响应。

03:51 - 深入技术细节
        MCP 定义了四种主要资源类型：
        - Tools（工具）：模型可以调用的行动（搜索数据库、发送邮件、分析文件等）
        - Resources（资源）：数据和状态（文本文档、数据库行、图片等）
        - Prompts（提示）：描述模型在特定任务中应如何行为的可复用模板
        - Context（上下文）：模型可拉入推理过程的外部信息（聊天历史、公司数据、用户偏好等）
        
        每个工具和资源都附带元数据，描述其功能、期望输入和返回输出。
        协议对所有工具强制执行一致的 schema。

05:09 - MCP vs API
        关键区别在于消费者是谁。API 为人类编写的程序设计，MCP 为像人类一样推理的模型设计。
        MCP 可以被看作 API 之上的抽象层。API 依然存在，MCP 让它们变得对模型友好。
        底层 MCP 服务器仍然调用现有的 REST 或 GraphQL API，但模型只通过结构化的 MCP schema 交互。

06:43 - 实战：个人助手 Agent
        传统方式：分别集成 Google Calendar、Notion、Gmail API，写自定义胶水代码。
        MCP 方式：构建各系统的 MCP Server，每个 Server 自动广告能力，
        模型自动发现可用工具、推理使用顺序和数据传递。

07:17 - MCP 正在统一模型与工具的通信方式，就像 HTTP 统一了 Web。
        未来每个严肃的 AI 开发者都需要让自己的系统 MCP-aware。
```
