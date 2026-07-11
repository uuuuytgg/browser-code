# MCP (Model Context Protocol) 工作原理

## Metadata

source_type: video
source_url: https://www.youtube.com/watch?v=cGuyrANVi4A
captured_at: 2026-06-29
status: active

## Summary

Google Cloud Tech 出品的 MCP 入门视频，Smitha Kolan 讲解 Model Context Protocol 的核心原理、设计动机，以及为什么 MCP 正在成为 AI Agent 连接外部工具和数据的新标准。

## Key Points

- MCP 是 Anthropic 提出的开放标准，用于统一模型与工具/数据的通信
- 核心架构：客户端（LLM/Agent）←→ 服务器（数据库、文件系统、工具）
- 四大核心组件：Tools（操作）、Resources（数据）、Prompts（模板）、Context（上下文）
- MCP 不是替代 API，而是在 API 之上加一层"模型友好的抽象"
- 就像 HTTP 统一了 Web，MCP 正在统一模型与工具的通信

## Related Topics

- mcp-protocol
- agent-framework

## Original Reference

vault/videos/how-model-context-protocol-mcp-actually-works.md
