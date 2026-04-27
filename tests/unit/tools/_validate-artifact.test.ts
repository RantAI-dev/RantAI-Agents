import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

describe("validateArtifactContent — text/document with documentFormat: script", () => {
  it("delegates script content to the script validator", async () => {
    const validScript = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("x")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const r = await validateArtifactContent("text/document", validScript, { documentFormat: "script" })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects script with syntax errors", async () => {
    const r = await validateArtifactContent("text/document", "const x = (", { documentFormat: "script" })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/syntax/i)
  })

  it("still validates AST when documentFormat is ast (legacy path unchanged)", async () => {
    const ast = JSON.stringify({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [{ type: "text", text: "ok" }] }],
    })
    const r = await validateArtifactContent("text/document", ast, { documentFormat: "ast" })
    expect(r.ok).toBe(true)
  })
})
