---
title: "Claude System Prompt Leak Research — Full Findings"
source_url: "https://github.com/asgeirtj/system_prompts_leaks"
date: 2026-07-03
tags: [claude, anthropic, system-prompt, llm, research, reverse-engineering, information-retrieval]
---

# Claude System Prompt Leak Research — Full Findings

## Sources Identified

| Source | Description | Status |
|--------|-------------|--------|
| asgeirtj/system_prompts_leaks (GitHub) | Largest collection of leaked Anthropic system prompts (48k+ stars) | ✅ Primary source |
| asgeirtj/main/Anthropic/claude-fable-5.md | Latest Fable 5 prompt (~60KB+) | ✅ Fetched |
| asgeirtj/main/Anthropic/old/claude-3.7-sonnet-w-tools.md | Early 2025 target prompt with tools (~59KB) | ✅ Fetched |
| asgeirtj/main/Anthropic/old/claude-3.7-full-system-message-with-all-tools.md | Early 2025 full prompt (~61KB) | ✅ Fetched |
| asgeirtj/main/Anthropic/old/claude-3.7-sonnet.md | No-tools variant | ✅ Fetched |
| asgeirtj/main/Anthropic/old/claude-opus-4.5.md | Opus 4.5 with citation rules | ✅ Fetched |
| asgeirtj/main/Anthropic/Claude%20Code/claude-code-opus-4.6.md | Claude Code harness prompt (~49KB) | ✅ Fetched (ToolSearch + deferred tools) |
| noya21th/claude-source-leaked | Claude Code v2.1.88 source analysis (Chinese) | ✅ Fetched (5-layer prompt system, 40+ tools, 4 permission levels) |
| gist.github.com/robertpiosik | Early leak gist | ❌ Only 1 archive.org capture (Jan 2022), empty profile page |
| cyrus-tt/fable5-system-prompt | Fable 5 full markdown | ❌ 404 — repo structure changed |

## Information Retrieval (IR) Sections — Location Map

### Claude Fable 5 (latest, ~1585+ lines)
- **search_instructions**: lines 1275–1612 (337 lines, backtick-encoded)
- **past_chats_tools**: lines 819–844 (conversation_search + recent_chats)
- **citation_instructions**: lines 3715–3736
- **memory_system**: unique block not present in earlier versions
- **mandatory_copyright_requirements**: embedded in search_instructions
- **core_search_behaviors**: part of search_instructions block

### Claude 3.7 Sonnet (with tools) / Full System Message with All Tools
- **citation_instructions**: lines 1–11
- **search_instructions**: lines 138–453 (315 lines)
- Same structure in both versions

### Claude 3.7 Sonnet (no tools)
- Same IR sections as w-tools version (citation_instructions + search_instructions)

### Claude Code (Opus 4.6 harness)
- ToolSearch-based infrastructure rather than embedded IR sections
- Deferred tools (approval-needed) pattern
- Subagent delegation model

## Key Findings — IR Evolution

### Gen 1: Claude 3.7 Sonnet (early 2025)
- Basic `<citation_instructions>` + `<search_instructions>`
- Classic tool harness (read, write, bash, glob, grep, webfetch)
- web_search + google_drive_search as standard tools
- Citation format strictly enforced with source tracking

### Gen 2: Claude Opus 4.5 / 4.6
- Mature citation rules with detailed formatting specs
- ToolSearch architecture (Claude Code)
- 4 permission levels (allow / deny / warn / approve)
- Deferred tools requiring user approval
- 40+ tools discovered, 87 hidden feature flags

### Gen 3: Claude Fable 5 (latest)
- **New**: `<memory_system>` block — persistent memory across conversations
- **New**: `past_chats_tools` — conversation_search + recent_chats
- Expanded search_instructions (337 lines, backtick-encoded)
- Mandatory copyright requirements embedded in search
- Core search behaviors defined as separate spec
- MCP (Model Context Protocol) server suggestions
- Refusal handling section (new)

## Claude Code Architecture (noya21th source analysis)
- **5-layer priority system** for prompt building (System Prompt → MCP Server Config → User Profile → Project Rules → User Prompt)
- **9 default prompt components**: Intro, System Section, Doing Tasks, Actions, Using Tools, Output Processing, Safety Guidelines, Output Format, Handoffs
- **40+ tools** across 4 permission levels, ToolSearch as infrastructure backbone
- **Dynamic injection sections** inserted per-context
- **Subagent prompt** — complete separate prompt for delegated tasks
- **Cache optimization** details for prompt caching

## Next Steps
- [ ] Extract and save IR sections as isolated snippets for side-by-side comparison
- [ ] Deep-dive into noya21th tool definitions (ToolSearch, Read/Write, Bash, Glob, Grep, WebFetch, WebSearch, deferred tools)
- [ ] Compare IR capabilities across: 3.7 Sonnet → Opus 4.5/4.6 → Fable 5
- [ ] Fetch noya21th architecture diagrams and feature flags list from practical/ directory
- [ ] Document the evolution of web_search → drive_search → conversation_search → memory
