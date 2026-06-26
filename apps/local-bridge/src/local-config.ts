import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";
import { providerNames, type ProviderName } from "@ska/runtime";

const providerNameSchema = z.enum(providerNames);

const LocalBridgeConfigSchema = z.object({
  provider: providerNameSchema.default("mock"),
  model: z.string().optional(),
  apiKeys: z.record(z.string(), z.string()).default({}),
  vaultDir: z.string().optional(),
  tempDir: z.string().optional()
});

export type LocalBridgeConfig = z.infer<typeof LocalBridgeConfigSchema>;

export const PublicBridgeConfigSchema = z.object({
  provider: providerNameSchema,
  model: z.string().optional(),
  vaultDir: z.string(),
  tempDir: z.string(),
  keyConfigured: z.boolean(),
  configPath: z.string()
});

export type PublicBridgeConfig = z.infer<typeof PublicBridgeConfigSchema>;

export const UpdateBridgeConfigSchema = z.object({
  provider: providerNameSchema.optional(),
  model: z.string().trim().min(1).optional(),
  apiKey: z.string().optional(),
  vaultDir: z.string().trim().min(1).optional(),
  tempDir: z.string().trim().min(1).optional()
});

export type UpdateBridgeConfig = z.infer<typeof UpdateBridgeConfigSchema>;

export function getBrowserCodeHome() {
  return path.join(os.homedir(), ".browser-code");
}

export function getDefaultConfigPath() {
  return process.env.BROWSER_CODE_CONFIG
    ? path.resolve(process.env.BROWSER_CODE_CONFIG)
    : path.join(getBrowserCodeHome(), "config.json");
}

export function getDefaultVaultDir() {
  return path.join(getBrowserCodeHome(), "vault");
}

export function getDefaultTempDir() {
  return path.join(getBrowserCodeHome(), "temp");
}

export class LocalConfigStore {
  constructor(private readonly configPath = getDefaultConfigPath()) {}

  get path() {
    return this.configPath;
  }

  async read(): Promise<LocalBridgeConfig> {
    let raw: string | undefined;
    try {
      raw = await fs.readFile(this.configPath, "utf8");
    } catch {
      raw = undefined;
    }

    const fromFile = raw ? JSON.parse(raw) : {};
    const parsed = LocalBridgeConfigSchema.parse(fromFile);
    const provider = resolveProviderName(process.env.SKA_MODEL_PROVIDER) ?? parsed.provider;

    return {
      ...parsed,
      provider,
      model: process.env.SKA_MODEL_NAME ?? parsed.model,
      vaultDir: process.env.SKA_VAULT_DIR ?? parsed.vaultDir,
      tempDir: process.env.SKA_TEMP_DIR ?? parsed.tempDir
    };
  }

  async update(input: UpdateBridgeConfig): Promise<PublicBridgeConfig> {
    const parsed = UpdateBridgeConfigSchema.parse(input);
    const current = await this.read();
    const provider = parsed.provider ?? current.provider;
    const apiKeys = { ...current.apiKeys };

    if (typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0) {
      apiKeys[provider] = parsed.apiKey.trim();
    }

    const next = LocalBridgeConfigSchema.parse({
      provider,
      model: parsed.model ?? current.model,
      apiKeys,
      vaultDir: parsed.vaultDir ?? current.vaultDir,
      tempDir: parsed.tempDir ?? current.tempDir
    });

    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return toPublicConfig(next, this.configPath);
  }

  async readPublic(): Promise<PublicBridgeConfig> {
    return toPublicConfig(await this.read(), this.configPath);
  }
}

export function toPublicConfig(config: LocalBridgeConfig, configPath = getDefaultConfigPath()): PublicBridgeConfig {
  const provider = config.provider;
  return PublicBridgeConfigSchema.parse({
    provider,
    model: config.model,
    vaultDir: path.resolve(config.vaultDir ?? getDefaultVaultDir()),
    tempDir: path.resolve(config.tempDir ?? getDefaultTempDir()),
    keyConfigured: Boolean(config.apiKeys[provider] || apiKeyFromEnv(provider)),
    configPath
  });
}

export function getApiKeyForProvider(config: LocalBridgeConfig) {
  return config.apiKeys[config.provider] || apiKeyFromEnv(config.provider);
}

function apiKeyFromEnv(provider: ProviderName) {
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY;
  return undefined;
}

function resolveProviderName(value: string | undefined) {
  return value && providerNames.includes(value as ProviderName)
    ? value as ProviderName
    : undefined;
}
