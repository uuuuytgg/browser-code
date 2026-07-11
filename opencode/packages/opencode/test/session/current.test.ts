import { describe, expect, test } from "bun:test"
import { CurrentSession } from "@/session/current"
import { SessionID } from "@/session/schema"

describe("current session registry", () => {
  test("starts empty", () => {
    CurrentSession.clear()

    expect(CurrentSession.get()).toBeUndefined()
  })

  test("records the latest TUI session", () => {
    CurrentSession.clear()

    const firstID = SessionID.descending("ses_first")
    const secondID = SessionID.descending("ses_second")
    const first = CurrentSession.set({ sessionID: firstID, updated: 100 })
    const second = CurrentSession.set({ sessionID: secondID, updated: 200 })

    expect(first).toEqual({ sessionID: firstID, source: "tui", updated: 100 })
    expect(second).toEqual({ sessionID: secondID, source: "tui", updated: 200 })
    expect(CurrentSession.get()).toEqual(second)
  })
})
