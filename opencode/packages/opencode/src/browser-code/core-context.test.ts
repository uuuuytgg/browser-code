import { describe, expect, it } from "vitest"
import {
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
