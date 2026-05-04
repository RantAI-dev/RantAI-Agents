// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { LatexToolbar } from "./latex-toolbar"

describe("LatexToolbar", () => {
  it("renders Preview and Source tab triggers", () => {
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={() => {}}
        copied={false}
      />,
    )
    expect(getByRole("tab", { name: /preview/i })).not.toBeNull()
    expect(getByRole("tab", { name: /source/i })).not.toBeNull()
  })

  it("calls onTabChange when Source tab is clicked", () => {
    const onTabChange = vi.fn()
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={onTabChange}
        onCopy={() => {}}
        copied={false}
      />,
    )
    fireEvent.click(getByRole("tab", { name: /source/i }))
    expect(onTabChange).toHaveBeenCalledWith("source")
  })

  it("calls onCopy when Copy button clicked", () => {
    const onCopy = vi.fn()
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={onCopy}
        copied={false}
      />,
    )
    fireEvent.click(getByRole("button", { name: /copy/i }))
    expect(onCopy).toHaveBeenCalled()
  })

  it("ArrowRight on the active tab moves to the next tab and triggers onTabChange", () => {
    const onTabChange = vi.fn()
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={onTabChange}
        onCopy={() => {}}
        copied={false}
      />,
    )
    const previewTab = getByRole("tab", { name: /preview/i })
    fireEvent.keyDown(previewTab, { key: "ArrowRight" })
    expect(onTabChange).toHaveBeenCalledWith("source")
  })

  it("ArrowLeft wraps from preview to source", () => {
    const onTabChange = vi.fn()
    const { getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={onTabChange}
        onCopy={() => {}}
        copied={false}
      />,
    )
    const previewTab = getByRole("tab", { name: /preview/i })
    fireEvent.keyDown(previewTab, { key: "ArrowLeft" })
    expect(onTabChange).toHaveBeenCalledWith("source")
  })

  it("renders Retry button only in error state", () => {
    const onRetry = vi.fn()
    const { rerender, queryByRole, getByRole } = render(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={() => {}}
        copied={false}
      />,
    )
    expect(queryByRole("button", { name: /retry/i })).toBeNull()

    rerender(
      <LatexToolbar
        activeTab="preview"
        onTabChange={() => {}}
        onCopy={() => {}}
        copied={false}
        error="boom"
        onRetry={onRetry}
      />,
    )
    fireEvent.click(getByRole("button", { name: /retry/i }))
    expect(onRetry).toHaveBeenCalled()
  })
})
