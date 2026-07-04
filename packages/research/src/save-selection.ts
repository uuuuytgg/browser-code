import type { ApprovedManifestEntry } from "./review";

export type SaveSelectionMode = "single_report" | "candidate_selection";

export type SaveSelectionItem = {
  id: string;
  title: string;
  url?: string;
  provider?: string;
  defaultDecision: SaveSelectionDecision;
  rationale: string;
};

export type SaveSelectionDecision = "save" | "cite_only" | "discard";

export type SaveSelectionDraft = {
  id: string;
  mode: SaveSelectionMode;
  title: string;
  items: SaveSelectionItem[];
  sideEffects: {
    writesVault: false;
    writesKnowledgeBase: false;
  };
  instructions: string[];
};

export type SaveSelectionInput =
  | {
      mode: "single_report";
      title: string;
      reportId?: string;
      sourceCount: number;
    }
  | {
      mode: "candidate_selection";
      title: string;
      entries: ApprovedManifestEntry[];
    };

export type SaveSelectionApplyResult = {
  saved: SaveSelectionItem[];
  citeOnly: SaveSelectionItem[];
  discarded: SaveSelectionItem[];
  sideEffects: SaveSelectionDraft["sideEffects"];
};

export function buildSaveSelectionDraft(input: SaveSelectionInput): SaveSelectionDraft {
  if (input.mode === "single_report") {
    return {
      id: input.reportId ?? slugId(input.title),
      mode: "single_report",
      title: input.title,
      items: [
        {
          id: input.reportId ?? "report",
          title: input.title,
          defaultDecision: "save",
          rationale: `Save one synthesized report covering ${input.sourceCount} reviewed source(s).`
        }
      ],
      sideEffects: noSaveSelectionSideEffects(),
      instructions: [
        "Ask the user whether to save this single synthesized report.",
        "Do not split sources into separate notes unless the user asks."
      ]
    };
  }

  return {
    id: slugId(input.title),
    mode: "candidate_selection",
    title: input.title,
    items: input.entries.map((entry) => ({
      id: entry.candidateId,
      title: entry.title,
      url: entry.url,
      provider: entry.provider,
      defaultDecision: "save",
      rationale: "Reviewed candidate is approved, but the user can still save, cite only, or discard it."
    })),
    sideEffects: noSaveSelectionSideEffects(),
    instructions: [
      "Present these approved candidates as a save selector before writing long-term notes.",
      "Supported decisions: save, cite_only, discard.",
      "Do not write vault, kb, or sqlite from this selector; return a reviewed selection handoff."
    ]
  };
}

export function applySaveSelectionDecisions(
  draft: SaveSelectionDraft,
  decisions: Record<string, SaveSelectionDecision>
): SaveSelectionApplyResult {
  const resolved = draft.items.map((item) => ({
    item,
    decision: decisions[item.id] ?? item.defaultDecision
  }));

  return {
    saved: resolved.filter((entry) => entry.decision === "save").map((entry) => entry.item),
    citeOnly: resolved.filter((entry) => entry.decision === "cite_only").map((entry) => entry.item),
    discarded: resolved.filter((entry) => entry.decision === "discard").map((entry) => entry.item),
    sideEffects: noSaveSelectionSideEffects()
  };
}

function noSaveSelectionSideEffects(): SaveSelectionDraft["sideEffects"] {
  return {
    writesVault: false,
    writesKnowledgeBase: false
  };
}

function slugId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "save-selection";
}
