// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { DocumentRenderer } from "../document-renderer"
import { proposalExample } from "@/lib/document-ast/examples/proposal"
import { reportExample } from "@/lib/document-ast/examples/report"
import { letterExample } from "@/lib/document-ast/examples/letter"

// The MermaidPreviewBlock dynamically imports `mermaid` and calls
// `mermaid.render(...)`. Real mermaid in jsdom is flaky because its
// dagre layout depends on getBBox / getComputedTextLength implementations
// jsdom does not ship; the renderer has prototype shims for those, but
// browser-API differences (DOMPurify global binding, defs handling) still
// cause sporadic failures. We mock the whole module so this suite only
// asserts the renderer's wiring (the dynamic import resolves, the render
// call returns an SVG string, the SVG ends up in the DOM).
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" data-mock="1" id="${id}"><g><text>mocked</text></g></svg>`,
    })),
  },
}))

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

describe("DocumentRenderer — mermaid block", () => {
  const minimalMeta = { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false }

  it("renders mermaid SVG into the document flow", async () => {
    const ast = {
      meta: minimalMeta,
      body: [{ type: "mermaid", code: "flowchart TD\n  A --> B", caption: "Flow caption" }],
    }
    const content = JSON.stringify(ast)
    const { container, findByText } = render(<DocumentRenderer content={content} />)
    await waitFor(() => {
      expect(container.querySelector("svg")).toBeTruthy()
    })
    expect(await findByText("Flow caption")).toBeTruthy()
  })
})

describe("DocumentRenderer — chart block", () => {
  const minimalMeta = { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false }

  it("renders a chart SVG into the document flow", () => {
    const ast = {
      meta: minimalMeta,
      body: [
        {
          type: "chart",
          chart: { type: "bar", title: "Rev", data: [{ label: "Q1", value: 100 }, { label: "Q2", value: 200 }] },
          caption: "Chart caption",
        },
      ],
    }
    const content = JSON.stringify(ast)
    const { container, getByText } = render(<DocumentRenderer content={content} />)
    expect(container.querySelector("svg")).toBeTruthy()
    expect(getByText("Chart caption")).toBeTruthy()
  })
})
