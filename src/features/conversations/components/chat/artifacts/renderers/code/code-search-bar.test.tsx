// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { CodeSearchBar } from "./code-search-bar"

describe("CodeSearchBar", () => {
  it("renders the input and match count", () => {
    const { getByPlaceholderText, getByText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={3}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    expect(getByPlaceholderText(/search/i)).not.toBeNull()
    expect(getByText("1 of 3")).not.toBeNull()
  })

  it("renders 'no matches' when query is non-empty and matchCount is 0", () => {
    const { getByText } = render(
      <CodeSearchBar
        query="zzz"
        onQueryChange={() => {}}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    expect(getByText(/no matches/i)).not.toBeNull()
  })

  it("does not render a count badge when query is empty", () => {
    const { queryByText } = render(
      <CodeSearchBar
        query=""
        onQueryChange={() => {}}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    expect(queryByText(/no matches/i)).toBeNull()
    expect(queryByText(/of/i)).toBeNull()
  })

  it("fires onQueryChange when user types", () => {
    const onQueryChange = vi.fn()
    const { getByPlaceholderText } = render(
      <CodeSearchBar
        query=""
        onQueryChange={onQueryChange}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.change(getByPlaceholderText(/search/i), { target: { value: "abc" } })
    expect(onQueryChange).toHaveBeenCalledWith("abc")
  })

  it("fires onPrev/onNext when chevrons clicked", () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const { getByLabelText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={2}
        matchIndex={0}
        onPrev={onPrev}
        onNext={onNext}
        onClose={() => {}}
      />,
    )
    fireEvent.click(getByLabelText(/previous match/i))
    fireEvent.click(getByLabelText(/next match/i))
    expect(onPrev).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
  })

  it("fires onClose when Escape pressed", () => {
    const onClose = vi.fn()
    const { getByPlaceholderText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={1}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(getByPlaceholderText(/search/i), { key: "Escape" })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("fires onNext when Enter pressed and onPrev when Shift+Enter pressed", () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const { getByPlaceholderText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={2}
        matchIndex={0}
        onPrev={onPrev}
        onNext={onNext}
        onClose={() => {}}
      />,
    )
    fireEvent.keyDown(getByPlaceholderText(/search/i), { key: "Enter" })
    fireEvent.keyDown(getByPlaceholderText(/search/i), { key: "Enter", shiftKey: true })
    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrev).toHaveBeenCalledOnce()
  })

  it("is positioned as a floating popup with absolute positioning", () => {
    const { getByRole } = render(
      <CodeSearchBar
        query=""
        onQueryChange={() => {}}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    const popup = getByRole("dialog", { name: /search in code/i })
    expect(popup).not.toBeNull()
    expect(popup.className).toMatch(/absolute/)
    expect(popup.className).toMatch(/top-3/)
    expect(popup.className).toMatch(/right-3/)
  })
})
