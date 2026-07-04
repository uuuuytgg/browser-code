export type LlmWikiLiteStateInput = {
  policies?: {
    retrieval?: string;
    manager?: string;
    captureWorkflow?: string;
  };
  paths?: {
    vault?: boolean;
    kbSources?: boolean;
    kbClaims?: boolean;
    kbEntities?: boolean;
    kbTopics?: boolean;
    searchHarness?: boolean;
    answerHarness?: boolean;
  };
};

export function buildLlmWikiLiteStateSummary(input: LlmWikiLiteStateInput = {}) {
  const paths = input.paths ?? {};
  const lines = [
    "<llm_wiki_lite_state>",
    "Role: LLM Wiki Lite is the KB provider inside ProReader QA/local-knowledge routes; it is not a peer entrypoint competing with ProReader.",
    "Source of truth: vault Markdown files feed kb/sources, kb/claims, kb/entities, kb/topics, and rebuildable indexes.",
    `Answer harness: ${paths.answerHarness === false ? "missing" : "harness/make_answer_context.ts"}.`,
    `Search harness: ${paths.searchHarness === false ? "missing" : "harness/search.ts"}.`,
    `KB paths: sources=${status(paths.kbSources)}, claims=${status(paths.kbClaims)}, entities=${status(paths.kbEntities)}, topics=${status(paths.kbTopics)}.`,
    "Retrieval order: claims first, then topics/entities, then sources, then query logs.",
    "If local context is insufficient: say what is missing, then let ProReader fall back to selected external providers.",
    "Write boundary: ProReader discovery does not directly write vault, kb, claims, sqlite, or index; formal knowledge writes require explicit review/handoff.",
    "Capture flow after a human-approved vault source: enqueue -> source check -> claims check -> topics/entities check -> rebuild index.",
  ];

  const policyHints = extractPolicyHints(input.policies);
  if (policyHints.length) {
    lines.push("Local policy hints:");
    lines.push(...policyHints.map((hint) => `- ${hint}`));
  }

  lines.push("</llm_wiki_lite_state>");
  return lines.join("\n");
}

function status(value: boolean | undefined) {
  if (value === false) return "missing";
  if (value === true) return "present";
  return "unknown";
}

function extractPolicyHints(policies: LlmWikiLiteStateInput["policies"]) {
  if (!policies) return [];
  const hints = [
    findLine(policies.retrieval, /Search claims/i),
    findLine(policies.retrieval, /Search topics\/entities/i),
    findLine(policies.retrieval, /Search sources/i),
    findLine(policies.manager, /must not/i),
    findLine(policies.captureWorkflow, /kb:process-queue/i),
  ].filter((item): item is string => Boolean(item));

  return Array.from(new Set(hints)).slice(0, 6);
}

function findLine(text: string | undefined, pattern: RegExp) {
  if (!text) return undefined;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*\d.]+\s*/, ""))
    .find((line) => pattern.test(line));
}
