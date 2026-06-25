import { describe, expect, it } from "vitest";
import toolManifest from "../../../tool-manifests/tools.json";

import { extensionAppInfo } from "@ska/extension";
import { bridgeAppInfo } from "@ska/local-bridge";
import { mcpServerAppInfo } from "@ska/mcp-server";
import { runtimeAppInfo } from "@ska/runtime";
import { toolResourcePackageInfo } from "@ska/tool-resource";
import { toolVaultPackageInfo } from "@ska/tool-vault";
import { toolVideoPackageInfo } from "@ska/tool-video";
import { toolWebPackageInfo } from "@ska/tool-web";
import { prohibitedToolNames, skaPaths, skaVersion } from "@ska/shared";

describe("Stage 0 workspace exports", () => {
  it("exposes shared constants", () => {
    expect(skaVersion).toBe("0.1.0");
    expect(skaPaths.toolManifestPath).toBe("./tool-manifests/tools.json");
    expect(prohibitedToolNames).toContain("run_shell");
  });

  it("keeps app entrypoints importable", () => {
    expect(runtimeAppInfo.name).toBe("@ska/runtime");
    expect(bridgeAppInfo.name).toBe("@ska/local-bridge");
    expect(mcpServerAppInfo.defaultAccess).toBe("read-only");
    expect(extensionAppInfo.name).toBe("@ska/extension");
  });

  it("keeps tool package placeholders importable", () => {
    expect(toolWebPackageInfo.placeholderTools[0]?.name).toBe("web_to_markdown");
    expect(toolVideoPackageInfo.placeholderTools[1]?.risk).toBe("high");
    expect(toolResourcePackageInfo.placeholderTools[0]?.agent_modes).toContain("resource");
    expect(toolVaultPackageInfo.placeholderTools.map((tool) => tool.name)).toContain("search_vault");
  });

  it("keeps tool manifest entries aligned with package metadata", () => {
    const manifestNames = toolManifest.tools.map((tool) => tool.name);
    const webTool = toolManifest.tools.find((tool) => tool.name === "web_to_markdown");
    const saveTool = toolManifest.tools.find((tool) => tool.name === "save_markdown_note");

    expect(manifestNames).toContain(toolWebPackageInfo.placeholderTools[0]?.name);
    expect(webTool?.risk).toBe(toolWebPackageInfo.placeholderTools[0]?.risk);
    expect(webTool?.implemented).toBe(true);
    expect(saveTool?.implemented).toBe(true);
    expect(toolVaultPackageInfo.placeholderTools[0]?.implemented).toBe(true);
  });
});
