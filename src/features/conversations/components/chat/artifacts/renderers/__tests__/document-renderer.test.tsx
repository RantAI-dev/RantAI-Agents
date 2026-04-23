// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { DocumentRenderer } from "../document-renderer"
import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { reportExample } from "@/lib/document-ast/examples/report"
import { letterExample } from "@/lib/document-ast/examples/letter"

describe("DocumentRenderer", () => {
  it.each([
    ["proposal", proposalExample],
    ["report", reportExample],
    ["letter", letterExample],
  ])("renders the %s fixture with substantive markup", (_name, ast) => {
    const { container } = render(<DocumentRenderer content={JSON.stringify(ast)} />)
    expect(container.innerHTML.length).toBeGreaterThan(500)
    // Basic sanity: if there's a cover page, its title should appear in the output.
    if (ast.coverPage?.title) {
      expect(container.textContent).toContain(ast.coverPage.title)
    }
    // Any heading text should appear in the output.
    const firstHeading = ast.body.find((b: any) => b.type === "heading")
    if (firstHeading && (firstHeading as any).children[0]?.type === "text") {
      expect(container.textContent).toContain((firstHeading as any).children[0].text)
    }
  })

  it("renders a skeleton for empty content", () => {
    const { container } = render(<DocumentRenderer content="" />)
    expect(container.textContent?.toLowerCase()).toContain("generating")
  })

  it("renders a skeleton for malformed JSON", () => {
    const { container } = render(<DocumentRenderer content="{ not valid" />)
    expect(container.textContent?.toLowerCase()).toContain("generating")
  })

  it("renders a skeleton for JSON that doesn't match the schema", () => {
    const content = '{"not":"a document"}'
    const { container } = render(<DocumentRenderer content={content} />)
    expect(container.textContent?.toLowerCase()).toContain("generating")
  })
})
