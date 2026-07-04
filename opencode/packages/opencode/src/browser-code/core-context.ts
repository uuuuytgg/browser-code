import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { buildLlmWikiLiteStateSummary } from "../../../../../packages/research/src/llm-wiki-state"
import {
  buildAmbiguousProReaderQuestion,
  triageProReaderRequest,
} from "../../../../../packages/research/src/triage"

export type BrowserCodePhase = "url_pipeline" | "proreader_preflight" | "proreader_execute"

export type BrowserCodeCoreContext = {
  phase: BrowserCodePhase
  query?: string
  explicitUrl: boolean
  allowedTools?: string[]
  allowedMcpTools?: string[]
  systemPrompt: string
}

const PREFLIGHT_TOOLS = new Set([
  "proreader",
  "question",
  "invalid",
])

const MCP_RESOURCE_TOOLS = new Set([
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "read_mcp_resource",
])

const EXECUTE_BASE_TOOLS = new Set([
  "invalid",
  "question",
  "proreader",
])

export function buildBrowserCodeCoreContext(input: {
  lastUser?: SessionV1.WithParts
  messages: SessionV1.WithParts[]
}): BrowserCodeCoreContext | undefined {
  const query = extractText(input.lastUser).trim()
  if (!query) return undefined

  const triage = triageProReaderRequest(query)
  if (triage.kind === "existing_url_pipeline") {
    return {
      phase: "url_pipeline",
      query,
      explicitUrl: true,
      systemPrompt: [
        "<browser_code_core_context>",
        "Phase: url_pipeline",
        "The latest user input contains an explicit URL. Do not force ProReader.",
        "Use the existing Browser Code URL/video/page pipeline and its current fetch, transcript, media, and vault tools.",
        "</browser_code_core_context>",
      ].join("\n"),
    }
  }

  const proreaderOutput = findCompletedToolOutputAfterLatestUser(input.messages, input.lastUser, "proreader")
  const proreaderPlan = parseProReaderOutput(proreaderOutput)
  const phase: BrowserCodePhase = proreaderPlan ? "proreader_execute" : "proreader_preflight"
  const allowed = proreaderPlan ? deriveAllowedTools(proreaderPlan) : undefined
  const answeredQuestion = findCompletedToolOutputAfterLatestUser(input.messages, input.lastUser, "question")
  const llmWikiState = buildRuntimeLlmWikiLiteStateSummary()
  const lines = [
    "<browser_code_core_context>",
    `Phase: ${phase}`,
    `Latest non-URL query: ${query}`,
    "Browser Code invariant: every non-URL natural-language research or QA request enters ProReader before route-type skills, websearch, platform search, or task fan-out.",
    "ProReader owns the first agentic intent decision. Inside ProReader, QA prefers KB / LLM Wiki Lite first; code research prefers GitHub / official docs; knowledge research prefers KB / Wikipedia / official docs; platform discovery prefers configured platform providers.",
    llmWikiState,
  ]

  if (phase === "proreader_preflight") {
    lines.push(
      "Available first-step tools are intentionally narrow: call proreader first, or question first only when the query is ambiguous enough to require user disambiguation.",
      "Do not call skill, task, websearch, webfetch, multi-search-engine, aihot, Bilibili, Douyin, Xiaohongshu, GitHub, or Wikipedia tools before ProReader returns a route.",
    )
    if (triage.kind === "ambiguous" && triage.options?.length && !answeredQuestion) {
      const question = buildAmbiguousProReaderQuestion(triage)
      lines.push(
        "The query is ambiguous. Call question before proreader and keep the turn alive after the user answers.",
        `Question payload: ${JSON.stringify({ questions: [question] })}`,
      )
    } else if (triage.kind === "ambiguous" && answeredQuestion) {
      lines.push(
        "The ambiguity question has been answered. Continue in this same turn by calling proreader using the user's selected direction.",
        `Question result: ${answeredQuestion}`,
      )
    }
  } else {
    lines.push(
      "ProReader has already returned in this session. Execute the returned route/plan with the selected providers and execution backends only.",
      "Execution backend skills such as multi-search-engine / SQL blooming may be used when the ProReader plan selects websearch. Route-type skills still must not override the ProReader route.",
    )
    if (allowed) {
      lines.push(`Allowed execution tools for this ProReader plan: ${allowed.tools.join(", ") || "(none)"}.`)
      if (allowed.mcpTools.length) lines.push(`Allowed MCP provider tools: ${allowed.mcpTools.join(", ")}.`)
      if (allowed.tools.includes("skill")) {
        lines.push("The skill tool is allowed only to load execution-backend skills required by the ProReader plan, such as multi-search-engine; do not load route-type skills to change the route.")
      }
    }
  }

  lines.push("</browser_code_core_context>")
  return {
    phase,
    query,
    explicitUrl: false,
    allowedTools: allowed?.tools,
    allowedMcpTools: allowed?.mcpTools,
    systemPrompt: lines.join("\n"),
  }
}

