import path from "node:path";

export type McpServerConfig = {
  vaultDir: string;
  allowWrite: boolean;
};

export function resolveMcpServerConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): McpServerConfig {
  return {
    vaultDir: path.resolve(cwd, env.SKA_VAULT_DIR ?? "./vault"),
    allowWrite: env.SKA_MCP_ALLOW_WRITE === "true"
  };
}
