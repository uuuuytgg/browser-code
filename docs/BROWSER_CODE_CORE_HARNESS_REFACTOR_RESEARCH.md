# Browser Code Core Harness Refactor Research

Date: 2026-07-03
Status: research only; no implementation in this document

## Purpose

Browser Code should stop treating ProReader, LLM Wiki Lite, platform discovery, and vault workflows as optional prompt-level suggestions. They need to become the runtime's first-class orchestration layer.

The current failures are not mostly provider failures. They are orchestration failures:

- non-URL fuzzy research can be preempted by skills such as `aihot`
- `proreader`, platform search, and unrelated skills can be called in the same parallel batch
- LLM Wiki Lite's state machine is not injected as startup context
- OpenCode's generic task and skill behavior still optimizes for coding-agent parallelism
- ProReader plans are static provider lists, not a research loop or execution gate

The goal is to borrow the strongest patterns from Claude / Claude Code's published prompt architecture while adapting them to Browser Code's real domain: content discovery, platform search, vault capture, LLM Wiki Lite, and knowledge management.

## Sources Reviewed

- `system_prompts_leaks` repository: public GitHub repository, CC0-1.0 license, with Anthropic / Claude / Claude Code prompt material.
- Claude Fable 5 prompt: useful for IR behavior, search categories, citation discipline, and tool selection examples.
- Claude Code Opus 4.8 prompt: useful for tool gating, skill invocation semantics, subagent/workflow opt-in, and runtime context structure.
- Claude Code deferred tools: useful for separating tool availability from immediate tool exposure.
- Claude Code bundled skills index: useful for understanding skill as a packageable capability, but Browser Code must not let skills outrank ProReader.

Reference URLs:

- https://github.com/asgeirtj/system_prompts_leaks
- https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/claude-fable-5.md
- https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/Claude%20Code/claude-code-opus-4.8.md
- https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/Claude%20Code/deferred-tools.md
- https://github.com/asgeirtj/system_prompts_leaks/tree/main/Anthropic/Claude%20Code/bundled-skills

## Corrected Local Premise

Browser Code's active model target is DeepSeek. The earlier concern that Claude/GPT/Gemini model branches might bypass `PROMPT_BROWSER_CODE` is not the current runtime's primary failure mode.

The actual issue is subtler:

- DeepSeek does receive the Browser Code identity prompt.
- But Browser Code identity is still only prompt context, not a root scheduling state.
- ProReader preflight is appended as a synthetic user-message part, not injected as a top-priority system gate.
- Tool visibility remains broad, so the model can still call `skill`, `proreader`, `bilibili_search`, `websearch`, and task tools in the same turn.

Relevant local source points:

- `opencode/packages/opencode/src/session/system.ts`: `PROMPT_BROWSER_CODE` is available and used as the fallback provider prompt.
- `opencode/packages/opencode/src/session/prompt.ts`: `browserCodePreflight()` is generated around line 660, then appended later as synthetic message text.
- `opencode/packages/opencode/src/session/prompt.ts`: the runtime system array is assembled as env, instructions, MCP instructions, then skills.
- `opencode/packages/opencode/src/tool/task.txt`: generic task guidance still pushes concurrent agents.
- `packages/research/src/triage.ts`: non-URL queries currently return a default agentic route instruction, but this does not alter tool visibility.
- `packages/research/src/index.ts`: `routeQuery()` remains regex/static-route driven.

## Claude Patterns Worth Borrowing

### 1. Search Behavior Is A Decision Tree

Claude separates stable knowledge, recency-sensitive knowledge, one-shot search, multi-source research, and deep research. Browser Code should adapt this into ProReader's first routing phase.

Browser Code mapping:

- stable local or known knowledge -> answer with LLM Wiki Lite first, no external search unless needed
- ambiguous freshness -> answer from local/wiki if possible, offer or perform targeted verification depending on user wording
- current or platform-internal info -> search/discovery path
- research/comparison -> iterative loop with source evaluation
- ingestion -> discovery, review, enrichment, vault write

### 2. Tool Choice Uses Category Match, Not "Maybe Useful"

Claude's examples strongly distinguish a direct tool category match from a tool that merely looks helpful. Browser Code needs the same discipline:

- direct URL -> existing URL/video/resource pipeline
- natural-language fuzzy query -> ProReader first
- local-knowledge question -> ProReader may choose LLM Wiki Lite first
- platform-internal discovery -> ProReader chooses platform provider
- aihot/trend skills -> provider/action only after ProReader picks trend research

### 3. Skills Are Blocking When Matched, But Need A Higher Arbiter

Claude Code treats matching skills as something that must be invoked before responding. That is powerful, but Browser Code has a stronger domain-specific arbiter: ProReader.

Browser Code should not let generic or external skills self-select ahead of ProReader. The corrected rule should be:

- if the user explicitly invokes a skill, honor it
- if Browser Code preflight marks the turn as ProReader-gated, no skill may load before ProReader returns a route
- after ProReader returns a plan, matching skills can become provider actions

