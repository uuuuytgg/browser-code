import { describe, expect, it } from "vitest";

import { buildProviderExecutableActions, buildProviderExecutionRequests, planProReader } from "./index";

describe("enhanced research execution profile", () => {
  it("keeps ordinary ProReader research on the normal profile without subagents", () => {
    const { decision } = planProReader({ query: "GitHub MCP official docs implementation" });

    expect(decision.executionProfile).toBe("normal");
    expect(decision.workflowPolicy).toBe("disabled");
    expect(decision.subagentPlan).toBeUndefined();
  });

  it("enables explicit enhanced research only after ProReader has independent action batches", () => {
    const { decision, plan } = planProReader({ query: "火力全开 深度研究 GitHub MCP official docs implementation" });

    expect(decision.executionProfile).toBe("enhanced_research");
    expect(decision.workflowPolicy).toBe("explicit_opt_in");
    expect(decision.subagentPlan).toMatchObject({
      roles: ["search_worker", "kb_worker", "source_reviewer", "synthesis_reviewer"],
      reviewRequired: true,
    });
    expect(decision.subagentPlan?.batches.every((batch) => batch.independent)).toBe(true);
    expect(decision.subagentPlan?.batches[0]?.prompt).toContain("Do not change the ProReader route");
    expect(decision.subagentPlan?.batches[0]?.prompt).toContain("Do not write vault, kb, sqlite");
    expect(plan.actionBatches.some((batch) => batch.independent)).toBe(true);
  });

  it("carries enhanced batch metadata into executable actions without changing providers", () => {
    const { route, plan, decision } = planProReader({
      query: "增强模式 深度研究 GitHub MCP official docs implementation",
    });
    const actions = buildProviderExecutableActions(buildProviderExecutionRequests(plan)).actions;

    expect(route.providers).toEqual(["llm_wiki_lite", "github", "official_docs", "websearch"]);
    expect(decision.subagentPlan?.batches.map((batch) => batch.batchId)).toContain("external-evidence");
    expect(actions.find((action) => action.batchId === "external-evidence")).toMatchObject({
      independent: true,
      dependsOn: ["kb-first"],
    });
  });
});
