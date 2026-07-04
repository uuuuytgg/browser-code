import { describe, expect, it } from "vitest";

import { buildLlmWikiLiteStateSummary } from "./index";

describe("LLM Wiki Lite state summary", () => {
  it("summarizes the KB state machine without embedding vault content", () => {
    const summary = buildLlmWikiLiteStateSummary({
      paths: {
        kbSources: true,
        kbClaims: true,
        kbEntities: true,
        kbTopics: true,
        searchHarness: true,
        answerHarness: true
      },
      policies: {
        retrieval: "1. Search claims\n2. Search topics/entities\n3. Search sources",
        manager: "You must not delete source files",
        captureWorkflow: "bun run kb:process-queue"
      }
    });

    expect(summary).toContain("<llm_wiki_lite_state>");
    expect(summary).toContain("Retrieval order: claims first");
    expect(summary).toContain("harness/make_answer_context.ts");
    expect(summary).toContain("kb:process-queue");
    expect(summary).not.toContain("vault/articles/");
  });
});
