// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { CodeStatusBar } from "./code-status-bar"

describe("CodeStatusBar", () => {
  const baseProps = {
    lineCount: 78,
    wrap: false,
    onWrapToggle: () => {},
  }

  it("renders the line count with the right pluralization", () => {
    const { getByText, rerender } = render(<CodeStatusBar {...baseProps} />)
    expect(getByText(/78 lines/)).not.toBeNull()
    rerender(<CodeStatusBar {...baseProps} lineCount={1} />)
    expect(getByText(/1 line\b/)).not.toBeNull()
  })

  it("shows static encoding/EOL info", () => {
    const { getByText } = render(<CodeStatusBar {...baseProps} />)
    expect(getByText(/UTF-8/)).not.toBeNull()
    expect(getByText(/LF/)).not.toBeNull()
  })

  it("flips the wrap label based on the prop", () => {
    const { getByLabelText, rerender } = render(<CodeStatusBar {...baseProps} wrap={false} />)
    expect(getByLabelText(/enable line wrap/i).textContent).toMatch(/wrap: off/i)
    rerender(<CodeStatusBar {...baseProps} wrap={true} />)
    expect(getByLabelText(/disable line wrap/i).textContent).toMatch(/wrap: on/i)
  })

  it("fires onWrapToggle when wrap is clicked", () => {
    const onWrapToggle = vi.fn()
    const { getByLabelText } = render(<CodeStatusBar {...baseProps} onWrapToggle={onWrapToggle} />)
    fireEvent.click(getByLabelText(/enable line wrap/i))
    expect(onWrapToggle).toHaveBeenCalledOnce()
  })

  it("sets aria-pressed on the wrap button matching the wrap state", () => {
    const { getByLabelText, rerender } = render(<CodeStatusBar {...baseProps} wrap={false} />)
    expect(getByLabelText(/wrap/i).getAttribute("aria-pressed")).toBe("false")
    rerender(<CodeStatusBar {...baseProps} wrap={true} />)
    expect(getByLabelText(/wrap/i).getAttribute("aria-pressed")).toBe("true")
  })
})
