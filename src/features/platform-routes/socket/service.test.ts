import { describe, expect, it } from "vitest"
import { getSocketHandshakePayload } from "./service"

describe("socket service", () => {
  it("returns the handshake payload", () => {
    expect(getSocketHandshakePayload()).toEqual({ message: "Socket.io endpoint" })
  })
})
