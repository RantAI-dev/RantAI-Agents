import { describe, it, expect } from "vitest"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"

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
