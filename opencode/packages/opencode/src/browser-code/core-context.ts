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
  | "direct"
  | "research"
  | "save_confirmed"

export type BrowserCodeCoreContext = {
  phase: BrowserCodePhase
  query?: string
  explicitUrl: boolean
  allowedTools?: string[]
  allowedMcpTools?: string[]
  allowedSkillNames?: string[]
  systemPrompt: string
}

const MCP_RESOURCE_TOOLS = new Set([
  "list_mcp_resources",
  "list_mcp_resource_templates",
  "read_mcp_resource",
])

const PROREADER_SAVE_TOOLS = new Set([
  "edit",
  "write",
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
        "The latest user input contains an explicit URL.",
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
        `The user explicitly requested the ${explicitSkillName} skill. This is a deliberate bypass of task routing.`,
        "Only the explicitly named skill may be loaded. Do not use this bypass to load route-type skills that the user did not name.",
        "</browser_code_core_context>",
      ].join("\n"),
    }
  }

  // Detect ProReader subagent result in recent messages
  const proreaderTask = findCompletedToolOutputAfterLatestUser(
    input.messages, input.lastUser, "task",
    (output) => !!output,
  )
  const saveConfirmed = proreaderTask
    ? hasSaveConfirmation(query)
    : false

  const phase: BrowserCodePhase = proreaderTask
    ? (saveConfirmed ? "save_confirmed" : "research")
    : "direct"

  const llmWikiState = buildRuntimeLlmWikiLiteStateSummary()
  const lines = [
    "<browser_code_core_context>",
    `Phase: ${phase}`,
    `Latest query: ${query}`,
    llmWikiState,
  ]

  if (phase === "direct") {
    lines.push(
      "Direct lane — full tool set available. Agent self-triages.",
      "For multi-source comparison, cross-platform search, or deep analysis → spawn ProReader subagent via task({subagent_type: \"proreader\", ...}).",
      "For simple ops (URL fetch, KB search, single-fact lookup, vault write) → do it directly.",
      "When unsure, default to Research channel.",
      "",
      "KB retrieval: kb_manage search → kb_manage context → search_vault fallback",
      "Save flow: web_to_markdown → save_markdown_note → kb_manage after_capture",
      "KB writing: kb_manage save_source / save_claims / link_topic / link_entity",
    )
  } else if (phase === "research") {
    lines.push(
      "ProReader subagent has returned structured results (status, summary, sources, findings, failures, suggestedSaveTargets).",
      "Review findings with the user. If save desired, confirm then write to vault/kb.",
      "For failures: CDP-rescuable → headless Chrome fetch → save_markdown_note; non-rescuable → mark unavailable.",
    )
  } else if (phase === "save_confirmed") {
    lines.push(
      "User confirmed save. Vault/kb writes now allowed for ProReader findings.",
      "Use save_markdown_note for vault notes, kb_manage for KB pipeline.",
      "Keep writes scoped to confirmed save targets.",
    )
  }

  lines.push("</browser_code_core_context>")
  return {
    phase,
    query,
    explicitUrl: false,
    systemPrompt: lines.join("\n"),
  }
}

export function allowToolForBrowserCodeCoreContext(toolID: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "direct" || context.phase === "url_pipeline") return true
  if (context.phase === "save_confirmed" && PROREADER_SAVE_TOOLS.has(toolID)) return true
  if ((context.phase === "research" || context.phase === "save_confirmed") && context.allowedTools) {
    return context.allowedTools.includes(toolID)
  }
  if (context.phase === "explicit_skill_direct" && context.allowedTools) {
    return context.allowedTools.includes(toolID)
  }
  return true
}

export function allowMcpToolForBrowserCodeCoreContext(toolID: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "direct" || context.phase === "url_pipeline") return true
  if ((context.phase === "research" || context.phase === "save_confirmed") && context.allowedMcpTools) {
    return isAllowedMcpTool(toolID, context.allowedMcpTools)
  }
  if (context.phase === "explicit_skill_direct") return false
  return true
}

export function allowSkillInstructionForBrowserCodeCoreContext(skillName: string, context?: BrowserCodeCoreContext) {
  if (!context) return true
  if (context.phase === "direct" || context.phase === "url_pipeline") return true
  if (context.phase === "explicit_skill_direct") return context.allowedSkillNames?.includes(skillName) ?? false
  return true
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
  if (context.phase !== "research" && context.phase !== "save_confirmed") return true
  if (!context.allowedMcpTools?.length) return false
  return instruction.tools.some((tool) => isAllowedMcpTool(tool, context.allowedMcpTools ?? []))
}

// --- Helpers ---

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
  outputFilter?: (output: string) => boolean,
) {
  const start = lastUser ? messages.findIndex((message) => message.info.id === lastUser.info.id) : -1
  const scopedMessages = start >= 0 ? messages.slice(start) : messages
  for (const message of scopedMessages.toReversed()) {
    const part = message.parts.findLast(
      (item) => item.type === "tool" && item.tool === toolID && item.state.status === "completed",
    )
    if (part?.type === "tool" && part.state.status === "completed") {
      if (outputFilter && !outputFilter(part.state.output)) continue
      return { messageID: message.info.id, output: part.state.output }
    }
  }
  return undefined
}

function hasSaveConfirmation(output: string) {
  return /同意|允许|确认|确定|保存|写入|入库|是|yes|ok|approve|confirm|save/i.test(output)
}

function extractExplicitSkillName(query: string) {
  const normalized = query.toLowerCase()
  for (const name of DIRECT_SKILL_NAMES) {
    if (normalized.includes(name.toLowerCase())) return name
  }
  return undefined
}

function isAllowedMcpTool(toolID: string, allowedMcpTools: string[]) {
  return allowedMcpTools.some((allowed) => {
    if (toolID === allowed) return true
    return toolID.endsWith(`_${allowed}`)
  })
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
