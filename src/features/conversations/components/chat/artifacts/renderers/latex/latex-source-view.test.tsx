// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { LatexSourceView } from "./latex-source-view"

describe("LatexSourceView", () => {
  it("renders the source inside a <pre>", () => {
    const { container } = render(<LatexSourceView source="\\section{Hi}" />)
    const pre = container.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain("\\section{Hi}")
  })

  it("preserves line breaks in source", () => {
    const { container } = render(
      <LatexSourceView source={"\\begin{theorem}\nbody\n\\end{theorem}"} />,
    )
    const pre = container.querySelector("pre")
    expect(pre?.textContent).toContain("\\begin{theorem}")
    expect(pre?.textContent).toContain("body")
    expect(pre?.textContent).toContain("\\end{theorem}")
  })

  it("fills the panel and uses a centered max-width container (matches preview convention)", () => {
    const { container } = render(<LatexSourceView source="x" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toMatch(/flex-1/)
    expect(wrapper.className).toMatch(/overflow-auto/)
    // No floating-card chrome (no dark canvas background, no shadow card)
    expect(wrapper.className).not.toMatch(/dark:bg-zinc-900/)
  })
})
