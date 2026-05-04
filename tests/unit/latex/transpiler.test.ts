// @vitest-environment jsdom
import { describe, it, expect } from "vitest"

// Tests target the future module path created in Task 2 by extracting latexToHtml
// out of latex-renderer.tsx. After Task 2 lands, the import below resolves and
// the suite locks in the existing transpiler behavior plus the i++ fix for
// single-line display math from commit 4b72c66.
import { latexToHtml } from "@/features/conversations/components/chat/artifacts/renderers/latex/lib/transpiler"

describe("latexToHtml — regression", () => {
  it("renders single-line $$x = y$$ without hanging (regression for 4b72c66)", () => {
    const start = Date.now()
    const out = latexToHtml("$$x = y$$", new Map())
    expect(Date.now() - start).toBeLessThan(50)
    expect(out.html).toContain("math-block")
  })

  it("renders single-line \\[x = y\\] without hanging (regression for 4b72c66)", () => {
    const start = Date.now()
    const out = latexToHtml("\\[x = y\\]", new Map())
    expect(Date.now() - start).toBeLessThan(50)
    expect(out.html).toContain("math-block")
  })

  it("renders \\section{Title} as <h2>", () => {
    const out = latexToHtml("\\section{Hello}", new Map())
    expect(out.html).toMatch(/<h2[^>]*>Hello<\/h2>/)
  })

  it("renders \\subsection{Title} as <h3>", () => {
    const out = latexToHtml("\\subsection{Sub}", new Map())
    expect(out.html).toMatch(/<h3[^>]*>Sub<\/h3>/)
  })

  it("renders itemize block as <ul><li>", () => {
    const out = latexToHtml(
      "\\begin{itemize}\n\\item alpha\n\\item beta\n\\end{itemize}",
      new Map(),
    )
    expect(out.html).toMatch(/<ul>/)
    expect(out.html).toMatch(/<li>alpha<\/li>/)
    expect(out.html).toMatch(/<li>beta<\/li>/)
  })

  it("renders enumerate block as <ol><li>", () => {
    const out = latexToHtml(
      "\\begin{enumerate}\n\\item one\n\\item two\n\\end{enumerate}",
      new Map(),
    )
    expect(out.html).toMatch(/<ol>/)
    expect(out.html).toMatch(/<li>one<\/li>/)
    expect(out.html).toMatch(/<li>two<\/li>/)
  })

  it("renders \\textbf as <strong>", () => {
    const out = latexToHtml("Plain \\textbf{bold} text.", new Map())
    expect(out.html).toContain("<strong>bold</strong>")
  })

  it("preserves multi-line $$...$$ display math through KaTeX", () => {
    const out = latexToHtml("$$\nx = y\n$$", new Map())
    expect(out.html).toContain("math-block")
  })

  it("strips \\documentclass and \\usepackage preamble", () => {
    const out = latexToHtml(
      "\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nHello\n\\end{document}",
      new Map(),
    )
    expect(out.html).not.toContain("documentclass")
    expect(out.html).not.toContain("usepackage")
    expect(out.html).toContain("Hello")
  })

  it("renders \\begin{align}...\\end{align} as one math-block", () => {
    const out = latexToHtml(
      "\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}",
      new Map(),
    )
    const matches = out.html.match(/math-block/g) ?? []
    expect(matches.length).toBe(1)
  })

  it("returns empty warnings array when no \\eqref references are unresolvable", () => {
    const out = latexToHtml("\\section{Title}", new Map())
    expect(Array.isArray(out.warnings)).toBe(true)
    expect(out.warnings).toHaveLength(0)
  })
})
