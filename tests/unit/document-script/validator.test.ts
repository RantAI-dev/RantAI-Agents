import { describe, it, expect } from "vitest"
import { validateScriptArtifact } from "@/lib/document-script/validator"

const VALID = `
import { Document, Paragraph, TextRun, Packer } from "docx"
const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("ok")] })] }] })
Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
`

const SYNTAX_ERROR = `const x = (`

const NOT_DOCX = `process.stdout.write(Buffer.from("hello").toString("base64"))`

describe("validateScriptArtifact", () => {
  it("accepts a valid script that produces a docx", async () => {
    const r = await validateScriptArtifact(VALID)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects scripts with syntax errors before running them", async () => {
    const r = await validateScriptArtifact(SYNTAX_ERROR)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/syntax|parse/i)
  })

  it("rejects scripts whose output is not a valid .docx", async () => {
    const r = await validateScriptArtifact(NOT_DOCX)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/not a valid \.docx/i)
  })
})
