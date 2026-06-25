import path from "node:path";

import { providerNames, type ProviderName } from "./model/provider";

export type RuntimeConfig = {
  provider: ProviderName;
  tempDir: string;
  vaultDir: string;
  sessionDir: string;
  maxStepsOverride?: number;
};

function parseProviderName(rawProviderName?: string): ProviderName {
  if (rawProviderName && providerNames.includes(rawProviderName as ProviderName)) {
    return rawProviderName as ProviderName;
  }

  return "mock";
}

function parseMaxSteps(rawMaxSteps?: string) {
  if (!rawMaxSteps) {
    return undefined;
  }

  const parsed = Number(rawMaxSteps);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function resolveRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): RuntimeConfig {
  const tempDir = path.resolve(cwd, env.SKA_TEMP_DIR ?? "./temp");
  const vaultDir = path.resolve(cwd, env.SKA_VAULT_DIR ?? "./vault");

  return {
    provider: parseProviderName(env.SKA_MODEL_PROVIDER),
    tempDir,
    vaultDir,
    sessionDir: path.resolve(tempDir, "sessions"),
    maxStepsOverride: parseMaxSteps(env.SKA_MAX_STEPS)
  };
}
