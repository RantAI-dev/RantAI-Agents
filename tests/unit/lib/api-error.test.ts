import { describe, expect, it } from "vitest"
import { readApiError } from "@/lib/api/error"

function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("readApiError", () => {
  it("shows the bad fields' own sentences, not the generic invalid_request one", async () => {
    const failure = await readApiError(
      answer(400, {
        error: {
          code: "invalid_request",
          message: "The request is not valid.",
          requestId: "r1",
          errors: [
            { field: "/issuer", code: "invalid", message: "Enter the realm URL." },
            { field: "/domains", code: "too_many", message: "Use up to 50 domain names." },
          ],
        },
      }),
    )
    expect(failure.code).toBe("invalid_request")
    expect(failure.message).toBe("Enter the realm URL. Use up to 50 domain names.")
    expect(failure.fields.map((f) => f.field)).toEqual(["/issuer", "/domains"])
  })

  it("keeps the message when there are no field errors", async () => {
    const failure = await readApiError(
      answer(409, { error: { code: "conflict", message: "That domain is taken.", requestId: "r2" } }),
    )
    expect(failure).toEqual({
      code: "conflict",
      message: "That domain is taken.",
      requestId: "r2",
      status: 409,
      fields: [],
    })
  })

  it("reads the older { error: string } shape", async () => {
    const failure = await readApiError(answer(403, { error: "Forbidden" }))
    expect(failure.message).toBe("Forbidden")
    expect(failure.code).toBeNull()
    expect(failure.fields).toEqual([])
  })
})
