import { describe, expect, it } from "vitest"
import { withTimeout } from "../../src/lib/async/with-timeout"

describe("withTimeout", () => {
  it("returns the fallback when the promise is too slow", async () => {
    const slow = new Promise<number[]>((r) => setTimeout(() => r([1]), 200))
    await expect(withTimeout(slow, 20, [])).resolves.toEqual({ value: [], timedOut: true })
  })
  it("returns the value when it arrives in time (control)", async () => {
    await expect(withTimeout(Promise.resolve([1]), 50, [])).resolves.toEqual({ value: [1], timedOut: false })
  })
  it("returns the fallback when the promise rejects", async () => {
    await expect(withTimeout(Promise.reject(new Error("x")), 50, [] as number[])).resolves.toEqual({ value: [], timedOut: false })
  })
})