### 4. Multi-Agent Workflow Requires Explicit Opt-In

Claude Code's workflow guidance is useful because it restricts expensive orchestration to explicit opt-in. Browser Code currently has the opposite pressure in `task.txt`, where generic task usage encourages concurrent agents whenever possible.

Browser Code mapping:

- ProReader first phase is sequential and exclusive
- parallelism only starts after ProReader emits an action batch
- large multi-agent sweeps need explicit user opt-in or a ProReader plan that marks them safe

### 5. Deferred Tools

The deferred-tools pattern is highly relevant. Browser Code does not need every possible tool visible in every phase.

Browser Code mapping:

- preflight phase: only `proreader`, `question`, maybe read-only core context
- route phase: ProReader returns provider candidates and readiness
- execution phase: only the selected provider tools become visible or recommended
- enrichment phase: only approved candidate tools become visible
- vault phase: write/edit tools become available only after review or explicit user intent

## Current Browser Code Failure Analysis

### Failure A: ProReader Preflight Is Too Late And Too Soft

Current flow:

1. User sends text.
2. `browserCodePreflight()` builds a textual instruction.
3. The instruction is appended as a synthetic part to the user message.
4. Tools are still resolved normally.
5. The model may still invoke unrelated skills or platform tools in the same first tool-call batch.

Required change:

- convert ProReader preflight from user-message text into a runtime phase gate
- add a `BrowserCodeTurnMode` / `BrowserCodeGate` object before `SessionTools.resolve()`
- pass that gate into tool resolution and system prompt assembly

### Failure B: Skills Can Outrank Domain Routing

Current flow:

- `SystemPrompt.skills()` tells the model to load matching skills.
- Skill descriptions are broad and strong.
- If a skill such as `aihot` matches part of the user's phrase, the model may load it before ProReader has classified the query.

Required change:

- Browser Code core gate must be injected before skills
- skill system prompt should be omitted or rewritten during ProReader preflight
- post-route skills should be exposed as ProReader provider actions, not as free first-turn actions

### Failure C: Task Tool Encourages The Wrong Parallelism

Current `task.txt` still says to launch multiple agents concurrently whenever possible. That is useful for coding exploration, but wrong for Browser Code route-first research.

Required change:

- replace generic task wording with Browser Code phase-aware wording
- first phase: no parallel tasks before ProReader route
- after route: parallel only when action dependencies are independent
- ingestion/enrichment: no enrichment before human review manifest

### Failure D: LLM Wiki Lite State Machine Is Not Startup Context

LLM Wiki Lite exists as harness scripts and KB/vault artifacts, but the runtime does not surface its strategy as a compact boot context.

Required change:

- create a small runtime summary provider for LLM Wiki Lite state
- inject it into `BrowserCodeCoreContext`
- include only operational state and routing rules, not large vault contents

Minimum content:

- source-of-truth order: vault MD -> kb/sources -> kb/claims/entities -> index
- answer path: `harness/make_answer_context.ts`
- search path: `harness/search.ts`
- MCP role: external access bridge, not Browser Code's primary internal path
- write boundary: ProReader discovery cannot write vault/kb directly

### Failure E: ProReader Planner Is Static

`routeQuery()` still uses static categories and static provider lists. This is not enough for high-quality discovery.

Required change:

- add query complexity classification
- add search/refinement loop metadata
- add quality evaluation criteria
- support offer-before-search
- produce action batches with explicit dependencies

## Proposed Source-Level Architecture

### New Core Concept: BrowserCodeCoreContext

Add a runtime-assembled context object before prompt and tool resolution:

```ts
type BrowserCodeTurnPhase =
  | "normal"
  | "url_pipeline"
  | "proreader_preflight"
  | "proreader_route"
  | "proreader_execute"
  | "review"
  | "enrichment"
  | "vault_write";

type BrowserCodeCoreContext = {
  phase: BrowserCodeTurnPhase;
  userQuery: string;
  explicitUrl?: string;
  allowedTools: string[];
  suppressedTools: string[];
  systemDirectives: string[];
  llmWikiStateSummary: string;
  providerReadiness: Record<string, unknown>;
};
```

This is not just a prompt string. It must feed:

- system prompt ordering
- tool visibility
- skill visibility
- ProReader readiness
- execution sequencing

### P0 Tool Visibility Gate

During `proreader_preflight`, expose only:

- `proreader`
- `question`
- read-only core context if needed

Suppress:

- `skill`
- `task`
- `websearch`
- `webfetch`
- platform MCP search tools
- aihot / trend skills
- shell unless explicitly needed by the preflight machinery

After ProReader returns:

- expose only selected provider tools
- allow fallbacks declared by ProReader
- allow parallelism only for independent action batches

### P0 System Prompt Ordering

Current order:

1. environment
2. project instructions
3. MCP instructions
4. skills

Proposed Browser Code order:

1. BrowserCodeCoreContext
2. Browser Code identity and domain contract
3. LLM Wiki Lite compact state
4. active phase gate
5. environment
6. project instructions
7. MCP instructions filtered by active phase
8. skills filtered by active phase

