import type { AgentMode, ToolRisk } from "@ska/schemas";

export const toolResourcePackageInfo = {
  name: "@ska/tool-resource",
  stage: 0,
  placeholderTools: [
    {
      name: "scan_page_resources",
      risk: "low" as ToolRisk,
      agent_modes: ["resource"] as AgentMode[]
    },
    {
      name: "download_asset",
      risk: "high" as ToolRisk,
      agent_modes: ["resource"] as AgentMode[]
    }
  ]
} as const;
