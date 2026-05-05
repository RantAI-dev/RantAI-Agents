// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { LatexToolbar } from "./latex-toolbar"

describe("LatexToolbar", () => {
  it("renders Preview and Source tab triggers", () => {
    const { getByRole } = render(
      <LatexToolbar activeTab="preview" onTabChange={() => {}} />,
    )
    expect(getByRole("tab", { name: /preview/i })).not.toBeNull()
    expect(getByRole("tab", { name: /source/i })).not.toBeNull()
  })

  it("calls onTabChange when Source tab is clicked", () => {
    const onTabChange = vi.fn()
    const { getByRole } = render(
      <LatexToolbar activeTab="preview" onTabChange={onTabChange} />,
    )
    fireEvent.click(getByRole("tab", { name: /source/i }))
    expect(onTabChange).toHaveBeenCalledWith("source")
  })

  it("ArrowRight on the active tab moves to the next tab and triggers onTabChange", () => {
    const onTabChange = vi.fn()
    const { getByRole } = render(
      <LatexToolbar activeTab="preview" onTabChange={onTabChange} />,
    )
    const previewTab = getByRole("tab", { name: /preview/i })
    fireEvent.keyDown(previewTab, { key: "ArrowRight" })
    expect(onTabChange).toHaveBeenCalledWith("source")
  })

  it("ArrowLeft wraps from preview to source", () => {
    const onTabChange = vi.fn()
    const { getByRole } = render(
      <LatexToolbar activeTab="preview" onTabChange={onTabChange} />,
    )
    const previewTab = getByRole("tab", { name: /preview/i })
    fireEvent.keyDown(previewTab, { key: "ArrowLeft" })
    expect(onTabChange).toHaveBeenCalledWith("source")
  })

  it("does not render a Copy button (panel header owns the copy affordance)", () => {
    const { queryByRole } = render(
      <LatexToolbar activeTab="preview" onTabChange={() => {}} />,
    )
    expect(queryByRole("button", { name: /copy/i })).toBeNull()
  })
})
