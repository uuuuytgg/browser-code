# Sidebar Knowledge Agent

Sidebar Knowledge Agent is a browser-first, local-first knowledge capture system.

Current implemented scope:

- Browser extension side panel capture flow
- Local bridge task API
- Runtime agent loop, provider harness, permission guard, and session store
- Web to Markdown extraction
- Video transcript-first capture flow
- Resource scanning flow
- Vault save, index, search, and note read flow
- Read-only MCP knowledge server
- Security boundary verification tests

Key commands:

- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm rebuild-index`

Project boundaries:

- No `run_shell`, `execute_command`, `eval_js`, or `run_python` tool exposure
- All note writes go through `save_markdown_note`
- High-risk tools require confirmation
- MCP exposure is read-only by default
- No default video or audio downloading

Open-source reference policy:

- OpenCode is treated as an architectural reference for runtime/provider/permission/session design
- If any external code is copied or materially adapted, it must be recorded in `NOTICE.md`
