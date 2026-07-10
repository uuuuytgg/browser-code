import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { buildLlmWikiLiteStateSummary } from "../../../../../packages/research/src/llm-wiki-state"
import {
  triageProReaderRequest,
} from "../../../../../packages/research/src/triage"

export type BrowserCodePhase =
  | "url_pipeline"
  | "explicit_skill_direct"
  | "l1_direct"
  | "proreader_preflight"
  | "proreader_execute"
  | "proreader_save_confirmed"

export type BrowserCodeCoreContext = {
  phase: BrowserCodePhase
  query?: string
  explicitUrl: boolean
  allowedTools?: string[]
  allowedMcpTools?: string[]
  allowedSkillNames?: string[]
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

const PROREADER_SAVE_TOOLS = new Set([
  "edit",
  "write",
])

const EXECUTION_BACKEND_SKILLS = new Set([
  "multi-search-engine",
])

const DIRECT_SKILL_NAMES = [
  "aihot",
  "multi-search-engine",
]

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

  const explicitSkillName = extractExplicitSkillName(query)
  if (explicitSkillName) {
    return {
      phase: "explicit_skill_direct",
      query,
      explicitUrl: false,
      allowedTools: ["invalid", "question", "skill"],
      allowedSkillNames: [explicitSkillName],
      systemPrompt: [
        "<browser_code_core_context>",
        "Phase: explicit_skill_direct",
        `Latest non-URL query: ${query}`,
        `The user explicitly requested the ${explicitSkillName} skill. This is a deliberate bypass of ProReader first-route gating.`,
        "Only the explicitly named skill may be loaded. Do not use this bypass to load route-type skills that the user did not name.",
        "</browser_code_core_context>",
      ].join("\n"),
    }
  }

  const proreaderMatch = findCompletedToolOutputAfterLatestUser(input.messages, input.lastUser, "proreader")
  const proreaderOutput = proreaderMatch?.output
  const proreaderPlan = parseProReaderOutput(proreaderOutput)
  const saveApprovalOutput = proreaderPlan && proreaderMatch
    ? findCompletedToolOutputAfterMessage(input.messages, proreaderMatch.messageID, "question")?.output
    : undefined
  const saveConfirmed = proreaderPlan ? hasConfirmedSaveApproval(proreaderPlan, saveApprovalOutput) : false
  // When ProReader hasn't returned: L1 direct — full tools, agent self-triages.
  const phase: BrowserCodePhase = proreaderPlan
    ? saveConfirmed
      ? "proreader_save_confirmed"
      : "proreader_execute"
    : "l1_direct"
  const allowed = proreaderPlan ? deriveAllowedTools(proreaderPlan) : undefined
  const allowedTools = allowed
    ? Array.from(new Set([
      ...allowed.tools,
      ...(saveConfirmed ? Array.from(PROREADER_SAVE_TOOLS) : []),
    ])).sort()
    : undefined
  const llmWikiState = buildRuntimeLlmWikiLiteStateSummary()
  const lines = [
    "<browser_code_core_context>",
    `Phase: ${phase}`,
    `Latest non-URL query: ${query}`,
    llmWikiState,
  ]

  if (phase === "l1_direct") {
    lines.push(
      "L1 direct lane — full tool set available. ProReader is not required.",
      "Agentic triage: decide whether this task needs ProReader research routing.",
      "If the task requires external information retrieval, multi-source comparison, or deep analysis — call proreader.",
      "If the task is a simple operation (save/read/search vault/manage KB/single-page fetch/file ops) — do it directly.",
      "If the previous turn's ProReader just completed research and the user confirms saving — this is L1, save directly.",
      "Safety side: when unsure, default to calling proreader. Only skip proreader when clearly unnecessary.",
      "",
      "KB retrieval priority:",
      "  Primary: kb_manage({ action: \"search\", query: \"...\" }) → FTS5 over kb/claims(w3)+topics(w2)+entities(w1)+sources(w0)",
      "  Context: kb_manage({ action: \"context\", query: \"...\" }) → structured answer_context",
      "  Fallback: search_vault → raw vault tag index (only when search returns nothing)",
      "",
      "Save flow: web_to_markdown(url) → save_markdown_note(...) or write(...) → kb_manage({ action: \"after_capture\", vault_path: \"...\" })",
      "",
      "KB writing: kb_manage({ action: \"save_source\", ... }) / kb_manage({ action: \"save_claims\", ... }) / kb_manage({ action: \"link_topic\", ... }) / kb_manage({ action: \"link_entity\", ... })",
    )
  } else {
    const plan = proreaderPlan!
    lines.push(
      "ProReader has already returned in this session. Execute the returned route/plan with the selected providers and execution backends only.",
      "Execution backend skills such as multi-search-engine / SQL blooming may be used when the ProReader plan selects websearch. Route-type skills still must not override the ProReader route.",
    )
    if (allowed) {
      lines.push(`Allowed execution tools for this ProReader plan: ${(allowedTools ?? allowed.tools).join(", ") || "(none)"}.`)
      if (allowed.mcpTools.length) lines.push(`Allowed MCP provider tools: ${allowed.mcpTools.join(", ")}.`)
      if (allowed.tools.includes("skill")) {
        lines.push(`Allowed execution-backend skills: ${allowed.skillNames.join(", ") || "(none)"}.`)
        lines.push("The skill tool is allowed only to load execution-backend skills required by the ProReader plan; do not load route-type skills to change the route.")
      }
      if (allowed.tools.includes("task")) {
        lines.push(
          "Enhanced research is explicitly enabled by the ProReader decision. The task tool may be used only for independent ProReader action batches or reviewer roles from decision.subagentPlan.",
          "Subagents must not change the ProReader route, must not write vault/kb/sqlite, and must return structured evidence/candidates/uncertainty/source_notes for main-agent synthesis.",
          "Subagent output is not final: source_reviewer and synthesis_reviewer checks must be reflected before answering or saving.",
        )
      }
    }
    if (phase === "proreader_save_confirmed") {
      lines.push(
        "The user has confirmed the ProReader save/review question after the ProReader plan.",
        "Vault/KB writes are now allowed only for the confirmed ProReader save target. Keep writes scoped to the selected report/candidates and do not perform unrelated code edits.",
      )
    }
    if (plan.dynamicToolExposure) {
      lines.push("Dynamic deferred tool exposure is active after ProReader. This is an execution surface for model choice, not a rewritten intent decision.")
      for (const policy of plan.dynamicToolExposure.policy ?? []) {
        lines.push(`Deferred tool policy: ${policy}`)
      }
      const registry = plan.dynamicToolExposure.providerRegistry ?? []
      if (registry.length) {
        lines.push(`Provider registry: ${registry.map((item) => `${item.provider}:${item.status}/${item.mode}`).join(", ")}.`)
      }
    }
  }

  lines.push("</browser_code_core_context>")
  return {
    phase,
    query,
    explicitUrl: false,
    allowedTools,
    allowedMcpTools: allowed?.mcpTools,
    allowedSkillNames: allowed?.skillNames,
    systemPrompt: lines.join("\n"),
  }
}

