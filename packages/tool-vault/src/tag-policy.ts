import fs from "node:fs/promises";
import path from "node:path";

import { getTagRulesPath, getTagVocabularyPath } from "./paths";

type TagRuleRecord =
  | {
    type: "alias";
    variants: string[];
    canonical: string;
  }
  | {
    type: "blocklist";
    patterns: string[];
  };

type TagRulesFile = {
  version: 1;
  updated_at: string;
  rules: TagRuleRecord[];
};

type TagVocabularyEntry = {
  tag: string;
  count: number;
  first_seen: string;
  last_used: string;
};

type TagVocabularyFile = {
  version: 1;
  tags: TagVocabularyEntry[];
};

type NormalizeTagsOptions = {
  vaultDir: string;
  contentType: string;
  maxTags?: number;
};

const defaultTagRules: TagRulesFile = {
  version: 1,
  updated_at: new Date("2026-06-25T00:00:00.000Z").toISOString(),
  rules: [
    {
      type: "alias",
      variants: ["reactjs", "react-js", "react.js"],
      canonical: "react"
    },
    {
      type: "alias",
      variants: ["front-end", "front_end", "front end"],
      canonical: "frontend"
    },
    {
      type: "alias",
      variants: ["artificial-intelligence"],
      canonical: "ai"
    },
    {
      type: "alias",
      variants: ["typescriptlang", "ts"],
      canonical: "typescript"
    },
    {
      type: "blocklist",
      patterns: [
        "^\\d+$",
        "^article$",
        "^doc$",
        "^note$",
        "^tutorial$",
        "^untitled$",
        "^technology$",
        "^programming$",
        "^study$"
      ]
    }
  ]
};

const emptyVocabulary: TagVocabularyFile = {
  version: 1,
  tags: []
};

export async function normalizeTags(rawTags: string[], options: NormalizeTagsOptions) {
  const maxTags = options.maxTags ?? 5;
  const rules = await loadTagRules(options.vaultDir);
  const canonicalTags = deduplicate(
    rawTags
      .map((tag) => sanitizeTag(tag))
      .map((tag) => applyAliasRule(tag, rules))
      .filter(Boolean)
      .filter((tag) => !matchesBlocklist(tag, rules))
      .filter((tag) => tag !== options.contentType.toLowerCase())
  ).slice(0, maxTags);

  const vocabulary = await loadTagVocabulary(options.vaultDir);
  const knownTags = new Set(vocabulary.tags.map((entry) => entry.tag));

  return {
    canonical: canonicalTags,
    newTags: canonicalTags.filter((tag) => !knownTags.has(tag))
  };
}

export function sanitizeTag(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\/:*?"<>|#@!$%^&+={}\[\]]/g, "")
    .replace(/\.+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 32);
}

export async function updateTagVocabulary(tags: string[], vaultDir: string, timestamp = new Date().toISOString()) {
  if (tags.length === 0) {
    await ensureTagSupportFiles(vaultDir);
    return;
  }

  const vocabulary = await loadTagVocabulary(vaultDir);
  const byTag = new Map(vocabulary.tags.map((entry) => [entry.tag, entry]));
  const day = timestamp.slice(0, 10);

  for (const tag of tags) {
    const existing = byTag.get(tag);
    if (existing) {
      existing.count += 1;
      existing.last_used = day;
      continue;
    }

    byTag.set(tag, {
      tag,
      count: 1,
      first_seen: day,
      last_used: day
    });
  }

  const updated: TagVocabularyFile = {
    version: 1,
    tags: [...byTag.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.tag.localeCompare(right.tag);
    })
  };

  const vocabularyPath = getTagVocabularyPath(vaultDir);
  await fs.mkdir(path.dirname(vocabularyPath), { recursive: true });
  await fs.writeFile(vocabularyPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
}

export async function readTopTags(vaultDir: string, limit = 50) {
  const vocabulary = await loadTagVocabulary(vaultDir);
  return vocabulary.tags.slice(0, limit).map((entry) => entry.tag);
}

export async function ensureTagSupportFiles(vaultDir: string) {
  const rulesPath = getTagRulesPath(vaultDir);
  const vocabularyPath = getTagVocabularyPath(vaultDir);

  await fs.mkdir(path.dirname(rulesPath), { recursive: true });

  if (!(await pathExists(rulesPath))) {
    await fs.writeFile(rulesPath, `${JSON.stringify(defaultTagRules, null, 2)}\n`, "utf8");
  }

  if (!(await pathExists(vocabularyPath))) {
    await fs.writeFile(vocabularyPath, `${JSON.stringify(emptyVocabulary, null, 2)}\n`, "utf8");
  }
}

async function loadTagRules(vaultDir: string) {
  await ensureTagSupportFiles(vaultDir);
  const raw = await fs.readFile(getTagRulesPath(vaultDir), "utf8");
  return JSON.parse(raw) as TagRulesFile;
}

async function loadTagVocabulary(vaultDir: string) {
  await ensureTagSupportFiles(vaultDir);
  const raw = await fs.readFile(getTagVocabularyPath(vaultDir), "utf8");
  return JSON.parse(raw) as TagVocabularyFile;
}

function applyAliasRule(tag: string, rules: TagRulesFile) {
  if (!tag) {
    return "";
  }

  for (const rule of rules.rules) {
    if (rule.type !== "alias") {
      continue;
    }

    if (rule.canonical === tag || rule.variants.includes(tag)) {
      return rule.canonical;
    }
  }

  return tag;
}

function matchesBlocklist(tag: string, rules: TagRulesFile) {
  return rules.rules.some((rule) => {
    if (rule.type !== "blocklist") {
      return false;
    }

    return rule.patterns.some((pattern) => new RegExp(pattern).test(tag));
  });
}

function deduplicate(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
