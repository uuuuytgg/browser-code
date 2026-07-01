import type { ProviderStep } from "./index";

export type GitHubSearchKind =
  | "repository"
  | "issue"
  | "pull_request"
  | "release"
  | "code";

export type GitHubRepositoryRef = {
  owner: string;
  repo: string;
};

export type GitHubSearchQuery = {
  kind: GitHubSearchKind;
  query: string;
  repository?: GitHubRepositoryRef;
};

export function planGitHubSearchSteps(query: string): ProviderStep[] {
  return buildGitHubSearchQueries(query).map((searchQuery) => ({
    id: `github-${searchQuery.kind}-search`,
    provider: "github" as const,
    action: "search" as const,
    input: searchQuery,
    requiresApproval: false
  }));
}

export function buildGitHubSearchQueries(query: string): GitHubSearchQuery[] {
  const repository = extractGitHubRepository(query);
  const kinds = inferSearchKinds(query);

  return kinds.map((kind) => ({
    kind,
    query: buildSearchQuery(query, kind, repository),
    repository
  }));
}

export function extractGitHubRepository(input: string): GitHubRepositoryRef | undefined {
  const match = input.match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  if (!match) return undefined;

  const repo = match[2].replace(/\.git$/i, "");
  return {
    owner: match[1],
    repo
  };
}

function inferSearchKinds(query: string): GitHubSearchKind[] {
  const normalized = query.toLowerCase();
  const kinds = new Set<GitHubSearchKind>();
  const includeRepository = /\b(repo|repository|github)\b/.test(normalized) || /仓库|项目/.test(query);

  if (/\b(issue|issues|bug|bugs)\b/.test(normalized) || /问题|缺陷|报错/.test(query)) {
    kinds.add("issue");
  }

  if (/\b(pr|pull request|pull requests|merge|merged)\b/.test(normalized)) {
    kinds.add("pull_request");
  }

  if (/\b(release|releases|changelog|version|tag)\b/.test(normalized) || /版本|发布|更新日志/.test(query)) {
    kinds.add("release");
  }

  if (hasCodeSearchIntent(query)) {
    kinds.add("code");
  }

  if (kinds.size === 0) {
    return ["repository", "issue", "pull_request", "release", "code"];
  }

  if (includeRepository || !kinds.has("repository")) {
    kinds.add("repository");
  }

  return [...kinds];
}

function hasCodeSearchIntent(query: string) {
  const normalized = query.toLowerCase();
  return (
    /\b(code search|source|implementation|function|class|symbol)\b/.test(normalized) ||
    /代码|源码|实现/.test(query)
  );
}

function buildSearchQuery(query: string, kind: GitHubSearchKind, repository?: GitHubRepositoryRef) {
  const repoQualifier = repository ? ` repo:${repository.owner}/${repository.repo}` : "";

  switch (kind) {
    case "issue":
      return `${query} is:issue${repoQualifier}`;
    case "pull_request":
      return `${query} is:pr${repoQualifier}`;
    case "release":
      return `${query} release${repoQualifier}`;
    case "code":
      return `${query}${repoQualifier}`;
    case "repository":
      return query;
  }
}
