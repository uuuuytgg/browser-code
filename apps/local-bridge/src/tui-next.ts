import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { buildCaptureTaskFromText } from "./tui-task";

const BRIDGE_URL = "http://127.0.0.1:34567";

type ConfigResponse = {
  provider: string;
  model?: string;
  vaultDir: string;
  tempDir: string;
  keyConfigured: boolean;
  configPath?: string;
};

type TuiOptions = {
  startBridge?: () => Promise<{ stop(): Promise<void>; url(pathname?: string): string }>;
};

export async function startBrowserCodeTui(options: TuiOptions = {}) {
  const rl = readline.createInterface({ input, output });
  let embeddedBridge: Awaited<ReturnType<NonNullable<TuiOptions["startBridge"]>>> | undefined;

  console.log("Browser Code TUI");
  console.log("输入 /doctor 查看状态，/config 配置模型，/ask 问知识库，/exit 退出。");
  console.log("也可以直接输入 apikey、配置、doctor 这些常用词。");

  try {
    await printDoctor();
  } catch (error) {
    if (!options.startBridge) {
      console.log(error instanceof Error ? error.message : "无法连接本地 bridge。");
      rl.close();
      return;
    }

    try {
      embeddedBridge = await options.startBridge();
      console.log(`已自动启动本地 bridge: ${embeddedBridge.url()}`);
      await printDoctor();
    } catch {
      console.log("无法连接本地 bridge，也无法自动启动。请先运行 browser-code start。");
      rl.close();
      return;
    }
  }

  while (true) {
    const rawLine = await askLine(rl, "\nbrowser-code> ");
    if (rawLine === undefined) break;

    const line = rawLine.trim();
    if (!line) continue;
    if (isExitCommand(line)) break;

    try {
      if (isDoctorCommand(line)) {
        await printDoctor();
      } else if (isConfigCommand(line)) {
        await configure(rl);
      } else if (startsWithCommand(line, "/ask") || startsWithCommand(line, "ask")) {
        await askVault(stripCommand(line));
      } else {
        await askVault(line);
      }
    } catch (error) {
      console.error(toFriendlyError(error));
    }
  }

  rl.close();
  if (embeddedBridge) {
    await embeddedBridge.stop();
  }
}

async function askLine(rl: readline.Interface, query: string) {
  try {
    return await rl.question(query);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ERR_USE_AFTER_CLOSE") {
      return undefined;
    }

    throw error;
  }
}

async function printDoctor() {
  const config = await getConfig();
  console.log(`Provider: ${config.provider}${config.model ? ` (${config.model})` : ""}`);
  console.log(`API Key: ${config.keyConfigured ? "已配置" : "未配置"}`);
  console.log(`Vault: ${config.vaultDir}`);
  console.log(`Temp: ${config.tempDir}`);
  if (config.configPath) console.log(`Config: ${config.configPath}`);
  console.log(`Bridge: ${BRIDGE_URL}`);
}

async function configure(rl: readline.Interface) {
  const current = await getConfig();
  console.log("按回车保留当前值。DeepSeek 默认模型建议先用 deepseek-chat。");

  const provider = (await rl.question(`provider [${current.provider}]: `)).trim() || current.provider;
  const modelInput = (await rl.question(`model [${current.model ?? "默认"}]: `)).trim();
  const apiKey = await rl.question("api key [留空不修改]: ");
  const vaultDir = (await rl.question(`vault [${current.vaultDir}]: `)).trim() || current.vaultDir;
  const tempDir = (await rl.question(`temp [${current.tempDir}]: `)).trim() || current.tempDir;

  const updated = await patchConfig({
    provider,
    model: modelInput || current.model,
    apiKey: apiKey.trim() || undefined,
    vaultDir,
    tempDir
  });

  console.log(`已保存。Provider=${updated.provider}${updated.model ? ` (${updated.model})` : ""}, Key=${updated.keyConfigured ? "已配置" : "未配置"}`);
  console.log(`Vault=${updated.vaultDir}`);
  console.log(`Temp=${updated.tempDir}`);
}

async function askVault(query: string) {
  if (!query) {
    console.log("请输入问题，例如：/ask 这个知识库里有什么关于 React 的内容？");
    return;
  }

  const task = buildCaptureTaskFromText("search_vault", query);
  const submitted = await request("/tasks", {
    method: "POST",
    body: JSON.stringify(task)
  });
  const record = await waitForTask(submitted.task_id);
  printTaskResult(record);
}

async function waitForTask(taskId: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const record = await request(`/tasks/${encodeURIComponent(taskId)}`);
    if (record.status !== "processing") {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("任务仍在处理中，请稍后用插件或 TUI 查看结果。");
}

function printTaskResult(record: any) {
  if (record.status === "done") {
    const answer = record.result?.answer;
    console.log(answer?.message ?? "任务完成。");
    if (answer?.file_path) console.log(`文件：${answer.file_path}`);
    if (Array.isArray(answer?.results)) {
      for (const item of answer.results.slice(0, 5)) {
        console.log(`- ${item.title} (${item.path})`);
      }
    }
    return;
  }

  if (record.status === "need_confirmation") {
    console.log("需要确认高风险操作，当前最小 TUI 暂不执行确认。");
    return;
  }

  console.log(record.result?.error?.message ?? "任务失败。");
}

async function getConfig(): Promise<ConfigResponse> {
  try {
    return await request("/config");
  } catch {
    throw new Error("无法连接本地 bridge，请先运行 browser-code start，或使用 browser-code tui 自动启动。");
  }
}

async function patchConfig(input: Record<string, unknown>): Promise<ConfigResponse> {
  return request("/config", {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

async function request(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${BRIDGE_URL}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Bridge request failed: ${response.status}${detail ? ` ${detail}` : ""}`);
  }

  return response.json() as Promise<any>;
}

function isExitCommand(line: string) {
  const command = normalizeCommand(line);
  return command === "/exit" || command === "exit" || command === "quit" || command === "退出";
}

function isDoctorCommand(line: string) {
  const command = normalizeCommand(line);
  return command === "/doctor" || command === "doctor" || command === "status" || command === "状态";
}

function isConfigCommand(line: string) {
  const command = normalizeCommand(line).replace(/\s+/g, " ");
  return [
    "/config",
    "config",
    "configure",
    "/apikey",
    "apikey",
    "api key",
    "key",
    "provider",
    "model",
    "配置",
    "设置",
    "密钥",
    "模型"
  ].includes(command);
}

function startsWithCommand(line: string, command: string) {
  const normalized = normalizeCommand(line);
  return normalized === command || normalized.startsWith(`${command} `);
}

function stripCommand(line: string) {
  const firstSpace = line.indexOf(" ");
  return firstSpace === -1 ? "" : line.slice(firstSpace + 1).trim();
}

function normalizeCommand(line: string) {
  return line.trim().toLowerCase();
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "未知错误";
  if (message.includes("deepseek request failed with status 400")) {
    return `${message}\n提示：这通常是模型名不被 DeepSeek 接受，或请求格式被 API 拒绝。建议运行 /config，把 model 先改成 deepseek-chat。`;
  }

  return message;
}
