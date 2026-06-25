import type { AgentMode } from "@ska/schemas";

import type { ToolSpec } from "./types";

type PermissionDecision =
  | { decision: "allow" }
  | { decision: "confirm"; reason: string }
  | { decision: "deny"; reason: string };

export class PermissionGuard {
  check(spec: ToolSpec, mode: AgentMode): PermissionDecision {
    if (!spec.agent_modes.includes(mode)) {
      return {
        decision: "deny",
        reason: `Tool ${spec.name} is not allowed in mode ${mode}`
      };
    }

    if (spec.risk === "critical") {
      return {
        decision: "deny",
        reason: `Critical-risk tool ${spec.name} is disabled`
      };
    }

    if (spec.risk === "high" || spec.requires_confirmation) {
      return {
        decision: "confirm",
        reason: `High-risk tool ${spec.name} requires confirmation`
      };
    }

    return {
      decision: "allow"
    };
  }
}
