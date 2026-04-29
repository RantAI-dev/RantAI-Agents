import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

describe("validateArtifactContent — text/document (script-only after AST removal)", () => {
  it("delegates script content to the script validator", async () => {
    const validScript = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("x")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const r = await validateArtifactContent("text/document", validScript)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects script with syntax errors", async () => {
    const r = await validateArtifactContent("text/document", "const x = (")
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/syntax/i)
  })
})
