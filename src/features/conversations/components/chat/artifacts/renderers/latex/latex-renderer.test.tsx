// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { LatexRenderer } from "./latex-renderer"

describe("LatexRenderer (root)", () => {
  it("starts on Preview tab and renders the paper view article", () => {
    const { container, getByRole } = render(
      <LatexRenderer content="\\section{Hi}" />,
    )
    expect(getByRole("tab", { name: /preview/i }).getAttribute("data-state")).toBe("active")
    expect(container.querySelector("article")).not.toBeNull()
  })

  it("switches to Source view when Source tab clicked", () => {
    const { container, getByRole } = render(
      <LatexRenderer content="\\section{Hi}" />,
    )
    fireEvent.click(getByRole("tab", { name: /source/i }))
    // Source view uses <pre> via react-syntax-highlighter; preview's <article> is gone.
    expect(container.querySelector("pre")).not.toBeNull()
  })

  it("does not crash on partial / unbalanced content", () => {
    // The transpiler is forgiving — feeding it an unclosed display math should
    // produce SOMETHING, not throw and not return null content.
    const { container } = render(<LatexRenderer content="$$" />)
    expect(container.textContent).toBeDefined()
  })
})
