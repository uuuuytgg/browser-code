export const skaVersion = "0.1.0";

export const skaPaths = {
  vaultDir: "./vault",
  tempDir: "./temp",
  promptsDir: "./prompts",
  toolManifestPath: "./tool-manifests/tools.json"
} as const;

export const prohibitedToolNames = [
  "run_shell",
  "execute_command",
  "eval_js",
  "run_python"
] as const;

export const stage0Scope = {
  stage: 0,
  businessLogicImplemented: false
} as const;
