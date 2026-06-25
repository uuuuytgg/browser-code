import http from "node:http";

import { CaptureTaskSchema } from "@ska/schemas";
import { skaVersion } from "@ska/shared";

import {
  BridgeHealthSchema,
  BridgeSubmitTaskResponseSchema,
  type BridgeTaskRecord
} from "./bridge-protocol";
import type { RuntimeTaskHandler } from "./runtime-client";
import { TaskStore } from "./task-store";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 34567;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export type CreateLocalBridgeServerOptions = {
  host?: string;
  port?: number;
  token?: string;
  maxBodyBytes?: number;
  runtimeHandler: RuntimeTaskHandler;
  taskStore?: TaskStore;
};

export type LocalBridgeServer = {
  host: string;
  port: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  url(pathname?: string): string;
  getTask(taskId: string): BridgeTaskRecord | undefined;
};

export function createLocalBridgeServer(
  options: CreateLocalBridgeServerOptions
): LocalBridgeServer {
  const host = options.host ?? DEFAULT_HOST;
  const requestedPort = options.port ?? DEFAULT_PORT;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const taskStore = options.taskStore ?? new TaskStore();

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        return sendJson(response, 200, BridgeHealthSchema.parse({
          ok: true,
          name: "sidebar-knowledge-agent-bridge",
          version: skaVersion
        }));
      }

      if (request.method === "POST" && request.url === "/tasks") {
        if (!isAuthorized(request, options.token)) {
          return sendJson(response, 401, {
            ok: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Missing or invalid X-SKA-Token"
            }
          });
        }

        const rawBody = await readRequestBody(request, maxBodyBytes);
        const task = CaptureTaskSchema.parse(JSON.parse(rawBody));
        taskStore.submit(task);

        void options.runtimeHandler(task)
          .then((result) => {
            taskStore.settle(task.task_id, result);
          })
          .catch((error) => {
            taskStore.fail(task.task_id, {
              code: "RUNTIME_EXECUTION_FAILED",
              message: error instanceof Error ? error.message : "Unknown runtime error"
            });
          });

        return sendJson(response, 200, BridgeSubmitTaskResponseSchema.parse({
          ok: true,
          task_id: task.task_id,
          status: "processing"
        }));
      }

      if (request.method === "GET" && request.url?.startsWith("/tasks/")) {
        if (!isAuthorized(request, options.token)) {
          return sendJson(response, 401, {
            ok: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Missing or invalid X-SKA-Token"
            }
          });
        }

        const taskId = decodeURIComponent(request.url.slice("/tasks/".length));
        const record = taskStore.get(taskId);
        if (!record) {
          return sendJson(response, 404, {
            ok: false,
            error: {
              code: "TASK_NOT_FOUND",
              message: `Task ${taskId} was not found`
            }
          });
        }

        return sendJson(response, 200, record);
      }

      return sendJson(response, 404, {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Route not found"
        }
      });
    } catch (error) {
      const issueMessage = error instanceof Error ? error.message : "Unknown request error";
      const statusCode = isValidationLikeError(error) ? 400 : 500;
      return sendJson(response, statusCode, {
        ok: false,
        error: {
          code: statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR",
          message: issueMessage
        }
      });
    }
  });

  return {
    host,
    get port() {
      const address = server.address();
      if (address && typeof address === "object") {
        return address.port;
      }

      return requestedPort;
    },
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(requestedPort, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
    },
    async stop() {
      if (!server.listening) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    url(pathname = "") {
      return `http://${host}:${this.port}${pathname}`;
    },
    getTask(taskId: string) {
      return taskStore.get(taskId);
    }
  };
}

async function readRequestBody(request: http.IncomingMessage, maxBodyBytes: number) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > maxBodyBytes) {
      throw new Error(`Request body exceeds ${maxBodyBytes} bytes`);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function isAuthorized(request: http.IncomingMessage, token?: string) {
  if (!token) {
    return true;
  }

  return request.headers["x-ska-token"] === token;
}

function isValidationLikeError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "issues" in error &&
      Array.isArray((error as { issues?: unknown }).issues)
  );
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}
