import { describe, expect, it } from "vitest"
import {
  allowMcpInstructionForBrowserCodeCoreContext,
  allowMcpToolForBrowserCodeCoreContext,
  allowSkillExecutionForBrowserCodeCoreContext,
  allowSkillInstructionForBrowserCodeCoreContext,
  allowToolForBrowserCodeCoreContext,
  buildBrowserCodeCoreContext,
} from "./core-context"

function userMessage(id: string, text: string) {
  return {
    info: { id, role: "user" },
    parts: [{ type: "text", text }],
  } as never
}

function assistantWithTool(tool: string, output: string) {
  return {
    info: { id: `${tool}-message`, role: "assistant" },
    parts: [
      {
        type: "tool",
        tool,
        state: {
          status: "completed",
          output,
        },
      },
    ],
  } as never
}

function proreaderOutput(executionProfile: "normal" | "enhanced_research") {
  return JSON.stringify({
    decision: {
      executionProfile,
      workflowPolicy: executionProfile === "enhanced_research" ? "explicit_opt_in" : "disabled",
      subagentPlan: executionProfile === "enhanced_research" ? { reviewRequired: true } : undefined,
    },
    executablePlan: {
      actions: [
        {
          kind: "agent_tool",
          tool: "websearch",
          toolCandidates: ["multi_search_engine"],
        },
      ],
    },
  })
}

function malformedEnhancedOutput() {
  return JSON.stringify({
    decision: {
      executionProfile: "enhanced_research",
      workflowPolicy: "explicit_opt_in",
    },
    executablePlan: {
      actions: [{ kind: "agent_tool", tool: "websearch", toolCandidates: ["multi_search_engine"] }],
    },
  })
}

function fencedProreaderOutput() {
  return [
    "Here is the ProReader plan:",
    "```json",
    proreaderOutput("normal"),
    "```",
  ].join("\n")
}

