// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

// Stub heavy / browser-only deps that the renderer pulls in.
// 1. The kernel hook spawns a real Web Worker which jsdom doesn't implement.
// 2. The pin hook reads from sessionStorage on mount — fine in isolation, but
//    we keep it deterministic.
vi.mock("@/features/conversations/components/chat/artifacts/renderers/notebook/use-kernel", () => ({
  useKernel: () => ({
    kernelStatus: "idle",
    runningCellId: null,
    runCell: vi.fn(),
    runAll: vi.fn(),
    interrupt: vi.fn(),
    restart: vi.fn(),
  }),
}))

// Replace the heavyweight cell view (CodeMirror) with a passthrough that
// surfaces the cell source as a data attribute — that's what the render test
// will assert on.
vi.mock(
  "@/features/conversations/components/chat/artifacts/renderers/notebook/cell",
  () => ({
    NotebookCellView: ({ cell }: { cell: { source: string; id: string } }) => (
      <div data-testid="cell" data-cell-id={cell.id} data-source={cell.source} />
    ),
  }),
)

vi.mock(
  "@/features/conversations/components/chat/artifacts/renderers/notebook/notebook-toolbar",
  () => ({
    NotebookToolbar: () => <div data-testid="toolbar" />,
  }),
)

// import AFTER the vi.mock calls so the mocked modules are wired in.
const { NotebookRenderer } = await import(
  "@/features/conversations/components/chat/artifacts/renderers/notebook/notebook-renderer"
)

function makeNotebook(cells: Array<{ type: "code" | "markdown"; source: string }>) {
  return JSON.stringify({
    cells: cells.map((c) => ({ type: c.type, source: c.source })),
  })
}

describe("NotebookRenderer", () => {
  it("renders both cells of an initial notebook content prop", () => {
    const content = makeNotebook([
      { type: "code", source: "print('first cell')" },
      { type: "code", source: "print('second cell')" },
    ])

    const { container } = render(<NotebookRenderer artifactId="a-1" content={content} />)

    const cells = container.querySelectorAll('[data-testid="cell"]')
    expect(cells.length).toBe(2)
    expect(cells[0].getAttribute("data-source")).toBe("print('first cell')")
    expect(cells[1].getAttribute("data-source")).toBe("print('second cell')")
  })

  it("re-syncs the rendered cells when the content prop changes", () => {
    const initial = makeNotebook([
      { type: "code", source: "print('v1 cell a')" },
      { type: "code", source: "print('v1 cell b')" },
    ])
    const updated = makeNotebook([
      { type: "code", source: "print('v1 cell a')" },
      { type: "code", source: "print('v2 cell b')" },
      { type: "code", source: "print('v2 cell c')" },
    ])

    const { container, rerender: doRerender } = render(
      <NotebookRenderer artifactId="a-1" content={initial} />,
    )

    // Initial state is correct (otherwise a positive-control failure
    // would mask the sync test).
    let cells = container.querySelectorAll('[data-testid="cell"]')
    expect(cells.length).toBe(2)
    expect(cells[1].getAttribute("data-source")).toBe("print('v1 cell b')")

    // Now change the content prop — the renderer must adopt the new cells.
    doRerender(<NotebookRenderer artifactId="a-1" content={updated} />)

    cells = container.querySelectorAll('[data-testid="cell"]')
    expect(cells.length).toBe(3)
    expect(cells[1].getAttribute("data-source")).toBe("print('v2 cell b')")
    expect(cells[2].getAttribute("data-source")).toBe("print('v2 cell c')")
  })
})