// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { CodeDiffView } from "./code-diff-view"

describe("CodeDiffView", () => {
  const baseProps = {
    prevState: { kind: "ok" as const, content: "a\nb\n" },
    after: "a\nB\n",
    layout: "unified" as const,
    onLayoutChange: () => {},
    wrap: false,
    onRestorePrevious: undefined as ((versionNum: number) => void) | undefined,
    previousVersionNum: 1,
  }

  it("renders a centered spinner when prevState is loading", () => {
    const { getByText } = render(
      <CodeDiffView {...baseProps} prevState="loading" />,
    )
    expect(getByText(/loading previous version/i)).not.toBeNull()
  })

  it("renders an error notice with a Retry button when prevState.kind === 'error'", () => {
    const onRetry = vi.fn()
    const { getByText, getByRole } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "error", message: "network down" }}
        onRetry={onRetry}
      />,
    )
    expect(getByText(/network down/i)).not.toBeNull()
    expect(getByRole("button", { name: /retry/i })).not.toBeNull()
  })

  it("renders the archived notice with a Restore button when prevState.kind === 'archived'", () => {
    const onRestore = vi.fn()
    const { getByText, getByRole } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "archived" }}
        onRestorePrevious={onRestore}
      />,
    )
    expect(getByText(/archived to storage/i)).not.toBeNull()
    fireEvent.click(getByRole("button", { name: /restore/i }))
    expect(onRestore).toHaveBeenCalledWith(1)
  })

  it("renders 'no changes' when prevState content equals after", () => {
    const { getByText } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "ok", content: "same\n" }}
        after={"same\n"}
      />,
    )
    expect(getByText(/no changes between/i)).not.toBeNull()
  })

  it("renders unified diff with added/removed lines", () => {
    const { getByText, container } = render(<CodeDiffView {...baseProps} />)
    expect(getByText("a")).not.toBeNull()
    expect(getByText("B")).not.toBeNull()
    expect(container.querySelectorAll("[data-diff-kind='added']").length).toBeGreaterThan(0)
    expect(container.querySelectorAll("[data-diff-kind='removed']").length).toBeGreaterThan(0)
  })

  it("renders split diff with two columns when layout is split", () => {
    const { container } = render(<CodeDiffView {...baseProps} layout="split" />)
    expect(container.querySelectorAll("[data-diff-column='left']")).toHaveLength(1)
    expect(container.querySelectorAll("[data-diff-column='right']")).toHaveLength(1)
  })

  it("calls onLayoutChange when the layout toggle is clicked", () => {
    const onLayoutChange = vi.fn()
    const { getByRole } = render(
      <CodeDiffView {...baseProps} onLayoutChange={onLayoutChange} />,
    )
    fireEvent.click(getByRole("button", { name: /split/i }))
    expect(onLayoutChange).toHaveBeenCalledWith("split")
  })

  it("warns about large diffs when over 5000 lines", () => {
    const huge = Array.from({ length: 6000 }, (_, i) => `line${i}`).join("\n")
    const { getByText } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "ok", content: huge }}
        after={huge + "\nextra"}
      />,
    )
    expect(getByText(/large diff/i)).not.toBeNull()
  })

  it("does not crash on a 50k-line input", () => {
    const huge = "x\n".repeat(50_000)
    const { container } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "ok", content: huge }}
        after={huge + "y\n"}
      />,
    )
    expect(container.firstChild).not.toBeNull()
  })
})
