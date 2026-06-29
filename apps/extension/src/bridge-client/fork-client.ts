/**
 * Fork client -- direct HTTP/JSON connection to `browser-code serve`
 *
 * Replaces the old local-bridge (`localhost-client.ts`) intermediate layer.
 *
 * Session lifecycle:
 *   1. POST /session            → create session, get sessionID
 *   2. POST /session/{id}/promptAsync → enqueue user message (204 NoContent)
 *   3. GET  /session/{id}/message    → poll for messages (updates)
 *   4. POST /session/{id}/abort      → abort processing
 *
 * Auth: Basic `opencode:{password}`, password read from env or passed in.
 *
 * NOTE: This is a plain fetch-based client. The opencode SDK is not an
 * available dependency in the extension package.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Represents a chat message returned by the fork server. */
export interface ForkMessage {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly parts: ForkMessagePart[]
  readonly status?: string
}

export type ForkMessagePart =
  | { type: "text"; text: string; synthetic?: boolean }
  | { type: "tool_use"; name: string; input: unknown; result?: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown }

export interface ForkSession {
  readonly sessionID: string
  readonly title?: string
}

export interface PollResult {
  readonly messages: ForkMessage[]
  readonly sessionID: string
}

// ─── Error ──────────────────────────────────────────────────────────────────

export class ForkClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = "ForkClientError"
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────

export class ForkClient {
  private readonly baseUrl: string
  private readonly authHeader: string

  private constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl
    this.authHeader = `Basic ${btoa(`${username}:${password}`)}`
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  /** Create a ForkClient from default environment config. */
  static connect(port = 34567, password?: string): ForkClient {
    const pw = password ?? (typeof process !== "undefined" ? process.env.BROWSER_CODE_SERVER_PASSWORD : undefined) ?? "opencode"
    return new ForkClient(`http://127.0.0.1:${port}`, "opencode", pw)
  }

  /** Create a ForkClient with explicit URL and credentials. */
  static create(url: string, username: string, password: string): ForkClient {
    return new ForkClient(url.replace(/\/+$/, ""), username, password)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
    }

