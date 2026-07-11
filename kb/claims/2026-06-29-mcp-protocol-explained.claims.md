# Claims: MCP 协议工作原理

## Metadata

source: [[kb/sources/2026-06-29-mcp-protocol-explained]]
source_path: kb/sources/2026-06-29-mcp-protocol-explained.md
status: active
updated_at: 2026-06-30

## Claims

- [definition] MCP（Model Context Protocol）是 Anthropic 提出的开放标准，用于统一 AI 模型与外部工具和数据的通信方式。
- [comparison] API 是为确定性程序设计的，MCP 是为概率性推理的 AI 模型设计的。
- [mechanism] MCP 核心架构分两端：客户端（LLM/Agent 系统）和服务器（暴露资源和操作的环境）。
- [definition] MCP 的四大核心组件：Tools（可调用的操作）、Resources（数据和状态）、Prompts（可复用模板）、Context（外部信息）。
- [comparison] MCP 不是替代 API，而是在 API 之上加了一层模型友好的抽象层。
- [conclusion] 就像 HTTP 统一了 Web，MCP 正在统一模型与工具之间的通信方式。
- [mechanism] MCP 客户端通过 JSON schema 标准协议发现服务器能力、调用操作、获取数据，无需预知每个工具的细节。
