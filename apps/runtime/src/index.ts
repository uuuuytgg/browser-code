import { runAgentTask } from "./agent/task-runner";
import { buildHarnessInput, buildTaskInstruction, readSystemPrompt } from "./model/harness";
import { MockModelProvider } from "./model/mock-provider";
import { AnthropicProvider } from "./model/anthropic";
import { createProvider, createProviderFromEnv } from "./model/provider-factory";
import { createStage1MockTools } from "./tools/mock-tools";
import { createRegisteredTools } from "./tools/registered-tools";
import { DeepSeekProvider } from "./model/deepseek";
import { OpenAIProvider } from "./model/openai";

export const runtimeAppInfo = {
  name: "@ska/runtime",
  displayName: "Sidebar Knowledge Agent Runtime",
  stage: 6,
  businessLogicImplemented: true
} as const;

export { runAgentTask };
export {
  AnthropicProvider,
  DeepSeekProvider,
  MockModelProvider,
  OpenAIProvider,
  buildHarnessInput,
  buildTaskInstruction,
  createProvider,
  createProviderFromEnv,
  createRegisteredTools,
  createStage1MockTools,
  readSystemPrompt
};

if (process.argv[1]?.endsWith("index.ts")) {
  console.log(`${runtimeAppInfo.displayName} placeholder ready for Stage ${runtimeAppInfo.stage}.`);
}