describe("BrowserCode core context enhanced research gate", () => {
  it("keeps task hidden before ProReader returns", () => {
    const lastUser = userMessage("u1", "火力全开 深度研究 MCP workflow")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [lastUser],
    })

    expect(context?.phase).toBe("proreader_preflight")
    expect(allowToolForBrowserCodeCoreContext("proreader", context)).toBe(true)
    expect(allowToolForBrowserCodeCoreContext("task", context)).toBe(false)
    expect(allowToolForBrowserCodeCoreContext("skill", context)).toBe(false)
    expect(allowSkillInstructionForBrowserCodeCoreContext("multi-search-engine", context)).toBe(false)
    expect(allowSkillExecutionForBrowserCodeCoreContext("multi-search-engine", context)).toBe(false)
    expect(allowMcpInstructionForBrowserCodeCoreContext({ tools: ["bilibili-readonly_bili_search"] }, context)).toBe(false)
  })

  it("allows an explicitly named skill without opening unrelated route skills", () => {
    const lastUser = userMessage("u1", "用 aihot 看今天 AI 热点")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [lastUser],
    })

    expect(context?.phase).toBe("explicit_skill_direct")
    expect(allowToolForBrowserCodeCoreContext("skill", context)).toBe(true)
    expect(allowToolForBrowserCodeCoreContext("websearch", context)).toBe(false)
    expect(allowMcpInstructionForBrowserCodeCoreContext({ tools: ["bilibili-readonly_bili_search"] }, context)).toBe(false)
    expect(allowSkillInstructionForBrowserCodeCoreContext("aihot", context)).toBe(true)
    expect(allowSkillExecutionForBrowserCodeCoreContext("aihot", context)).toBe(true)
    expect(allowSkillInstructionForBrowserCodeCoreContext("multi-search-engine", context)).toBe(false)
  })

  it("does not allow task for a normal ProReader plan", () => {
    const lastUser = userMessage("u1", "MCP workflow research")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [lastUser, assistantWithTool("proreader", proreaderOutput("normal"))],
    })

    expect(context?.phase).toBe("proreader_execute")
    expect(context?.allowedTools).toContain("skill")
    expect(context?.allowedTools).not.toContain("task")
    expect(allowToolForBrowserCodeCoreContext("task", context)).toBe(false)
    expect(allowSkillInstructionForBrowserCodeCoreContext("multi-search-engine", context)).toBe(true)
    expect(allowSkillExecutionForBrowserCodeCoreContext("multi-search-engine", context)).toBe(true)
    expect(allowSkillInstructionForBrowserCodeCoreContext("aihot", context)).toBe(false)
    expect(allowSkillExecutionForBrowserCodeCoreContext("aihot", context)).toBe(false)
  })

  it("parses fenced ProReader JSON before opening execution tools", () => {
    const lastUser = userMessage("u1", "MCP workflow research")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [lastUser, assistantWithTool("proreader", fencedProreaderOutput())],
    })

    expect(context?.phase).toBe("proreader_execute")
    expect(context?.allowedTools).toContain("websearch")
    expect(context?.allowedTools).toContain("skill")
  })

  it("allows selected MCP tools with raw or sanitized runtime names", () => {
    const lastUser = userMessage("u1", "B站搜索 MCP workflow")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [
        lastUser,
        assistantWithTool(
          "proreader",
          JSON.stringify({
            decision: { executionProfile: "normal", workflowPolicy: "disabled" },
            executablePlan: {
              actions: [{ kind: "mcp_tool", toolName: "bili_search" }],
            },
          }),
        ),
      ],
    })

    expect(context?.phase).toBe("proreader_execute")
    expect(allowMcpToolForBrowserCodeCoreContext("bili_search", context)).toBe(true)
    expect(allowMcpToolForBrowserCodeCoreContext("bilibili-readonly_bili_search", context)).toBe(true)
    expect(allowMcpToolForBrowserCodeCoreContext("socialdatax-douyin_search", context)).toBe(false)
    expect(allowMcpInstructionForBrowserCodeCoreContext({ tools: ["bilibili-readonly_bili_search"] }, context)).toBe(true)
    expect(allowMcpInstructionForBrowserCodeCoreContext({ tools: ["socialdatax-douyin_search"] }, context)).toBe(false)
  })

  it("hides all skill instructions when a ProReader plan does not need a skill backend", () => {
    const lastUser = userMessage("u1", "MCP workflow research")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [
        lastUser,
        assistantWithTool(
          "proreader",
          JSON.stringify({
            decision: { executionProfile: "normal", workflowPolicy: "disabled" },
            executablePlan: {
              actions: [{ kind: "agent_tool", tool: "webfetch" }],
            },
          }),
        ),
      ],
    })

    expect(context?.phase).toBe("proreader_execute")
    expect(context?.allowedTools).not.toContain("skill")
    expect(allowSkillInstructionForBrowserCodeCoreContext("multi-search-engine", context)).toBe(false)
  })

  it("allows task only after an enhanced ProReader plan", () => {
    const lastUser = userMessage("u1", "火力全开 深度研究 MCP workflow")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [lastUser, assistantWithTool("proreader", proreaderOutput("enhanced_research"))],
    })

    expect(context?.phase).toBe("proreader_execute")
    expect(context?.allowedTools).toContain("task")
    expect(context?.systemPrompt).toContain("Enhanced research is explicitly enabled")
    expect(allowToolForBrowserCodeCoreContext("task", context)).toBe(true)
  })

  it("does not allow task when enhanced output lacks a reviewed subagent plan", () => {
    const lastUser = userMessage("u1", "火力全开 深度研究 MCP workflow")
    const context = buildBrowserCodeCoreContext({
      lastUser,
      messages: [lastUser, assistantWithTool("proreader", malformedEnhancedOutput())],
    })

    expect(context?.phase).toBe("proreader_execute")
    expect(context?.allowedTools).not.toContain("task")
    expect(allowToolForBrowserCodeCoreContext("task", context)).toBe(false)
  })
})
