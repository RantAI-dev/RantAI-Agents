import { describe, expect, it } from "vitest"
import { readJsonOrText } from "@/lib/tools/utils"

// Found re-testing QA CHAT-037: a custom tool pointed at an HTML endpoint
// failed with "Body already used" instead of returning the page text.
describe("readJsonOrText", () => {
  it("returns text for a non-JSON body", async () => {
    await expect(readJsonOrText(new Response("<html>ok</html>"))).resolves.toBe("<html>ok</html>")
  })

  it("parses a JSON body (control)", async () => {
    await expect(readJsonOrText(new Response('{"sent":true}'))).resolves.toEqual({ sent: true })
  })
})
