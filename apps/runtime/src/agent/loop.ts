import type { CaptureTask, RunAgentTaskResult } from "@ska/schemas";

import { resolveRuntimeConfig, type RuntimeConfig } from "../config";
import { createProvider } from "../model/provider-factory";
import type { ModelProvider } from "../model/provider";
import { createRegisteredTools } from "../tools/registered-tools";
import type { ToolImplementation } from "../tools/types";
import { runAgentTask } from "./task-runner";

export type RuntimeAgentOptions = {
  config?: Partial<RuntimeConfig>;
  provider?: ModelProvider;
  tools?: ToolImplementation[];
  mockOutputs?: unknown[];
};

export class RuntimeAgent {
  constructor(
    readonly config: RuntimeConfig,
    private readonly provider: ModelProvider,
    private readonly tools: ToolImplementation[]
  ) {}

  async runTask(task: CaptureTask): Promise<RunAgentTaskResult> {
    return runAgentTask(task, {
      provider: this.provider,
      tools: this.tools,
      tempDir: this.config.tempDir,
      vaultDir: this.config.vaultDir,
      sessionDir: this.config.sessionDir,
      maxStepsOverride: this.config.maxStepsOverride
    });
  }
}

export function createRuntimeAgent(options: RuntimeAgentOptions = {}) {
  const baseConfig = resolveRuntimeConfig();
  const config: RuntimeConfig = {
    ...baseConfig,
    ...options.config
  };

  return new RuntimeAgent(
    config,
    options.provider ?? createProvider(config.provider, { mockOutputs: options.mockOutputs }),
    options.tools ?? createRegisteredTools()
  );
}
