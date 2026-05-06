// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => <pre data-testid="sd">{children}</pre>,
}))
vi.mock("streamdown/styles.css", () => ({}))
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }))

import { CodeRenderer } from "./code-renderer"
import type { Artifact } from "../../types"

const baseArtifact: Artifact = {
  id: "art-1",
  title: "debounce.ts",
  type: "application/code",
  content: "export const x = 1\nexport const y = 2\n",
  language: "typescript",
  version: 2,
  previousVersions: [],
}

const baseProps = {
  artifact: baseArtifact,
  hasPreviousVersion: false as boolean,
  mode: "source" as "source" | "diff",
  onModeChange: () => {},
}

describe("CodeRenderer", () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => sessionStorage.clear())

  it("defaults to source mode and renders content via Streamdown", () => {
    const { getByTestId } = render(<CodeRenderer {...baseProps} />)
    expect(getByTestId("sd")).not.toBeNull()
  })

  it("renders the status bar with the line count", () => {
    const { getByText } = render(<CodeRenderer {...baseProps} />)
    // baseArtifact.content has 3 lines (including trailing empty after final \n)
    expect(getByText(/\d+ lines?/)).not.toBeNull()
  })

  it("opens the search popup with role='dialog' when Ctrl+F is pressed", () => {
    const { container, getByRole } = render(<CodeRenderer {...baseProps} />)
    const root = container.firstChild as HTMLElement
    fireEvent.keyDown(root, { key: "f", ctrlKey: true })
    expect(getByRole("dialog", { name: /search in code/i })).not.toBeNull()
  })

  it("opens the search popup when the status-bar Ctrl+F hint is clicked", () => {
    const { getByLabelText, getByRole } = render(<CodeRenderer {...baseProps} />)
    fireEvent.click(getByLabelText(/open search/i))
    expect(getByRole("dialog", { name: /search in code/i })).not.toBeNull()
  })

  it("closes the search popup on Escape inside the input", () => {
    const { getByLabelText, queryByRole, getByPlaceholderText } = render(
      <CodeRenderer {...baseProps} />,
    )
    fireEvent.click(getByLabelText(/open search/i))
    expect(queryByRole("dialog")).not.toBeNull()
    fireEvent.keyDown(getByPlaceholderText(/search/i), { key: "Escape" })
    expect(queryByRole("dialog")).toBeNull()
  })

  it("renders the diff view when mode='diff' is passed in (controlled)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ kind: "ok" as const, content: "old" })
    const { getByText } = render(
      <CodeRenderer
        {...baseProps}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
        mode="diff"
      />,
    )
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    // diff view shows its loading state immediately (source view never does); confirms we're on the diff branch
    expect(getByText(/loading previous version/i)).not.toBeNull()
  })

  it("calls onModeChange('source') when diff becomes unavailable while in diff mode", () => {
    const onModeChange = vi.fn()
    render(
      <CodeRenderer
        {...baseProps}
        hasPreviousVersion={false}
        mode="diff"
        onModeChange={onModeChange}
      />,
    )
    expect(onModeChange).toHaveBeenCalledWith("source")
  })

  it("does not refetch when re-mounting with the same mode (caching via state-machine reset key)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ kind: "ok" as const, content: "old" })
    const { rerender } = render(
      <CodeRenderer
        {...baseProps}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
        mode="diff"
      />,
    )
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    rerender(
      <CodeRenderer
        {...baseProps}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
        mode="source"
      />,
    )
    rerender(
      <CodeRenderer
        {...baseProps}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
        mode="diff"
      />,
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("persists wrap toggle state in sessionStorage keyed on artifact id", () => {
    const { getByLabelText } = render(<CodeRenderer {...baseProps} />)
    fireEvent.click(getByLabelText(/enable line wrap/i))
    expect(sessionStorage.getItem("code-wrap:art-1")).toBe("true")
  })

  it("hydrates wrap state from sessionStorage on mount", () => {
    sessionStorage.setItem("code-wrap:art-1", "true")
    const { getByLabelText } = render(<CodeRenderer {...baseProps} />)
    expect(getByLabelText(/disable line wrap/i)).not.toBeNull()
  })
})