### P0 ProReader As State Machine

ProReader should not merely emit static provider lists. It should emit:

```ts
type ProReaderDecision = {
  mode: "answer" | "offer_search" | "discovery_ingest";
  complexity: "never_search" | "offer_search" | "single_search" | "multi_source_research" | "deep_research";
  providerBias: ProviderId[];
  actionBatches: ProReaderActionBatch[];
  stopConditions: string[];
  evaluationCriteria: string[];
};
```

Action batches should distinguish:

- search/discovery
- evaluate
- refine
- fetch known URLs
- review manifest
- enrichment
- vault write

### P1 Skill Reframing

Convert Browser Code skills into lower-priority provider packages:

- `aihot`: trend/news discovery provider, only after ProReader selects trend research
- Bilibili tools: platform search/enrichment providers
- local wiki tools: internal first-party provider, not external MCP by default
- generic coding skills: disabled or hidden from primary Browser Code agent unless user explicitly asks for codebase work

### P1 Task Tool Reframing

Replace generic task guidance with Browser Code-specific sequencing:

- no task fan-out before route
- task fan-out allowed after ProReader emits independent work items
- each subagent must receive a provider/action scope
- subagents cannot write vault/kb unless the phase is `vault_write`

### P1 OpenCode Slimming Strategy

Do not delete first. Classify into four buckets:

Keep:

- read/write/edit where needed for vault
- webfetch / web_to_markdown
- video transcript/audio/ocr/ffmpeg
- shell for yt-dlp, ffmpeg, harness scripts
- MCP for external agents and platform tools
- question for disambiguation
- todo for long capture tasks

Gate:

- skill
- task
- websearch / multi-search
- platform MCP search
- shell

Hide or disable by default:

- generic coding subagents
- PR/issue/GitHub maintenance tools not part of ProReader
- coding plan remnants
- broad code exploration prompts

Remove only after proving unused:

- LSP remnants
- patch remnants
- repo maintenance commands
- OpenCode upstream demo/config artifacts

## Implementation Sequence

### Phase 0: Research Lock

Deliver this document and confirm scope.

Acceptance:

- no code changes
- local source points identified
- Claude patterns mapped to Browser Code runtime concepts

### Phase 1: Core Context Skeleton

Files likely touched:

- `opencode/packages/opencode/src/session/prompt.ts`
- `opencode/packages/opencode/src/session/system.ts`
- new `opencode/packages/opencode/src/browser-code/core-context.ts`
- tests near session/tool resolution if available

Acceptance:

- non-URL query creates a `proreader_preflight` core context
- core context appears before skills in system prompt
- no tool suppression yet, just observable context

### Phase 2: Tool Visibility Gate

Files likely touched:

- `opencode/packages/opencode/src/session/tools.ts`
- `opencode/packages/opencode/src/tool/registry.ts`
- `opencode/packages/opencode/src/session/prompt.ts`

Acceptance:

- during ProReader preflight, unrelated skills/search/platform tools are not visible
- explicit URL still uses existing URL/video pipeline
- normal non-research conversation can still answer

### Phase 3: LLM Wiki Lite Boot Summary

Files likely touched:

- new `packages/research/src/llm-wiki-state.ts` or `opencode/.../browser-code/llm-wiki-state.ts`
- `harness/` scripts only if a compact status command is needed

Acceptance:

- Browser Code can see LLM Wiki Lite operational rules at startup
- it does not load large vault contents
- it knows MCP is external bridge, not internal primary path

### Phase 4: ProReader Decision Model

Files likely touched:

- `packages/research/src/index.ts`
- `packages/research/src/provider-actions.ts`
- tests in `packages/research/src/*`

Acceptance:

- ProReader outputs complexity and action batches
- readiness is based on real available tools/providers
- webfetch is never a search fallback
- platform search is only selected after route

### Phase 5: Skill And Task Slimming

Files likely touched:

- `opencode/packages/opencode/src/tool/task.txt`
- `opencode/packages/opencode/src/session/system.ts`
- agent definitions / permissions

Acceptance:

- no first-turn task/skill fan-out before ProReader
- explicit user skill invocation still works
- coding-oriented agents are hidden or gated, not destructively removed

## Non-Goals

- Do not rewrite vault ingestion.
- Do not replace the existing URL/video capture pipeline.
- Do not route explicit URLs into ProReader.
- Do not make MCP the internal LLM Wiki Lite path.
- Do not delete OpenCode subsystems until tests and runtime traces prove they are unused.

## Immediate Recommendation

Start with Phase 1 and Phase 2 together as a small vertical slice:

1. build `BrowserCodeCoreContext`
2. insert it before skills/MCP instructions
3. use it to suppress `skill`, `task`, and search/platform tools during `proreader_preflight`
4. verify with a fuzzy query such as `帮我找飞波舞相关内容`

Expected behavior:

1. first model action must be `proreader`
2. no `aihot`, Bilibili, websearch, or task call can appear before ProReader returns
3. after ProReader returns, selected provider tools become available