export function allowToolForBrowserCodeCoreContext(toolID: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "proreader_execute" && context.allowedTools) {
    return context.allowedTools.includes(toolID)
  }
  if (context.phase !== "proreader_preflight") return true
  return PREFLIGHT_TOOLS.has(toolID)
}

export function allowMcpToolForBrowserCodeCoreContext(toolID: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "proreader_execute" && context.allowedMcpTools) {
    return context.allowedMcpTools.includes(toolID)
  }
  if (context.phase !== "proreader_preflight") return true
  if (MCP_RESOURCE_TOOLS.has(toolID)) return false
  return PREFLIGHT_TOOLS.has(toolID)
}

function extractText(message?: SessionV1.WithParts) {
  if (!message) return ""
  return message.parts
    .filter((part): part is SessionV1.TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

function findCompletedToolOutputAfterLatestUser(
  messages: SessionV1.WithParts[],
  lastUser: SessionV1.WithParts | undefined,
  toolID: string,
) {
  const start = lastUser ? messages.findIndex((message) => message.info.id === lastUser.info.id) : -1
  const scopedMessages = start >= 0 ? messages.slice(start) : messages
  const part = scopedMessages
    .flatMap((message) => message.parts)
    .findLast((item) => item.type === "tool" && item.tool === toolID && item.state.status === "completed")
  return part?.type === "tool" && part.state.status === "completed" ? part.state.output : undefined
}

type ProReaderToolOutput = {
  executablePlan?: {
    actions?: Array<{
      kind?: string
      tool?: string
      toolCandidates?: string[]
      toolName?: string
    }>
  }
}

function parseProReaderOutput(output: string | undefined): ProReaderToolOutput | undefined {
  if (!output) return undefined
  try {
    const parsed = JSON.parse(output) as ProReaderToolOutput
    return Array.isArray(parsed.executablePlan?.actions) ? parsed : undefined
  } catch {
    return undefined
  }
}

function deriveAllowedTools(plan: ProReaderToolOutput) {
  const tools = new Set(EXECUTE_BASE_TOOLS)
  const mcpTools = new Set<string>()

  for (const action of plan.executablePlan?.actions ?? []) {
    if (action.kind === "agent_tool" && action.tool) {
      tools.add(action.tool)
      for (const candidate of action.toolCandidates ?? []) tools.add(candidate)
      if (action.tool === "websearch" || action.toolCandidates?.some(isSearchBackendCandidate)) {
        tools.add("skill")
      }
      continue
    }

    if (action.kind === "mcp_tool" && action.toolName) {
      mcpTools.add(action.toolName)
      continue
    }

    if (action.kind === "shell_command" || action.kind === "harness_command" || action.kind === "api_request") {
      tools.add("bash")
    }
  }

  return {
    tools: Array.from(tools).sort(),
    mcpTools: Array.from(mcpTools).sort(),
  }
}

function isSearchBackendCandidate(candidate: string) {
  return candidate === "multi_search_engine" || candidate === "multi-search-engine" || candidate === "search"
}

function buildRuntimeLlmWikiLiteStateSummary() {
  const cwd = process.cwd()
  return buildLlmWikiLiteStateSummary({
    paths: {
      vault: existsSync(join(cwd, "vault")),
      kbSources: existsSync(join(cwd, "kb", "sources")),
      kbClaims: existsSync(join(cwd, "kb", "claims")),
      kbEntities: existsSync(join(cwd, "kb", "entities")),
      kbTopics: existsSync(join(cwd, "kb", "topics")),
      searchHarness: existsSync(join(cwd, "harness", "search.ts")),
      answerHarness: existsSync(join(cwd, "harness", "make_answer_context.ts")),
    },
    policies: {
      retrieval: readSmallPolicy(join(cwd, "wiki", "RETRIEVAL_POLICY.md")),
      manager: readSmallPolicy(join(cwd, "wiki", "WIKI_MANAGER.md")),
      captureWorkflow: readSmallPolicy(join(cwd, "wiki", "CAPTURE_WORKFLOW.md")),
    },
  })
}

function readSmallPolicy(path: string) {
  if (!existsSync(path)) return undefined
  return readFileSync(path, "utf8").slice(0, 4_000)
}
