import path from "node:path";
import { fileURLToPath } from "node:url";

import { BridgeHealthSchema, BridgeSubmitTaskResponseSchema, BridgeTaskStatusSchema } from "./bridge-protocol";
import { createLocalBridgeServer } from "./localhost-server";
import { createRuntimeTaskHandler } from "./runtime-client";
import { TaskStore } from "./task-store";

export const bridgeAppInfo = {
  name: "@ska/local-bridge",
  displayName: "Sidebar Knowledge Agent Local Bridge",
  stage: 5,
  businessLogicImplemented: true,
  transport: "localhost-http"
} as const;

export {
  BridgeHealthSchema,
  BridgeSubmitTaskResponseSchema,
  BridgeTaskStatusSchema,
  createLocalBridgeServer,
  createRuntimeTaskHandler,
  TaskStore
};

async function main() {
  const port = Number(process.env.SKA_BRIDGE_PORT ?? "34567");
  const host = process.env.SKA_BRIDGE_HOST ?? "127.0.0.1";
  const token = process.env.SKA_BRIDGE_TOKEN;
  const runtimeHandler = createRuntimeTaskHandler({
    tempDir: path.resolve(process.env.SKA_TEMP_DIR ?? "temp"),
    vaultDir: path.resolve(process.env.SKA_VAULT_DIR ?? "vault")
  });

  const server = createLocalBridgeServer({
    host,
    port,
    token,
    runtimeHandler
  });

  await server.start();
  console.log(`${bridgeAppInfo.displayName} listening at ${server.url()}`);
}

const currentFilePath = fileURLToPath(import.meta.url);
const launchedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFilePath === launchedPath) {
  void main();
}