export function allowToolForBrowserCodeCoreContext(toolID: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  // L1 direct: all tools available (agent self-triages whether to call proreader)
  if (context.phase === "l1_direct") return true
  if (context.phase === "proreader_save_confirmed" && PROREADER_SAVE_TOOLS.has(toolID)) return true
  if ((context.phase === "proreader_execute" || context.phase === "proreader_save_confirmed") && context.allowedTools) {
    return context.allowedTools.includes(toolID)
  }
  if (context.phase === "explicit_skill_direct" && context.allowedTools) {
    return context.allowedTools.includes(toolID)
  }
  if (context.phase !== "proreader_preflight") return true
  return PREFLIGHT_TOOLS.has(toolID)
}

export function allowMcpToolForBrowserCodeCoreContext(toolID: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "l1_direct") return true
  if ((context.phase === "proreader_execute" || context.phase === "proreader_save_confirmed") && context.allowedMcpTools) {
    return isAllowedMcpTool(toolID, context.allowedMcpTools)
  }
  if (context.phase === "explicit_skill_direct") return false
  if (context.phase !== "proreader_preflight") return true
  if (MCP_RESOURCE_TOOLS.has(toolID)) return false
  return PREFLIGHT_TOOLS.has(toolID)
}

export function allowSkillInstructionForBrowserCodeCoreContext(skillName: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "l1_direct") return true
  if (context.phase === "explicit_skill_direct") return context.allowedSkillNames?.includes(skillName) ?? false
  if (context.phase === "proreader_preflight") return false
  if (context.phase !== "proreader_execute" && context.phase !== "proreader_save_confirmed") return true
  if (!context.allowedTools?.includes("skill")) return false
  return isAllowedExecutionBackendSkill(skillName, context)
}

export function allowSkillExecutionForBrowserCodeCoreContext(skillName: string, context?: BrowserCodeCoreContext) {
  return allowSkillInstructionForBrowserCodeCoreContext(skillName, context)
}

export function allowMcpInstructionForBrowserCodeCoreContext(
  instruction: { tools: string[] },
  context?: BrowserCodeCoreContext,
) {
  if (!context) return true
  if (context.phase === "explicit_skill_direct") return false
  if (context.phase === "proreader_preflight") return false
  if (context.phase !== "proreader_execute" && context.phase !== "proreader_save_confirmed") return true
  if (!context.allowedMcpTools?.length) return false
  return instruction.tools.some((tool) => isAllowedMcpTool(tool, context.allowedMcpTools ?? []))
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
  return findCompletedToolOutput(scopedMessages, toolID)
}

function findCompletedToolOutputAfterMessage(
  messages: SessionV1.WithParts[],
  messageID: string,
  toolID: string,
) {
  const start = messages.findIndex((message) => message.info.id === messageID)
  const scopedMessages = start >= 0 ? messages.slice(start + 1) : messages
  return findCompletedToolOutput(scopedMessages, toolID)
}

