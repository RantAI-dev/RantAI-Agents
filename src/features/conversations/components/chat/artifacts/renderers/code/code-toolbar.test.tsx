// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { CodeToolbar } from "./code-toolbar"

describe("CodeToolbar", () => {
  const baseProps = {
    language: "typescript",
    isCanonicalLanguage: true,
    isStreaming: false,
    wrap: false,
    onWrapToggle: () => {},
    searchOpen: false,
    onSearchToggle: () => {},
    diffMode: false,
    onDiffToggle: () => {},
    diffEnabled: true,
    diffDisabledReason: undefined as string | undefined,
  }

  it("renders the language pill with the current language", () => {
    const { getByText } = render(<CodeToolbar {...baseProps} />)
    expect(getByText("typescript")).not.toBeNull()
  })

  it("shows a warning icon next to the language pill for off-canonical languages", () => {
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} isCanonicalLanguage={false} />,
    )
    expect(getByLabelText(/off-canonical language/i)).not.toBeNull()
  })

  it("shows the streaming pill when isStreaming is true", () => {
    const { getByText } = render(<CodeToolbar {...baseProps} isStreaming={true} />)
    expect(getByText(/writing/i)).not.toBeNull()
  })

  it("toggles wrap when the wrap button is clicked", () => {
    const onWrapToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} onWrapToggle={onWrapToggle} />,
    )
    fireEvent.click(getByLabelText(/wrap/i))
    expect(onWrapToggle).toHaveBeenCalledOnce()
  })

  it("toggles search when the search button is clicked", () => {
    const onSearchToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} onSearchToggle={onSearchToggle} />,
    )
    fireEvent.click(getByLabelText(/search/i))
    expect(onSearchToggle).toHaveBeenCalledOnce()
  })

  it("toggles diff when the diff button is clicked and diffEnabled", () => {
    const onDiffToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} onDiffToggle={onDiffToggle} />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    expect(onDiffToggle).toHaveBeenCalledOnce()
  })

  it("disables the diff toggle when diffEnabled is false", () => {
    const onDiffToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar
        {...baseProps}
        diffEnabled={false}
        diffDisabledReason="No previous version to compare"
        onDiffToggle={onDiffToggle}
      />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onDiffToggle).not.toHaveBeenCalled()
  })

  it("renders the active state outline when wrap is true", () => {
    const { getByLabelText } = render(<CodeToolbar {...baseProps} wrap={true} />)
    expect(getByLabelText(/wrap/i).getAttribute("data-active")).toBe("true")
  })
})
