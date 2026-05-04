// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { LatexPaperView } from "./latex-paper-view"

describe("LatexPaperView", () => {
  it("renders the html into an article element", () => {
    const html = '<p>Hello <strong>world</strong></p>'
    const { container } = render(<LatexPaperView html={html} />)
    const article = container.querySelector("article")
    expect(article).not.toBeNull()
    expect(article?.innerHTML).toContain("Hello")
    expect(article?.innerHTML).toContain("<strong>world</strong>")
  })

  it("renders inside a centered paper-styled article", () => {
    const { container } = render(<LatexPaperView html="<p>x</p>" />)
    const article = container.querySelector("article")
    expect(article?.className).toMatch(/bg-white/)
    expect(article?.className).toMatch(/max-w-\[720px\]/)
  })

  it("smooth-scrolls when an eqref link is clicked", () => {
    const html =
      '<div id="eq-foo" class="latex-equation">target</div>' +
      '<p>see <a href="#eq-foo" data-eqref>(1)</a></p>'
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<LatexPaperView html={html} />)
    const link = container.querySelector('[data-eqref]') as HTMLElement
    fireEvent.click(link)
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    })
  })

  it("ignores clicks outside eqref links", () => {
    const html = '<p>plain <span>text</span></p>'
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = render(<LatexPaperView html={html} />)
    fireEvent.click(container.querySelector("span") as HTMLElement)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
