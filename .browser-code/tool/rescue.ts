/**
 * Rescue Lane — ProReader failure fallback planner.
 *
 * Does NOT execute CDP or vault writes. Returns an executable rescue plan
 * so the agent can use its own MCP tools (chrome-devtools) and vault tools.
 *
 * Usage:
 *   1. ProReader returns { report, failures: [...] }
 *   2. Agent calls rescue(failures) to get the rescue plan
 *   3. Agent executes rescue plan actions with its own CDP + vault tools
 *
 * Architecture:
 *   ProReader (read-only) → Rescue Lane (plan only) → Agent (executes CDP) → L0 save
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { FailureReason } from "../../packages/research/src/provider-executor"

// ── Types ──

export type RescueVerdict = "rescue" | "skip" | "uncertain"

export type RescueDecision = {
  failure: ProReaderFailureInput
  verdict: RescueVerdict
  reason: string
  rescuePlan?: CDPRescueAction
}

export type CDPRescueAction = {
  toolChain: string[]
  steps: {
    order: number
    description: string
    tool: string
    args: Record<string, unknown>
    timeout: number
  }[]
  afterRescue: {
    saveWith: "save_markdown_note" | "write"
    kbStep: string
  }
}

export type ProReaderFailureInput = {
  step: string
  provider: string
  kind: string
  url?: string
  reason: FailureReason
  retries: number
  timestamp?: string
}

export type RescuePlan = {
  total: number
  decisions: RescueDecision[]
  summary: {
    toRescue: RescueDecision[]
    skipped: RescueDecision[]
    uncertain: RescueDecision[]
  }
  guardRails: {
    maxItems: number
    perItemTimeout: number
    loopTotalTimeout: number
    expectedDuration: string
  }
  instructions: string[]
}

// ── Guard config ──

const LOOP_GUARD = {
  maxItems: 10,
  perItemTimeout: 60_000,
  loopTotalTimeout: 300_000,
}

// ── Decision matrix ──

function matchReason(reason: FailureReason): RescueVerdict {
  switch (reason) {
    case "jsdom_empty_shell":
    case "cloudflare_blocked":
    case "low_quality":
    case "timeout":
    case "rate_limited":
      return "rescue"

    case "http_5xx":
    case "dns_not_resolvable":
    case "http_404":
    case "connection_refused":
      return "skip"

    case "cookie_expired":
    case "mcp_unavailable":
    case "http_403":
    case "parse_error":
    case "unknown":
      return "uncertain"
  }
}

// ── CDP rescue plan builder ──

function buildCDPRescuePlan(url: string): CDPRescueAction {
  return {
    toolChain: [
      "mcp__chrome-devtools__new_page",
      "mcp__chrome-devtools__wait_for",
      "mcp__chrome-devtools__take_snapshot",
      "mcp__chrome-devtools__close_page",
    ],
    steps: [
      {
        order: 1,
        description: `Open ${url} in a new Chrome DevTools page`,
        tool: "mcp__chrome-devtools__new_page",
        args: { url },
        timeout: 15_000,
      },
      {
        order: 2,
        description: "Wait for body content to render (JS SPA grace period)",
        tool: "mcp__chrome-devtools__wait_for",
        args: { text: "body", timeout: LOOP_GUARD.perItemTimeout },
        timeout: LOOP_GUARD.perItemTimeout,
      },
      {
        order: 3,
        description: "Capture full page text via accessibility snapshot",
        tool: "mcp__chrome-devtools__take_snapshot",
        args: {},
        timeout: 10_000,
      },
      {
        order: 4,
        description: "Clean up — close the CDP page",
        tool: "mcp__chrome-devtools__close_page",
        args: {},
        timeout: 5_000,
      },
    ],
    afterRescue: {
      saveWith: "save_markdown_note",
      kbStep: "After saving, run: write kb/sources/<name>.md → write kb/claims/<name>.claims.md → bash: bun run kb:after-capture",
    },
  }
}

// ── Main planner ──

function planRescue(failures: ProReaderFailureInput[]): RescuePlan {
  const decisions: RescueDecision[] = []

  for (const failure of failures) {
    const verdict = matchReason(failure.reason)

    if (verdict === "skip") {
      decisions.push({
        failure,
        verdict: "skip",
        reason: `${failure.reason}: CDP cannot help. DNS-level or permanent server failure.`,
      })
      continue
    }

    if (verdict === "uncertain") {
      decisions.push({
        failure,
        verdict: "uncertain",
        reason: `${failure.reason}: CDP may help but not guaranteed. Agent to judge based on context.`,
      })
      continue
    }

    // rescue — only if URL is available
    if (!failure.url) {
      decisions.push({
        failure,
        verdict: "skip",
        reason: "No URL available for CDP rescue.",
      })
      continue
    }

    decisions.push({
      failure,
      verdict: "rescue",
      reason: `${failure.reason}: CDP with real Chrome can bypass — renders JS, passes Cloudflare, not rate-limited.`,
      rescuePlan: buildCDPRescuePlan(failure.url),
    })
  }

  const toRescue = decisions.filter((d) => d.verdict === "rescue")
  const skipped = decisions.filter((d) => d.verdict === "skip")
  const uncertain = decisions.filter((d) => d.verdict === "uncertain")

  // Apply loop guards
  const cappedRescue = toRescue.slice(0, LOOP_GUARD.maxItems)
  if (toRescue.length > LOOP_GUARD.maxItems) {
    const excess = toRescue.slice(LOOP_GUARD.maxItems)
    excess.forEach((d) => {
      skipped.push({ ...d, verdict: "skip", reason: `Exceeded max rescue items (${LOOP_GUARD.maxItems}).`, rescuePlan: undefined })
    })
  }

  const estimatedMs = cappedRescue.length * LOOP_GUARD.perItemTimeout

  return {
    total: failures.length,
    decisions: [...cappedRescue, ...skipped, ...uncertain],
    summary: {
      toRescue: cappedRescue,
      skipped,
      uncertain,
    },
    guardRails: {
      maxItems: LOOP_GUARD.maxItems,
      perItemTimeout: LOOP_GUARD.perItemTimeout,
      loopTotalTimeout: LOOP_GUARD.loopTotalTimeout,
      expectedDuration: `${Math.ceil(estimatedMs / 1000)}s (${cappedRescue.length} items × ${LOOP_GUARD.perItemTimeout / 1000}s each)`,
    },
    instructions: [
      "Execute rescue plans in order. Each plan has >=1 CDP action steps.",
      "If any CDP step fails, skip that failure and move to the next. Do not block the loop.",
      `Maximum ${LOOP_GUARD.maxItems} rescue items, ~${LOOP_GUARD.perItemTimeout / 1000}s per item, total under ${LOOP_GUARD.loopTotalTimeout / 1000}s.`,
      "After each successful CDP scrape, save content with save_markdown_note (source_url = the original URL).",
      "After all rescues: write kb/sources/<name>.md + kb/claims/<name>.claims.md + bash: bun run kb:after-capture for each rescued note.",
      "Uncertain items: agent to judge manually. If you have CDP access and think it will help, try it. Otherwise skip.",
    ],
  }
}

// ── Tool definition ──

const rescueTool: ToolDefinition = tool({
  description: `ProReader rescue lane planner. Call after ProReader returns failures.

This tool does NOT execute CDP or write vault. It returns a rescue plan: which failures can be rescued via Chrome DevTools (CDP), which should be skipped, and which are uncertain.

For each "rescue" decision, a CDP action plan is included with step-by-step tool calls (mcp__chrome-devtools__*) and post-save instructions.

Guard rails: max ${LOOP_GUARD.maxItems} items, ~${LOOP_GUARD.perItemTimeout / 1000}s per CDP session, total loop under ${LOOP_GUARD.loopTotalTimeout / 1000}s.`,
  args: {
    failures: tool.schema
      .array(
        tool.schema.object({
          step: tool.schema.string().describe("Step ID from ProReader plan."),
          provider: tool.schema.string().describe("Provider name that failed."),
          kind: tool.schema.string().describe("Step kind: web_fetch, api_call, platform_mcp, video_download, unknown."),
          url: tool.schema.string().optional().describe("URL that failed (required for CDP rescue)."),
          reason: tool.schema
            .enum([
              "timeout", "connection_refused", "dns_not_resolvable", "http_404", "http_403",
              "http_5xx", "jsdom_empty_shell", "low_quality", "cloudflare_blocked",
              "rate_limited", "cookie_expired", "mcp_unavailable", "parse_error", "unknown",
            ])
            .describe("Failure reason from ProReader executor."),
          retries: tool.schema.number().describe("Number of retries already attempted."),
          timestamp: tool.schema.string().optional(),
        }),
      )
      .describe("Failures array from ProReader result."),
  },
  async execute(args) {
    const plan = planRescue(args.failures as ProReaderFailureInput[])

    return JSON.stringify(
      {
        rescuePlan: plan,
        agentAction: {
          immediate: plan.summary.toRescue.length > 0
            ? `Execute ${plan.summary.toRescue.length} rescue plans in sequence. Each plan has CDP steps followed by save_markdown_note.`
            : "No items eligible for automatic rescue.",
          fallback: plan.summary.uncertain.length > 0
            ? `${plan.summary.uncertain.length} uncertain items: agent to decide manually. Use CDP if you think it will help.`
            : "No uncertain items.",
          skip: plan.summary.skipped.length > 0
            ? `${plan.summary.skipped.length} items skipped: DNS/server-level failures, CDP cannot help.`
            : undefined,
        },
      },
      null,
      2,
    )
  },
})

export default rescueTool
