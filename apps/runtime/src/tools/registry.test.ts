import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AgentMode } from "@ska/schemas";

import { ToolRegistry } from "./registry";

function createSpec(name: string, risk: "low" | "medium" | "high" | "critical" = "low") {
  return {
    name,
    description: `${name} desc`,
    risk,
    agent_modes: ["curator"] as AgentMode[],
    input_schema: z.object({ ok: z.boolean().optional() }),
    output_schema: z.object({ ok: z.boolean() })
  };
}

describe("ToolRegistry", () => {
  it("rejects forbidden tools even if code tries to register them", () => {
    expect(
      () =>
        new ToolRegistry([
          {
            spec: createSpec("run_shell"),
            async execute() {
              return { ok: true };
            }
          }
        ])
    ).toThrow("FORBIDDEN_TOOL");
  });

  it("rejects tools missing from the manifest", () => {
    expect(
      () =>
        new ToolRegistry([
          {
            spec: createSpec("totally_new_tool"),
            async execute() {
              return { ok: true };
            }
          }
        ])
    ).toThrow("TOOL_NOT_DECLARED_IN_MANIFEST");
  });
});