    if (body !== undefined) {
      headers["content-type"] = "application/json"
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    // 204 NoContent
    if (response.status === 204) {
      return undefined as T
    }

    if (!response.ok) {
      let errorBody: unknown
      try {
        errorBody = await response.json()
      } catch {
        try {
          errorBody = await response.text()
        } catch {
          errorBody = null
        }
      }
      throw new ForkClientError(
        `Fork server request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody,
      )
    }

    // Text response (SSE or plain text)
    const ct = response.headers.get("content-type") ?? ""
    if (ct.includes("text/")) {
      return (await response.text()) as T
    }

    return (await response.json()) as T
  }

  // ── API methods ────────────────────────────────────────────────────────────

  /**
   * POST /session -- create a new session.
   * Body is optional; if omitted the server creates a default session.
   */
  async createSession(input?: {
    title?: string
    agent?: string
  }): Promise<ForkSession> {
    const session = await this.request<{ id: string; title?: string }>(
      "POST",
      "/session",
      input ?? undefined,
    )
    return {
      sessionID: session.id,
      title: session.title,
    }
  }

  /**
   * POST /session/{sessionID}/promptAsync -- enqueue a user message.
   * Returns 204 NoContent immediately. The server processes asynchronously;
   * poll GET /session/{sessionID}/message for results.
   */
  async sendMessage(
    sessionID: string,
    text: string,
  ): Promise<void> {
    await this.request<void>("POST", `/session/${encodeURIComponent(sessionID)}/prompt_async`, {
      parts: [
        {
          type: "text" as const,
          text,
        },
      ],
    })
  }

  /**
   * GET /session/{sessionID}/message -- retrieve all messages in a session.
   * Optional limit/before for pagination.
   */
  async getMessages(
    sessionID: string,
    options?: { limit?: number; before?: string },
  ): Promise<ForkMessage[]> {
    const params = new URLSearchParams()
    if (options?.limit !== undefined) params.set("limit", String(options.limit))
    if (options?.before) params.set("before", options.before)
    const qs = params.toString()
    const path = `/session/${encodeURIComponent(sessionID)}/message${qs ? `?${qs}` : ""}`
    const raw = await this.request<Array<{ info: { id: string; role: "user" | "assistant"; finish?: string }; parts: ForkMessagePart[] }>>("GET", path)
    return raw.map((msg) => ({
      id: msg.info.id,
      role: msg.info.role,
      parts: msg.parts,
      status: msg.info.finish,
    }))
  }

  /**
   * Wait for a non-user response message in the session.
   * Polls getMessages at the given interval, up to `maxAttempts`.
   * Returns once an assistant message with content appears that was not
   * present when polling started.
   */
  async waitForResponse(
    sessionID: string,
    options?: { attempts?: number; intervalMs?: number },
  ): Promise<ForkMessage | null> {
    const attempts = options?.attempts ?? 120
    const intervalMs = options?.intervalMs ?? 500
    const knownIDs = new Set<string>()

    // Seed known IDs
    const initial = await this.getMessages(sessionID)
    for (const msg of initial) knownIDs.add(msg.id)

    for (let i = 0; i < attempts; i++) {
      const messages = await this.getMessages(sessionID)
      // Look for a response that wasn't in the initial set
      for (const msg of messages) {
        if (knownIDs.has(msg.id)) continue
        if (msg.role === "assistant") {
          return msg
        }
      }

      if (messages.length > initial.length) {
        // A new message appeared but isn't assistant role yet; mark it
        for (const msg of messages) {
          knownIDs.add(msg.id)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    return null
  }

  /**
   * POST /session/{sessionID}/abort -- cancel any in-flight processing.
   */
  async abortSession(sessionID: string): Promise<void> {
    await this.request<void>("POST", `/session/${encodeURIComponent(sessionID)}/abort`)
  }

  /**
   * DELETE /session/{sessionID} -- remove the session.
   */
  async removeSession(sessionID: string): Promise<void> {
    await this.request<void>("DELETE", `/session/${encodeURIComponent(sessionID)}`)
  }

  // ── Convenience: send-and-poll ─────────────────────────────────────────────

  /**
   * Send a message and poll for a response.
   * Returns the response message or null on timeout.
   */
  async sendAndWait(
    sessionID: string,
    text: string,
    options?: { attempts?: number; intervalMs?: number },
  ): Promise<ForkMessage | null> {
    await this.sendMessage(sessionID, text)
    return this.waitForResponse(sessionID, options)
  }

  /**
   * Health check + fetch existing sessions.
   * The server returns `{ data: session[], cursor: {...} }` so we unwrap `.data`.
   * Returns an empty array on failure.
   */
  async healthCheck(): Promise<Array<{ id: string; status?: string; time?: { updated?: number } }>> {
    try {
      const res = await this.request<Array<{ id: string } & Record<string, unknown>>>("GET", "/session?limit=10")
      return Array.isArray(res) ? res : []
    } catch {
      return []
    }
  }

  // ── SSE subscription ──────────────────────────────────────────────────

  /**
   * Subscribe to real-time session events via SSE.
   * Returns an AbortController that the caller uses to stop the subscription.
   * `onEvent` is called for each parsed SSE event. `onError` is called if
   * the stream fails or closes unexpectedly.
   */
  subscribeToSessionEvents(
    sessionID: string,
    onEvent: (event: { type: string; data: unknown }) => void,
    onError?: (err: unknown) => void,
  ): AbortController {
    const controller = new AbortController()
    const url = `${this.baseUrl}/session/${encodeURIComponent(sessionID)}/events`

    const run = async () => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: this.authHeader },
          signal: controller.signal,
        })
        if (!response.ok || !response.body) {
          onError?.(new ForkClientError(`SSE connection failed: ${response.status}`, response.status))
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          let eventType = ""
          let eventData = ""
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim()
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6).trim()
            } else if (line === "") {
              // Empty line = end of event
              if (eventData) {
                try {
                  const parsed = JSON.parse(eventData) as { type: string; data: unknown }
                  onEvent(parsed)
                } catch {
                  // skip unparseable data
                }
              }
              eventType = ""
              eventData = ""
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return
        onError?.(err)
      }
    }

    run()
    return controller
  }
}
