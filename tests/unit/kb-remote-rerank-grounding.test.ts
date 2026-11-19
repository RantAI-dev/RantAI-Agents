import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { __resetRemoteRouteCacheForTests } from "@/lib/kb-client/routing"
import { DEFAULT_GROUNDED_MIN_RERANK, retrieveForGroups } from "@/features/agent-api/kb-retrieval"
import { groundingOf } from "@/features/agent-api/grounding"

// Live numbers from the 2026-11-19 Kelas 7 benchmark: the correct rank-1 chunk for
// "What are big trees for?" had similarity 0.197 and rerankScore 0.889; an off-book
// question's best chunk had similarity 0.338 and rerankScore 0.111.
const chunk = (similarity: number, rerankScore?: number) => ({
  id: `c-${similarity}`, content: "x".repeat(200), documentId: "d1", documentTitle: "Buku", page: 3,
  similarity, retrieval: { arms: ["dense"], ...(rerankScore === undefined ? {} : { rerankScore }) },
})

let dir = ""
const realFetch = globalThis.fetch
function serve(chunks: unknown[]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ context: "ctx", chunks, sources: [{ documentTitle: "Buku", page: 3 }] }), {
      status: 200, headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kbroutes-"))
  fs.writeFileSync(path.join(dir, "routes.json"), JSON.stringify({ version: 1, groundedMinScore: 0.34, routes: { g1: { remoteKbId: "kb1", enabled: true } } }))
  process.env.KB_REMOTE_ROUTES_FILE = path.join(dir, "routes.json")
  process.env.KB_REMOTE_URL = "http://kb.test"
  process.env.KB_REMOTE_API_KEY = "k"
  __resetRemoteRouteCacheForTests({ statIntervalMs: 0 })
})
afterEach(() => {
  globalThis.fetch = realFetch
  fs.rmSync(dir, { recursive: true, force: true })
  delete process.env.KB_REMOTE_ROUTES_FILE
  delete process.env.KB_REMOTE_URL
  delete process.env.KB_REMOTE_API_KEY
})

const judge = async () => {
  const { result, groundedMinScore } = await retrieveForGroups("q", { groupIds: ["g1"] })
  return { grounded: groundingOf(result.results.map((r) => r.vectorScore), groundedMinScore).grounded, groundedMinScore }
}

describe("routed grounding on the reranker's scale", () => {
  it("an in-book answer with low similarity but a high rerank score is grounded", async () => {
    serve([chunk(0.197, 0.889), chunk(0.139, 0.2)])
    const r = await judge()
    expect(r.groundedMinScore).toBe(DEFAULT_GROUNDED_MIN_RERANK)
    expect(r.grounded).toBe(true)
  })

  it("an off-book question with higher similarity but a low rerank score is not grounded", async () => {
    serve([chunk(0.338, 0.111), chunk(0.3, 0.05)])
    expect((await judge()).grounded).toBe(false)
  })

  it("with no reranker at all it falls back to similarity and the route's threshold", async () => {
    serve([chunk(0.6), chunk(0.2)])
    const r = await judge()
    expect(r.groundedMinScore).toBe(0.34)
    expect(r.grounded).toBe(true)
  })

  it("the route table can set its own rerank threshold", async () => {
    fs.writeFileSync(path.join(dir, "routes.json"), JSON.stringify({ version: 1, groundedMinRerank: 0.95, routes: { g1: { remoteKbId: "kb1", enabled: true } } }))
    __resetRemoteRouteCacheForTests({ statIntervalMs: 0 })
    serve([chunk(0.197, 0.889)])
    const r = await judge()
    expect(r.groundedMinScore).toBe(0.95)
    expect(r.grounded).toBe(false)
  })
})
