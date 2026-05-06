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
  content: "export const x = 1\n",
  language: "typescript",
  version: 2,
  previousVersions: [],
}

describe("CodeRenderer", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })
  afterEach(() => {
    sessionStorage.clear()
  })

  it("defaults to source mode and renders content via Streamdown", () => {
    const { getByTestId } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    expect(getByTestId("sd")).not.toBeNull()
  })

  it("disables the diff toggle when hasPreviousVersion is false", () => {
    const { getByLabelText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("enables the diff toggle when hasPreviousVersion is true and not streaming", () => {
    const { getByLabelText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={async () => ({ kind: "ok", content: "old" })}
      />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it("disables the diff toggle while streaming even when hasPreviousVersion is true", () => {
    const streaming: Artifact = { ...baseArtifact, id: "streaming-tool-call-1" }
    const { getByLabelText, getByText } = render(
      <CodeRenderer
        artifact={streaming}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={async () => ({ kind: "ok", content: "old" })}
      />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(getByText(/writing/i)).not.toBeNull()
  })

  it("opens the search bar when the search toggle is clicked and closes on Escape", () => {
    const { getByLabelText, queryByPlaceholderText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    fireEvent.click(getByLabelText(/search/i))
    const input = queryByPlaceholderText(/search/i) as HTMLInputElement
    expect(input).not.toBeNull()
    fireEvent.keyDown(input, { key: "Escape" })
    expect(queryByPlaceholderText(/search/i)).toBeNull()
  })

  it("invokes fetchPreviousVersion when the user enters diff mode the first time", async () => {
    const fetcher = vi.fn().mockResolvedValue({ kind: "ok" as const, content: "export const x = 0\n" })
    const { getByLabelText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
      />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  })

  it("shows the loading state while the fetcher is in flight", async () => {
    let resolveIt: (v: { kind: "ok"; content: string }) => void = () => {}
    const fetcher = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveIt = resolve as typeof resolveIt }),
    )
    const { getByLabelText, getByText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
      />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    await waitFor(() => expect(getByText(/loading previous version/i)).not.toBeNull())
    resolveIt({ kind: "ok", content: "old" })
  })

  it("does not refetch when toggling diff off and back on (caching)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ kind: "ok" as const, content: "old" })
    const { getByLabelText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
      />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    fireEvent.click(getByLabelText(/diff/i))
    fireEvent.click(getByLabelText(/diff/i))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("persists wrap toggle state in sessionStorage keyed on artifact id", () => {
    const { getByLabelText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    fireEvent.click(getByLabelText(/wrap/i))
    expect(sessionStorage.getItem("code-wrap:art-1")).toBe("true")
  })

  it("hydrates wrap state from sessionStorage on mount", () => {
    sessionStorage.setItem("code-wrap:art-1", "true")
    const { getByLabelText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    expect(getByLabelText(/wrap/i).getAttribute("data-active")).toBe("true")
  })

  it("shows the off-canonical language warning when language is not on the Shiki list", () => {
    const odd: Artifact = { ...baseArtifact, language: "nim" }
    const { getByLabelText } = render(
      <CodeRenderer artifact={odd} hasPreviousVersion={false} />,
    )
    expect(getByLabelText(/off-canonical language/i)).not.toBeNull()
  })

  it("intercepts Cmd/Ctrl+F to open search when panel has focus", () => {
    const { container, queryByPlaceholderText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    const root = container.firstChild as HTMLElement
    fireEvent.keyDown(root, { key: "f", ctrlKey: true })
    expect(queryByPlaceholderText(/search/i)).not.toBeNull()
  })
})
