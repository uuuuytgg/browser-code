import type { AgentMode, ToolCall } from "@ska/schemas";
import type { ToolImplementation, ToolSpec } from "./types";
import { buildManifestLookup, loadToolManifest, manifestEntryMatchesSpec } from "./manifest";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolImplementation>();

  constructor(tools: ToolImplementation[]) {
    const manifest = loadToolManifest();
    const manifestLookup = buildManifestLookup(manifest);

    for (const tool of tools) {
      if (manifest.forbidden_tools.includes(tool.spec.name)) {
        throw new Error(`FORBIDDEN_TOOL: ${tool.spec.name}`);
      }

      const manifestEntry = manifestLookup.get(tool.spec.name);
      if (!manifestEntry) {
        throw new Error(`TOOL_NOT_DECLARED_IN_MANIFEST: ${tool.spec.name}`);
      }

      if (!manifestEntry.implemented) {
        throw new Error(`TOOL_NOT_IMPLEMENTED_IN_MANIFEST: ${tool.spec.name}`);
      }

      if (!manifestEntryMatchesSpec(manifestEntry, tool.spec)) {
        throw new Error(`TOOL_SPEC_MISMATCH: ${tool.spec.name}`);
      }

      if (this.tools.has(tool.spec.name)) {
        throw new Error(`DUPLICATE_TOOL_REGISTRATION: ${tool.spec.name}`);
      }

      this.tools.set(tool.spec.name, tool);
    }
  }

  getTool(name: string) {
    return this.tools.get(name);
  }

  getToolsForMode(mode: AgentMode): ToolImplementation[] {
    return [...this.tools.values()].filter((tool) => tool.spec.agent_modes.includes(mode));
  }

  validate(toolCall: ToolCall, mode: AgentMode):
    | { ok: true; spec: ToolSpec }
    | { ok: false; error: { code: string; message: string } } {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        ok: false,
        error: {
          code: "UNKNOWN_TOOL",
          message: `Unknown tool: ${toolCall.name}`
        }
      };
    }

    if (!tool.spec.agent_modes.includes(mode)) {
      return {
        ok: false,
        error: {
          code: "TOOL_NOT_ALLOWED_FOR_MODE",
          message: `Tool ${toolCall.name} is not available for mode ${mode}`
        }
      };
    }

    const parsed = tool.spec.input_schema.safeParse(toolCall.input);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "TOOL_INPUT_INVALID",
          message: parsed.error.message
        }
      };
    }

    return {
      ok: true,
      spec: tool.spec
    };
  }
}
