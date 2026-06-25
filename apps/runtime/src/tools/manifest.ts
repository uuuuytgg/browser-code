import fs from "node:fs";
import path from "node:path";

import { z } from "zod";
import type { AgentMode, ToolRisk } from "@ska/schemas";

import { resolveModuleDir } from "../module-path";
import { resolveRepoRoot } from "../repo-root";

const ToolManifestEntrySchema = z.object({
  name: z.string().min(1),
  risk: z.enum(["low", "medium", "high", "critical"]),
  agent_modes: z.array(z.enum(["reader", "curator", "media", "resource", "librarian"])),
  implemented: z.boolean()
});

const ToolManifestSchema = z.object({
  version: z.number().int().positive(),
  tools: z.array(ToolManifestEntrySchema),
  forbidden_tools: z.array(z.string().min(1))
});

export type ToolManifestEntry = z.infer<typeof ToolManifestEntrySchema>;
export type ToolManifest = z.infer<typeof ToolManifestSchema>;

const toolsDir = resolveModuleDir(import.meta.url);
const repoRoot = resolveRepoRoot(toolsDir);
const defaultManifestPath = path.join(repoRoot, "tool-manifests", "tools.json");

export function loadToolManifest(manifestPath = defaultManifestPath) {
  const raw = fs.readFileSync(manifestPath, "utf8");
  return ToolManifestSchema.parse(JSON.parse(raw));
}

export function buildManifestLookup(manifest: ToolManifest) {
  return new Map(manifest.tools.map((tool) => [tool.name, tool]));
}

export function manifestEntryMatchesSpec(
  entry: Pick<ToolManifestEntry, "risk" | "agent_modes">,
  spec: { risk: ToolRisk; agent_modes: AgentMode[] }
) {
  return (
    entry.risk === spec.risk
    && entry.agent_modes.length === spec.agent_modes.length
    && entry.agent_modes.every((mode, index) => mode === spec.agent_modes[index])
  );
}
