import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

describe("validateLatex — cross-ref support", () => {
  it("accepts \\label, \\ref, \\eqref on a labeled equation", async () => {
    const content =
      "\\begin{equation}\n\\label{eq:foo}\nx = y\n\\end{equation}\n\nBy \\eqref{eq:foo}..."
    const r = await validateArtifactContent("text/latex", content, { isNew: true })
    expect(r.ok).toBe(true)
    // \label / \ref / \eqref should NOT appear in any warning string
    const allWarnings = (r.warnings ?? []).join(" ")
    expect(allWarnings).not.toMatch(/\\label/)
    expect(allWarnings).not.toMatch(/\\eqref/)
  })

  it("warns on unresolved \\eqref but stays ok", async () => {
    const content = "\\begin{equation}\nx = y\n\\end{equation}\n\nReference: \\eqref{eq:missing}."
    const r = await validateArtifactContent("text/latex", content, { isNew: true })
    expect(r.ok).toBe(true)
    expect(r.warnings ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/eq:missing/i)]),
    )
  })

  it("accepts theorem envs", async () => {
    const content =
      "\\begin{theorem}\\label{thm:mvt}\nLet f...\n\\end{theorem}\n\nBy \\ref{thm:mvt}..."
    const r = await validateArtifactContent("text/latex", content, { isNew: true })
    expect(r.ok).toBe(true)
  })

  it("still rejects banned envs (tabular, figure, tikzpicture)", async () => {
    for (const env of ["tabular", "figure", "tikzpicture"]) {
      const r = await validateArtifactContent(
        "text/latex",
        `\\begin{${env}}body\\end{${env}}`,
        { isNew: true },
      )
      expect(r.ok).toBe(false)
    }
  })
})
