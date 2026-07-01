export type GitHubDataset =
  | "repositories"
  | "readme_docs"
  | "issues"
  | "pull_requests"
  | "releases"
  | "code_search";

export type GitHubAccessMode = "api_or_gh" | "web_fallback";

export type GitHubRepositoryRef = {
  owner: string;
  repo: string;
};

export type GitHubDiscoveryPlan = {
  provider: "github_database";
  query: string;
  repository?: GitHubRepositoryRef;
  datasets: GitHubDataset[];
  accessOrder: GitHubAccessMode[];
  cache: {
    databasePath: ".tmp/research/github.sqlite";
    tables: GitHubDataset[];
  };
  reviewRequired: true;
  writesVaultDirectly: false;
};

export const githubCacheSchemaSql = [
  `CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL UNIQUE,
    html_url TEXT NOT NULL,
    description TEXT,
    stars INTEGER,
    forks INTEGER,
    open_issues INTEGER,
    default_branch TEXT,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS readme_docs (
    id TEXT PRIMARY KEY,
    repository_full_name TEXT NOT NULL,
    path TEXT NOT NULL,
    html_url TEXT NOT NULL,
    markdown TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    repository_full_name TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL,
    labels_json TEXT NOT NULL,
    html_url TEXT NOT NULL,
    updated_at TEXT,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pull_requests (
    id TEXT PRIMARY KEY,
    repository_full_name TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL,
    merged INTEGER,
    html_url TEXT NOT NULL,
    updated_at TEXT,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY,
    repository_full_name TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    name TEXT,
    html_url TEXT NOT NULL,
    published_at TEXT,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS code_search (
    id TEXT PRIMARY KEY,
    repository_full_name TEXT,
    path TEXT NOT NULL,
    html_url TEXT NOT NULL,
    fragment TEXT,
    language TEXT,
    fetched_at TEXT NOT NULL
  )`
] as const;

export function planGitHubDiscovery(query: string): GitHubDiscoveryPlan {
  const repository = extractGitHubRepository(query);
  const datasets = inferDatasets(query, repository);

  return {
    provider: "github_database",
    query,
    repository,
    datasets,
    accessOrder: ["api_or_gh", "web_fallback"],
    cache: {
      databasePath: ".tmp/research/github.sqlite",
      tables: datasets
    },
    reviewRequired: true,
    writesVaultDirectly: false
  };
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

function inferDatasets(query: string, repository?: GitHubRepositoryRef): GitHubDataset[] {
  const normalized = query.toLowerCase();
  const datasets = new Set<GitHubDataset>();

  if (repository || /\b(repo|repository|github)\b/.test(normalized)) {
    datasets.add("repositories");
    datasets.add("readme_docs");
  }

  if (/\b(issue|issues|bug|bugs)\b/.test(normalized)) {
    datasets.add("issues");
  }

  if (/\b(pr|pull request|pull requests|merge|merged)\b/.test(normalized)) {
    datasets.add("pull_requests");
  }

  if (/\b(release|releases|changelog|version|tag)\b/.test(normalized)) {
    datasets.add("releases");
  }

  if (hasCodeSearchIntent(normalized)) {
    datasets.add("code_search");
  }

  if (datasets.size === 0) {
    datasets.add("repositories");
    datasets.add("readme_docs");
    datasets.add("issues");
    datasets.add("pull_requests");
    datasets.add("releases");
  }

  return [...datasets];
}

function hasCodeSearchIntent(query: string) {
  return (
    /\b(code search|source|implementation|function|class|symbol)\b/.test(query) ||
    /代码|源码|实现/.test(query)
  );
}
