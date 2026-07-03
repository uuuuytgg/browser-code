import { describe, expect, it } from "vitest";

import {
  buildAmbiguousProReaderQuestion,
  resolveAmbiguousProReaderSelection,
  triageProReaderRequest
} from "./index";

describe("triageProReaderRequest", () => {
  it("keeps explicit URLs on the existing BrowserCode URL pipeline", () => {
    const triage = triageProReaderRequest("总结 https://www.bilibili.com/video/BV1xx411c7mD");

    expect(triage).toMatchObject({
      kind: "existing_url_pipeline"
    });
  });

  it("does not force ordinary coding prompts into ProReader", () => {
    const triage = triageProReaderRequest("修一下 packages/research/src/index.ts 的类型错误");

    expect(triage).toMatchObject({
      kind: "normal_agent"
    });
  });

  it("routes fuzzy research through ProReader with core instructions", () => {
    const triage = triageProReaderRequest("帮我找一下 MCP 相关的深度内容");

    expect(triage.kind).toBe("proreader");
    expect(triage.instruction).toContain("must call the proreader tool before websearch");
  });

  it("asks for disambiguation before routing known multi-meaning topics", () => {
    const triage = triageProReaderRequest("帮我找一下 Fable5 的内容");
    const question = buildAmbiguousProReaderQuestion(triage);

    expect(triage.kind).toBe("ambiguous");
    expect(question.options.map((option) => option.label)).toEqual(["Fable 游戏", "Fable AI", "两个都查"]);
  });

  it("resumes ProReader routing after an ambiguity selection", () => {
    const triage = triageProReaderRequest("帮我找一下 Fable5 的内容");
    const resolved = resolveAmbiguousProReaderSelection(triage, "Fable AI");

    expect(resolved.kind).toBe("proreader");
    expect(resolved.instruction).toContain("Selected direction: Fable AI");
    expect(resolved.instruction).toContain("must call the proreader tool before websearch");
  });
});
