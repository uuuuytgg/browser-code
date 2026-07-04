import { describe, expect, it } from "vitest";

import {
  applySaveSelectionDecisions,
  buildSaveSelectionDraft
} from "./index";

describe("save selection", () => {
  it("keeps synthesized reports as one save item", () => {
    const draft = buildSaveSelectionDraft({
      mode: "single_report",
      title: "Fable 5 research report",
      sourceCount: 7
    });

    expect(draft).toMatchObject({
      mode: "single_report",
      sideEffects: {
        writesVault: false,
        writesKnowledgeBase: false
      }
    });
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({
      defaultDecision: "save",
      rationale: "Save one synthesized report covering 7 reviewed source(s)."
    });
  });

  it("builds candidate save choices without writing knowledge stores", () => {
    const draft = buildSaveSelectionDraft({
      mode: "candidate_selection",
      title: "Candidate sources",
      entries: [
        {
          candidateId: "github-1",
          provider: "github",
          title: "Implementation repo",
          url: "https://github.com/example/repo",
          normalizedUrl: "https://github.com/example/repo",
          approvedAt: "2026-07-04T00:00:00.000Z",
          reviewer: "human"
        },
        {
          candidateId: "websearch-2",
          provider: "websearch",
          title: "Thin article",
          url: "https://example.com/thin",
          normalizedUrl: "https://example.com/thin",
          approvedAt: "2026-07-04T00:00:01.000Z",
          reviewer: "human"
        }
      ]
    });
    const result = applySaveSelectionDecisions(draft, {
      "github-1": "save",
      "websearch-2": "discard"
    });

    expect(draft.mode).toBe("candidate_selection");
    expect(result.saved.map((item) => item.id)).toEqual(["github-1"]);
    expect(result.discarded.map((item) => item.id)).toEqual(["websearch-2"]);
    expect(result.sideEffects).toEqual({
      writesVault: false,
      writesKnowledgeBase: false
    });
  });
});
