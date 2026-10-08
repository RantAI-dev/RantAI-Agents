/**
 * Unit tests for anchoring a guided-learning retrieval on the first topic.
 */
import { describe, it, expect } from "vitest"
import { anchoredQuery, anchorEnabled } from "@/features/agent-api/anchor-query"

const u = (content: string) => ({ role: "user", content })
const a = (content: string) => ({ role: "assistant", content })

describe("anchoredQuery", () => {
  it("leaves a first message alone", () => {
    expect(anchoredQuery([u("Saya ingin belajar sistem pencernaan")])).toBeNull()
  })

  it("searches a short follow-up together with the first topic", () => {
    const msgs = [u("Saya ingin belajar sistem pencernaan"), a("Organ apa yang kamu tahu?"), u("lambung")]
    expect(anchoredQuery(msgs)).toBe("Saya ingin belajar sistem pencernaan\nlambung")
  })

  it("keeps anchoring on the first topic many turns later, not the previous one", () => {
    const msgs = [u("Ajari aku fotosintesis"), a("?"), u("daun"), a("?"), u("ya")]
    expect(anchoredQuery(msgs)).toBe("Ajari aku fotosintesis\nya")
  })

  it("lets a long follow-up stand on its own — it is a new question", () => {
    const long = "Kalau begitu, bagaimana cara kerja enzim pepsin di dalam lambung manusia saat mencerna protein?"
    expect(anchoredQuery([u("Ajari aku pencernaan"), a("?"), u(long)])).toBeNull()
  })

  it("ignores system and assistant text when finding the topic", () => {
    const msgs = [{ role: "system", content: "aturan" }, a("Halo!"), u("Ajari aku pecahan"), a("?"), u("oke")]
    expect(anchoredQuery(msgs)).toBe("Ajari aku pecahan\noke")
  })

  it("does not double a message that repeats the first", () => {
    expect(anchoredQuery([u("pecahan"), a("?"), u("Pecahan")])).toBeNull()
  })
})

describe("anchorEnabled", () => {
  it("is off unless switched on", () => {
    expect(anchorEnabled({})).toBe(false)
    expect(anchorEnabled({ AGENT_API_ANCHOR_FIRST_TOPIC: "1" })).toBe(false)
    expect(anchorEnabled({ AGENT_API_ANCHOR_FIRST_TOPIC: "true" })).toBe(true)
  })
})
