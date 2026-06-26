import { runAgentTask } from "./agent/task-runner";
import { createRuntimeAgent, RuntimeAgent } from "./agent/loop";
import { resolveRuntimeConfig } from "./config";
import { buildHarnessInput, buildTaskInstruction, readSystemPrompt } from "./model/harness";
import { MockModelProvider } from "./model/mock-provider";
import { AnthropicProvider } from "./model/anthropic";
import { createProvider, createProviderFromEnv } from "./model/provider-factory";
import { createStage1MockTools } from "./tools/mock-tools";
import { createRegisteredTools } from "./tools/registered-tools";
import { DeepSeekProvider } from "./model/deepseek";
import { OpenAIProvider } from "./model/openai";
import { providerNames, type ProviderName } from "./model/provider";

export const runtimeAppInfo = {
  name: "@ska/runtime",
  displayName: "Browser Code Runtime",
  stage: 13,
  businessLogicImplemented: true
} as const;

export { runAgentTask };
export {
  AnthropicProvider,
  DeepSeekProvider,
  MockModelProvider,
  OpenAIProvider,
  RuntimeAgent,
  buildHarnessInput,
  buildTaskInstruction,
  createRuntimeAgent,
  createProvider,
  createProviderFromEnv,
  createRegisteredTools,
  createStage1MockTools,
  resolveRuntimeConfig,
  readSystemPrompt
};

export { providerNames };
export type { ProviderName };

if (process.argv[1]?.endsWith("index.ts")) {
  console.log(`${runtimeAppInfo.displayName} placeholder ready for Stage ${runtimeAppInfo.stage}.`);
}
