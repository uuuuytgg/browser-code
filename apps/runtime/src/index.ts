import { runAgentTask } from "./agent/task-runner";
import { MockModelProvider } from "./model/mock-provider";
import { createStage1MockTools } from "./tools/mock-tools";

export const runtimeAppInfo = {
  name: "@ska/runtime",
  displayName: "Sidebar Knowledge Agent Runtime",
  stage: 1,
  businessLogicImplemented: true
} as const;

export { runAgentTask };
export { MockModelProvider, createStage1MockTools };

if (process.argv[1]?.endsWith("index.ts")) {
  console.log(`${runtimeAppInfo.displayName} placeholder ready for Stage ${runtimeAppInfo.stage}.`);
}
