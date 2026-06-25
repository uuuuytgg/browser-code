import type { AgentMode, ToolRisk } from "@ska/schemas";

export const toolVideoPackageInfo = {
  name: "@ska/tool-video",
  stage: 0,
  placeholderTools: [
    {
      name: "fetch_transcript",
      risk: "low" as ToolRisk,
      agent_modes: ["media"] as AgentMode[]
    },
    {
      name: "ffmpeg_extract_audio",
      risk: "high" as ToolRisk,
      agent_modes: ["media"] as AgentMode[]
    }
  ]
} as const;
