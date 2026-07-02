import { describe, expect, it } from "vitest";

import {
  assertProviderExecutionIsSideEffectSafe,
  buildProviderExecutionRequests,
  executeProviderRequest,
  planProReader,
  resolveProviderConfig,
  runProviderExecutionDryRun
} from "./index";

describe("provider execution requests", () => {
  it("turns provider plans into side-effect safe execution requests", () => {
    const { plan } = planProReader({ query: "opencode issue implementation" });
    const requests = buildProviderExecutionRequests(plan);

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.writesVault === false && request.writesKnowledgeBase === false)).toBe(true);
    expect(() => assertProviderExecutionIsSideEffectSafe(requests)).not.toThrow();
  });

  it("keeps LLM Wiki Lite local and web/search providers agent-owned", () => {
    const { plan } = planProReader({ query: "BrowserCode LLM Wiki Lite" });
    const requests = buildProviderExecutionRequests(plan);

    expect(requests[0]).toMatchObject({
      provider: "llm_wiki_lite",
      kind: "lite_wiki_harness",
      requiresNetwork: false
    });
  });

  it("uses configured MCP mode for platform providers without hard-coded tool execution", () => {
    const config = resolveProviderConfig({
      providers: {
        bilibili_mcp: {
          mode: "mcp",
          toolName: "configured_bilibili_search"
        }
      }
    });
    const { plan } = planProReader({ query: "YouTube Bilibili video discovery" }, config);
    const requests = buildProviderExecutionRequests(plan);

    expect(requests.find((request) => request.provider === "bilibili_mcp")).toMatchObject({
      kind: "mcp_tool",
      input: {
        toolName: "configured_bilibili_search"
      },
      writesVault: false,
      writesKnowledgeBase: false
    });
  });

  it("dry-run execution never performs network or knowledge writes", () => {
    const { plan } = planProReader({ query: "MCP wikipedia history" });
    const [request] = buildProviderExecutionRequests(plan);
    const result = runProviderExecutionDryRun(request);

    expect(result.status).toBe("planned");
    expect(result.candidates).toEqual([]);
    expect(result.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false,
      executedNetwork: false
    });
  });

  it("blocks network adapters by default policy", async () => {
    const { plan } = planProReader({ query: "MCP wikipedia history" });
    const request = buildProviderExecutionRequests(plan).find((item) => item.requiresNetwork);

    expect(request).toBeDefined();
    await expect(executeProviderRequest(request!)).resolves.toMatchObject({
      status: "blocked_by_policy",
      candidates: [],
      sideEffects: {
        writesVault: false,
        writesKnowledgeBase: false,
        executedNetwork: false
      }
    });
  });

  it("uses injected adapters to return normalized discovery candidates without knowledge writes", async () => {
    const { plan } = planProReader({ query: "MCP wikipedia history" });
    const request = buildProviderExecutionRequests(plan).find((item) => item.kind === "api_request");

    expect(request).toBeDefined();
    const result = await executeProviderRequest(
      request!,
      {
        api_request: async () => ({
          status: "completed",
          candidates: [
            {
              provider: "wikipedia",
              title: "Model Context Protocol",
              url: "https://zh.wikipedia.org/wiki/Model_Context_Protocol",
              summary: "Fake adapter candidate."
            }
          ],
          notes: ["fake adapter"]
        })
      },
      { allowNetwork: true }
    );

    expect(result).toMatchObject({
      status: "completed",
      candidates: [
        {
          provider: "wikipedia",
          title: "Model Context Protocol"
        }
      ],
      sideEffects: {
        writesVault: false,
        writesKnowledgeBase: false,
        executedNetwork: true
      }
    });
  });
});
