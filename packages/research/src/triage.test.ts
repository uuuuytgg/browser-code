import { describe, expect, it } from "vitest";

import {
  buildAmbiguousProReaderQuestion,
  resolveAmbiguousProReaderSelection,
  triageProReaderRequest
} from "./index";

describe("triageProReaderRequest", () => {
  it("keeps explicit URLs on the existing BrowserCode URL pipeline", () => {
    const triage = triageProReaderRequest("summarize https://www.bilibili.com/video/BV1xx411c7mD");

    expect(triage).toMatchObject({
      kind: "existing_url_pipeline"
    });
  });

  it("routes non-URL BrowserCode turns through ProReader for agentic triage", () => {
    const triage = triageProReaderRequest("help me find deep MCP sources");

    expect(triage.kind).toBe("proreader");
    expect(triage.instruction).toContain("Call the proreader tool first");
    expect(triage.instruction).toContain("perform agentic triage");
  });

  it("does not hard-code coding-task classification in the source preflight", () => {
    const triage = triageProReaderRequest("fix packages/research/src/index.ts type errors");

    expect(triage.kind).toBe("proreader");
    expect(triage.instruction).toContain("ordinary BrowserCode conversation");
  });

  it("builds a generic ambiguity question without topic-specific regex routing", () => {
    const triage = triageProReaderRequest("help me find Fable5 content");
    const question = buildAmbiguousProReaderQuestion(triage);

    expect(question.options.map((option) => option.label)).toEqual([
      "Primary meaning",
      "Alternate meaning",
      "Compare meanings"
    ]);
  });

  it("resumes ProReader routing after an ambiguity selection", () => {
    const triage = triageProReaderRequest("help me find Fable5 content");
    const resolved = resolveAmbiguousProReaderSelection(triage, "Compare meanings");

    expect(resolved.kind).toBe("proreader");
    expect(resolved.instruction).toContain("Selected direction: Compare meanings");
    expect(resolved.instruction).toContain("Call the proreader tool first");
  });
});
