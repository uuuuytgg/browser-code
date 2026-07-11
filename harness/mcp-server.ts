/**
 * mcp-server.ts — BrowserCode Knowledge MCP Server
 *
 * Exposes kb/ knowledge base (sources, claims, topics, entities)
 * via MCP stdio protocol so other agents/tools can read and search.
 *
 * Usage (for other agents to configure):
 *   command: ["bun", "run", "harness/mcp-server.ts"]
 *   cwd: D:\ClaudeData\browser agent
 *
 * Protocol: MCP stdio (JSON-RPC 2.0 over stdin/stdout)
 *   - Tools:  search_knowledge, answer_context, list_knowledge
 *   - Resources: kb://sources/*, kb://claims/*, kb://topics/*, kb://entities/*
 *
 * Run standalone:
 *   bun run harness/mcp-server.ts
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import fs from "node:fs";

// ── Config ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const KB_ROOT = path.join(PROJECT_ROOT, "kb");
const DB_PATH = path.join(PROJECT_ROOT, "index", "browsercode.sqlite");

const KIND_BOOST: Record<string, number> = {
  claim: 3, topic: 2, entity: 1, source: 0, query: 0,
};

const MCP_VERSION = "1.0";

// ── MCP Protocol ────────────────────────────────────────────────────────────

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
};

function send(msg: JsonRpcMessage) {
  const line = JSON.stringify(msg);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  const header = `Content-Length: ${bytes.length}\r\n\r\n`;
  process.stdout.write(header + line);
}

function log(...args: unknown[]) {
  // MCP protocol uses stderr for logging
  console.error("[browsercode-mcp]", ...args);
}

// ── Knowledge Queries ───────────────────────────────────────────────────────

function getDb(): Database | null {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }
  return new Database(DB_PATH);
}

function searchFts(db: Database, query: string, limit = 10) {
  const cleaned = query.replace(/[^\w\s\u4e00-\u9fff]/g, " ").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const ftsQuery = tokens.length === 1
    ? tokens[0]
    : tokens.map((t) => (t.length > 1 ? `"${t}"` : t)).join(" OR ");

  try {
    const rows = db
      .query(`
        SELECT d.id, d.path, d.kind, d.title, substr(d.content, 1, 500) as snippet
        FROM documents_fts f
        JOIN documents d ON d.id = f.id
        WHERE documents_fts MATCH $query
        LIMIT $limit
      `)
      .all({ $query: ftsQuery, $limit: limit }) as Array<{
        id: string; path: string; kind: string; title: string; snippet: string;
      }>;
    return rows;
  } catch {
    return [];
  }
}

function searchLike(db: Database, query: string, limit = 10) {
  const likePattern = `%${query.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  try {
    const rows = db
      .query(`
        SELECT id, path, kind, title, substr(content, 1, 500) as snippet
        FROM documents
        WHERE content LIKE $query OR title LIKE $query
        LIMIT $limit
      `)
      .all({ $query: likePattern }) as Array<{
        id: string; path: string; kind: string; title: string; snippet: string;
      }>;
    return rows;
  } catch {
    return [];
  }
}

function listByKind(db: Database, kind: string): Array<{ id: string; path: string; title: string }> {
  try {
    return db
      .query(`
        SELECT id, path, title FROM documents
        WHERE kind = $kind
        ORDER BY updated_at DESC
      `)
      .all({ $kind: kind }) as Array<{ id: string; path: string; title: string }>;
  } catch {
    return [];
  }
}

function readDocument(db: Database, pathMatch: string) {
  try {
    const rows = db
      .query(`
        SELECT id, path, kind, title, content FROM documents
        WHERE path LIKE $path
        LIMIT 1
      `)
      .all({ $path: `%${pathMatch}%` }) as Array<{
        id: string; path: string; kind: string; title: string; content: string;
      }>;
    return rows[0] || null;
  } catch {
    return null;
  }
}

// ── Tool Handlers ───────────────────────────────────────────────────────────

const TOOLS: Record<string, (params: Record<string, unknown>) => unknown> = {
  search_knowledge: (params) => {
    const query = String(params.query || "");
    const limit = Math.min(Number(params.limit) || 10, 30);
    if (!query) return { items: [] };

    const db = getDb();
    if (!db) return { items: [], error: "Index not found. Run 'bun run kb:index' first." };

    let results = searchFts(db, query, limit);
    if (results.length < 3) {
      const likeResults = searchLike(db, query, limit);
      const seen = new Set(results.map((r) => r.id));
      for (const r of likeResults) {
        if (!seen.has(r.id)) {
          results.push(r);
          seen.add(r.id);
        }
      }
    }

    // Sort: claims > topics > entities > sources
    results.sort((a, b) => (KIND_BOOST[b.kind] ?? 0) - (KIND_BOOST[a.kind] ?? 0));
    results = results.slice(0, limit);

    db.close();
    return { items: results.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      path: r.path,
      snippet: r.snippet,
    }))};
  },

  list_knowledge: (params) => {
    const kind = String(params.kind || "");
    const validKinds = ["source", "claim", "topic", "entity"];
    if (!validKinds.includes(kind)) {
      return { items: [], error: `Invalid kind. One of: ${validKinds.join(", ")}` };
    }

    const db = getDb();
    if (!db) return { items: [], error: "Index not found." };

    const items = listByKind(db, kind);
    db.close();
    return { items };
  },

  read_knowledge: (params) => {
    const pathStr = String(params.path || "");
    if (!pathStr) return { error: "path required (e.g. sources/2026-06-27-dspark)" };

    const db = getDb();
    if (!db) return { error: "Index not found." };

    const doc = readDocument(db, pathStr);
    db.close();

    if (!doc) return { error: "Document not found." };
    return { document: doc };
  },
};

// ── Resource Handlers ──────────────────────────────────────────────────────

const RESOURCE_PREFIX = "kb://";

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: `${RESOURCE_PREFIX}sources/{name}`,
    name: "Knowledge Source",
    description: "A captured/processed knowledge source (article, video, etc.)",
    mimeType: "text/markdown",
  },
  {
    uriTemplate: `${RESOURCE_PREFIX}claims/{name}`,
    name: "Knowledge Claims",
    description: "Atomic claims extracted from a source",
    mimeType: "text/markdown",
  },
  {
    uriTemplate: `${RESOURCE_PREFIX}topics/{name}`,
    name: "Knowledge Topic",
    description: "A topic page that groups related sources and claims",
    mimeType: "text/markdown",
  },
  {
    uriTemplate: `${RESOURCE_PREFIX}entities/{name}`,
    name: "Knowledge Entity",
    description: "An entity page describing a person, company, or project",
    mimeType: "text/markdown",
  },
];

function resolveResource(uri: string): { content: string; mimeType: string } | null {
  if (!uri.startsWith(RESOURCE_PREFIX)) return null;

  const relativePath = uri.slice(RESOURCE_PREFIX.length); // e.g. "sources/dspark"
  // Support both "sources/name" and "sources/2026-06-27-dspark-speculative-decoding"
  // - if name has no date prefix, try fuzzy match
  // - first try exact, then try fuzzy

  const parts = relativePath.split("/");
  if (parts.length !== 2) return null;

  const [kind, name] = parts;
  const validKinds = ["sources", "claims", "topics", "entities"];
  if (!validKinds.includes(kind)) return null;

  // Try exact match first
  const exactPath = path.join(KB_ROOT, kind, `${name}.md`);
  if (fs.existsSync(exactPath)) {
    return { content: fs.readFileSync(exactPath, "utf-8"), mimeType: "text/markdown" };
  }

  // Try fuzzy: list all files in the directory and find the closest match
  const dirPath = path.join(KB_ROOT, kind);
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md") && !f.startsWith("."));
    const match = files.find((f) => f.includes(name));
    if (match) {
      return { content: fs.readFileSync(path.join(dirPath, match), "utf-8"), mimeType: "text/markdown" };
    }
  }

  return null;
}

// ── Main Loop ───────────────────────────────────────────────────────────────

const decoder = new TextDecoder();
let buffer = "";
let initialized = false;

process.stdin.on("data", (chunk: Uint8Array) => {
  buffer += decoder.decode(chunk, { stream: true });

  while (true) {
    // Parse MCP message frame
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const msg: JsonRpcMessage = JSON.parse(body);
      handleMessage(msg);
    } catch (err) {
      log("Failed to parse message:", err);
    }
  }
});

function handleMessage(msg: JsonRpcMessage) {
  const { id, method, params } = msg;

  const respond = (result: unknown) => {
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, result });
    }
  };

  const respondError = (code: number, message: string) => {
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code, message } });
    }
  };

  switch (method) {
    case "initialize": {
      initialized = true;
      respond({
        protocolVersion: MCP_VERSION,
        capabilities: {
          tools: {},
          resources: {},
          resourceTemplates: {},
        },
        serverInfo: {
          name: "browsercode-knowledge",
          version: "1.0.0",
        },
      });
      break;
    }

    case "notifications/initialized": {
      // no-op
      break;
    }

    case "tools/list": {
      respond({
        tools: [
          {
            name: "search_knowledge",
            description: "Search the BrowserCode knowledge base (sources, claims, topics, entities). Returns ranked results with kind and snippet.",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Search query (Chinese or English)" },
                limit: { type: "number", description: "Max results (default 10, max 30)" },
              },
              required: ["query"],
            },
          },
          {
            name: "list_knowledge",
            description: "List all entries of a specific kind (sources, claims, topics, entities).",
            inputSchema: {
              type: "object",
              properties: {
                kind: {
                  type: "string",
                  description: "One of: source, claim, topic, entity",
                  enum: ["source", "claim", "topic", "entity"],
                },
              },
              required: ["kind"],
            },
          },
          {
            name: "read_knowledge",
            description: "Read a full knowledge document by its path (e.g. 'sources/2026-06-27-dspark-speculative-decoding').",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Partial path to match (e.g. 'sources/dspark' or 'topics/mcp-protocol')" },
              },
              required: ["path"],
            },
          },
        ],
      });
      break;
    }

    case "tools/call": {
      const p = (params || {}) as { name: string; arguments?: Record<string, unknown> };
      const toolName = p.name;
      const toolArgs = p.arguments || {};

      if (toolName in TOOLS) {
        try {
          const result = TOOLS[toolName](toolArgs);
          respond({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        } catch (err) {
          respondError(-1, `Tool error: ${err}`);
        }
      } else {
        respondError(-32601, `Tool not found: ${toolName}`);
      }
      break;
    }

    case "resources/list": {
      // List all actual resources from the kb/ directory
      const resources: Array<{ uri: string; name: string; mimeType: string }> = [];
      const kinds = ["sources", "claims", "topics", "entities"];
      for (const kind of kinds) {
        const dirPath = path.join(KB_ROOT, kind);
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md") && !f.startsWith("."));
          for (const file of files) {
            const name = file.replace(/\.md$/, "");
            resources.push({
              uri: `${RESOURCE_PREFIX}${kind}/${name}`,
              name: name,
              mimeType: "text/markdown",
            });
          }
        }
      }
      respond({ resources });
      break;
    }

    case "resources/templates/list": {
      respond({ resourceTemplates: RESOURCE_TEMPLATES });
      break;
    }

    case "resources/read": {
      const p = (params || {}) as { uri?: string };
      const uri = p.uri || "";
      const resolved = resolveResource(uri);
      if (resolved) {
        respond({
          contents: [{
            uri,
            mimeType: resolved.mimeType,
            text: resolved.content,
          }],
        });
      } else {
        respondError(-1, `Resource not found: ${uri}`);
      }
      break;
    }

    default:
      // Unknown method — only respond if it has an id (not a notification)
      if (id !== undefined) {
        respondError(-32601, `Method not found: ${method}`);
      }
  }
}

log("BrowserCode Knowledge MCP Server started");
log(`KB root: ${KB_ROOT}`);
log(`DB: ${DB_PATH}`);
log("Listening on stdin (MCP stdio protocol)...");
