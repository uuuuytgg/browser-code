import path from "node:path";
import { fileURLToPath } from "node:url";

import { skaVersion } from "@ska/shared";

import { BridgeHealthSchema, BridgeSubmitTaskResponseSchema, BridgeTaskStatusSchema } from "./bridge-protocol";
import { getDefaultTempDir, getDefaultVaultDir, LocalConfigStore } from "./local-config";
import { createLocalBridgeServer } from "./localhost-server";
import { createRuntimeTaskHandler } from "./runtime-client";
import { TaskStore } from "./task-store";

export const bridgeAppInfo = {
  name: "@ska/local-bridge",
  displayName: "Browser Code Local Bridge",
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

export async function startBridgeServer() {
  const port = Number(process.env.SKA_BRIDGE_PORT ?? "34567");
  const host = process.env.SKA_BRIDGE_HOST ?? "127.0.0.1";
  const token = process.env.SKA_BRIDGE_TOKEN;
  const configStore = new LocalConfigStore();
  const runtimeHandler = createRuntimeTaskHandler({
    readConfig: () => configStore.read()
  });

  const server = createLocalBridgeServer({
    host,
    port,
    token,
    runtimeHandler,
    configStore
  });

  await server.start();
  console.log(`${bridgeAppInfo.displayName} listening at ${server.url()}`);
  return server;
}

function printHelp() {
  console.log([
    "Browser Code CLI",
    "",
    "Usage:",
    "  browser-code start     Start the local bridge on 127.0.0.1 by default",
    "  browser-code tui       Open the minimal terminal interface",
    "  browser-code doctor    Print resolved local runtime and bridge configuration",
    "  browser-code version   Print the package version",
    "  browser-code help      Show this help",
    "",
    "Environment:",
    "  SKA_BRIDGE_HOST",
    "  SKA_BRIDGE_PORT",
    "  SKA_BRIDGE_TOKEN",
    "  SKA_VAULT_DIR",
    "  SKA_TEMP_DIR",
    "  SKA_MODEL_PROVIDER"
  ].join("\n"));
}

async function printDoctor() {
  const configStore = new LocalConfigStore();
  const config = await configStore.readPublic();
  const diagnostics = {
    name: bridgeAppInfo.displayName,
    bridgeHost: process.env.SKA_BRIDGE_HOST ?? "127.0.0.1",
    bridgePort: Number(process.env.SKA_BRIDGE_PORT ?? "34567"),
    modelProvider: config.provider,
    model: config.model ?? null,
    vaultDir: config.vaultDir || getDefaultVaultDir(),
    tempDir: config.tempDir || getDefaultTempDir(),
    keyConfigured: config.keyConfigured,
    configPath: config.configPath,
    tokenConfigured: Boolean(process.env.SKA_BRIDGE_TOKEN)
  };

  console.log(JSON.stringify(diagnostics, null, 2));
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "start";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "doctor") {
    await printDoctor();
    return;
  }

  if (command === "tui") {
    await startTui();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(skaVersion);
    return;
  }

  if (command !== "start") {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  await startBridgeServer();
}

async function startTui() {
  const { startBrowserCodeTui } = await import("./tui-next");
  await startBrowserCodeTui({
    startBridge: startBridgeServer
  });
}

function isDirectExecution() {
  if (typeof require !== "undefined" && typeof module !== "undefined") {
    return require.main === module;
  }

  const currentFilePath = fileURLToPath(import.meta.url);
  const launchedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return currentFilePath === launchedPath;
}

if (isDirectExecution()) {
  void main();
}
