import { Schema } from "effect"
import { SessionID } from "./schema"

export const CurrentSessionInfo = Schema.Struct({
  sessionID: SessionID,
  source: Schema.Literal("tui"),
  updated: Schema.Number,
})

export type CurrentSessionInfo = typeof CurrentSessionInfo.Type

type SetInput = {
  sessionID: CurrentSessionInfo["sessionID"]
  updated?: number
}

let current: CurrentSessionInfo | undefined

export namespace CurrentSession {
  export function get(): CurrentSessionInfo | undefined {
    return current ? { ...current } : undefined
  }

  export function set(input: SetInput): CurrentSessionInfo {
    current = {
      sessionID: input.sessionID,
      source: "tui",
      updated: input.updated ?? Date.now(),
    }
    return { ...current }
  }

  /** @internal Test helper. */
  export function clear(): void {
    current = undefined
  }
}
