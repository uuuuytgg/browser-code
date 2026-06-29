import type { ForkMessage } from "../../bridge-client/fork-client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "status" | "error";
  text: string;
  fork?: ForkMessage;
};

/** 判断一条消息是否只包含中间步骤（无用户可见内容） */
function isIntermediateStep(msg: ForkMessage): boolean {
  return msg.parts.every((p) => {
    const type = p.type;
    // step-start / step-finish / reasoning 都是中间过程
    if (type === "step-start" || type === "step-finish") return true;
    if (type === "reasoning") return true;
    // 已完成的 tool（不含 running tool）也是中间过程
    if (type === "tool") {
      const state = (p as any).state?.status;
      return state === "completed" || state === "error" || !state;
    }
    // text 和 text 类型且 synthetic 标记的也算中间步骤
    if (type === "text" && (p as any).synthetic) return true;
    return false;
  });
}

/** 提取用户可见文本，纯中间步骤返回空字符串 */
export function renderForkText(msg: ForkMessage): string {
  // 纯中间步骤不显示
  if (isIntermediateStep(msg)) return "";

  const lines: string[] = [];
  for (const part of msg.parts) {
    if (part.type === "text" && !(part as any).synthetic) {
      lines.push(part.text);
    }
    if (part.type === "tool_use") {
      lines.push(`[工具: ${part.name}]`);
    }
    if (part.type === "tool_result") {
      const content =
        typeof part.content === "string"
          ? part.content.slice(0, 200)
          : JSON.stringify(part.content).slice(0, 200);
      lines.push(`[结果] ${content}`);
    }
    if (part.type === "tool") {
      const toolName = (part as any).tool ?? "unknown";
      lines.push(`[工具: ${toolName}]`);
      const output = (part as any).state?.output;
      if (output) {
        const content = typeof output === "string" ? output.slice(0, 200) : JSON.stringify(output).slice(0, 200);
        lines.push(`[结果] ${content}`);
      }
    }
  }
  return lines.join("\n\n");
}
