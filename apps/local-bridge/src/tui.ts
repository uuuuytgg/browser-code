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
};

export async function startBrowserCodeTui() {
  const rl = readline.createInterface({ input, output });
  console.log("Browser Code TUI");
  console.log("输入 /doctor 查看状态，/config 配置模型，/ask 问知识库，/exit 退出。");

  try {
    await printDoctor();
  } catch (error) {
    console.log(error instanceof Error ? error.message : "无法连接本地 bridge。");
    rl.close();
    return;
  }

  while (true) {
    const line = (await rl.question("\nbrowser-code> ")).trim();
    if (!line) continue;
    if (line === "/exit" || line === "exit" || line === "quit") break;

    try {
      if (line === "/doctor") {
        await printDoctor();
      } else if (line === "/config") {
        await configure(rl);
      } else if (line.startsWith("/ask ")) {
        await askVault(line.slice("/ask ".length).trim());
      } else {
        await askVault(line);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : "未知错误");
    }
  }

  rl.close();
}

async function printDoctor() {
  const config = await getConfig();
  console.log(`Provider: ${config.provider}${config.model ? ` (${config.model})` : ""}`);
  console.log(`API Key: ${config.keyConfigured ? "已配置" : "未配置"}`);
  console.log(`Vault: ${config.vaultDir}`);
  console.log(`Bridge: ${BRIDGE_URL}`);
}

async function configure(rl: readline.Interface) {
  const current = await getConfig();
  const provider = (await rl.question(`provider [${current.provider}]: `)).trim() || current.provider;
  const model = (await rl.question(`model [${current.model ?? "默认"}]: `)).trim() || current.model;
  const apiKey = await rl.question("api key [留空不修改]: ");
  const vaultDir = (await rl.question(`vault [${current.vaultDir}]: `)).trim() || current.vaultDir;

  const updated = await patchConfig({
    provider,
    model,
    apiKey: apiKey.trim() || undefined,
    vaultDir
  });
  console.log(`已保存。Provider=${updated.provider}, Key=${updated.keyConfigured ? "已配置" : "未配置"}`);
}

async function askVault(query: string) {
  if (!query) {
    console.log("请输入问题，例如：/ask 这个知识库里有什么关于 React 的内容");
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

  throw new Error("任务仍在处理中，请稍后用插件查看结果。");
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
    throw new Error("无法连接本地 bridge，请先运行 browser-code start。");
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
    throw new Error(`Bridge request failed: ${response.status}`);
  }

  return response.json() as Promise<any>;
}