function findCompletedToolOutput(messages: SessionV1.WithParts[], toolID: string) {
  for (const message of messages.toReversed()) {
    const part = message.parts
      .findLast((item) => item.type === "tool" && item.tool === toolID && item.state.status === "completed")
    if (part?.type === "tool" && part.state.status === "completed") {
      return { messageID: message.info.id, output: part.state.output }
    }
  }
  return undefined
}

type ProReaderToolOutput = {
  decision?: {
    executionProfile?: string
    workflowPolicy?: string
    saveMode?: string
    subagentPlan?: {
      reviewRequired?: boolean
    }
  }
  executablePlan?: {
    actions?: Array<{
      kind?: string
      tool?: string
      toolCandidates?: string[]
      toolName?: string
    }>
  }
  dynamicToolExposure?: {
    policy?: string[]
    allowedAgentTools?: string[]
    allowedExecutionBackendSkills?: string[]
    allowedMcpTools?: string[]
    providerRegistry?: Array<{
      provider?: string
      mode?: string
      status?: string
    }>
  }
}

function hasConfirmedSaveApproval(plan: ProReaderToolOutput, output: string | undefined) {
  const saveMode = plan.decision?.saveMode
  if (!output || !saveMode || saveMode === "none") return false
  const answers = Array.from(output.matchAll(/"[^"]*"\s*=\s*"([^"]*)"/g))
    .map((match) => match[1] ?? "")
    .filter(Boolean)
  const text = answers.length ? answers.join("\n") : output
  if (/不同意|不允许|取消|不要|不保存|否|no|nope|reject|decline/i.test(text)) return false
  return /同意|允许|确认|确定|保存|写入|入库|是|yes|yep|ok|okay|approve|approved|confirm|confirmed|save/i.test(text)
}

function parseProReaderOutput(output: string | undefined): ProReaderToolOutput | undefined {
  if (!output) return undefined
  const json = extractJsonObject(output)
  try {
    const parsed = JSON.parse(json) as ProReaderToolOutput
    return Array.isArray(parsed.executablePlan?.actions) ? parsed : undefined
  } catch {
    return undefined
  }
}

function deriveAllowedTools(plan: ProReaderToolOutput) {
  const tools = new Set(EXECUTE_BASE_TOOLS)
  const mcpTools = new Set<string>()
  const skillNames = new Set<string>()
  const enhancedResearch = plan.decision?.executionProfile === "enhanced_research"
    && plan.decision?.workflowPolicy === "explicit_opt_in"
    && plan.decision?.subagentPlan?.reviewRequired === true

  for (const action of plan.executablePlan?.actions ?? []) {
    if (action.kind === "agent_tool" && action.tool) {
      tools.add(action.tool)
      for (const candidate of action.toolCandidates ?? []) tools.add(candidate)
      if (action.tool === "websearch" || action.toolCandidates?.some(isSearchBackendCandidate)) {
        tools.add("skill")
        skillNames.add("multi-search-engine")
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

  for (const tool of plan.dynamicToolExposure?.allowedAgentTools ?? []) {
    tools.add(tool)
    if (tool === "websearch") {
      tools.add("skill")
      skillNames.add("multi-search-engine")
    }
  }

  for (const skillName of plan.dynamicToolExposure?.allowedExecutionBackendSkills ?? []) {
    if (EXECUTION_BACKEND_SKILLS.has(skillName)) {
      tools.add("skill")
      skillNames.add(skillName)
    }
  }

  for (const toolName of plan.dynamicToolExposure?.allowedMcpTools ?? []) {
    mcpTools.add(toolName)
  }

  if (enhancedResearch) tools.add("task")

  return {
    tools: Array.from(tools).sort(),
    mcpTools: Array.from(mcpTools).sort(),
    skillNames: Array.from(skillNames).sort(),
  }
}

function isSearchBackendCandidate(candidate: string) {
  return candidate === "multi_search_engine" || candidate === "multi-search-engine" || candidate === "search"
}

function extractExplicitSkillName(query: string) {
  const normalized = query.toLowerCase()
  for (const name of DIRECT_SKILL_NAMES) {
    if (normalized.includes(name.toLowerCase())) return name
  }
  return undefined
}

function isAllowedExecutionBackendSkill(skillName: string, context: BrowserCodeCoreContext) {
  if (!EXECUTION_BACKEND_SKILLS.has(skillName)) return false
  if (!context.allowedSkillNames?.length) return false
  return context.allowedSkillNames.includes(skillName)
}

function isAllowedMcpTool(toolID: string, allowedMcpTools: string[]) {
  return allowedMcpTools.some((allowed) => {
    if (toolID === allowed) return true
    return toolID.endsWith(`_${allowed}`)
  })
}

function extractJsonObject(output: string) {
  const trimmed = output.trim()
  if (trimmed.startsWith("{")) return trimmed
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]?.trim().startsWith("{")) return fenced[1].trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
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
