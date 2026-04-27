import { describe, it, expect } from "vitest"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const FIX = (name: string) => readFileSync(join(__dirname, "..", "..", "fixtures", "document-script", name), "utf8")

describe("runScriptInSandbox", () => {
  it("returns ok=true with a docx buffer for a minimal valid script", async () => {
    const script = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hello")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const r = await runScriptInSandbox(script, {})
    expect(r.ok).toBe(true)
    expect(r.buf).toBeInstanceOf(Buffer)
    // .docx files start with PK\x03\x04 (ZIP magic)
    expect(r.buf!.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })
})

describe("runScriptInSandbox — restrictions", () => {
  it("kills an infinite loop with a clear timeout error", async () => {
    const r = await runScriptInSandbox(FIX("infinite-loop.script.js"), { timeoutMs: 2_000 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/timeout/i)
  })

  it("rejects scripts that try to import fs", async () => {
    const r = await runScriptInSandbox(FIX("fs-access.script.js"), {})
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/forbidden|fs/i)
  })

  it("returns ok=true even for invalid docx output (caller verifies magic bytes)", async () => {
    // sandbox doesn't validate content shape — that's the validator's job
    const r = await runScriptInSandbox(FIX("invalid-output.script.js"), {})
    expect(r.ok).toBe(true)
    expect(r.buf!.subarray(0, 4)).not.toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })
})
