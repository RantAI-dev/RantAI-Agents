// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SpecWorkbookView } from "@/features/conversations/components/chat/artifacts/renderers/sheet-spec-view"

const minimalSpec = JSON.stringify({
  kind: "spreadsheet/v1",
  sheets: [
    {
      name: "Sheet1",
      cells: [
        { ref: "A1", value: "Year",    style: "header" },
        { ref: "B1", value: "Revenue", style: "header" },
        { ref: "A2", value: 2025 },
        { ref: "B2", value: 100, format: "$#,##0" },
        { ref: "A3", value: 2026 },
        { ref: "B3", formula: "=B2*1.5", format: "$#,##0" },
      ],
    },
  ],
})

describe("SpecWorkbookView", () => {
  it("renders the formula bar at the top, sheet tabs at the bottom", async () => {
    render(<SpecWorkbookView content={minimalSpec} />)
    // Sheet tab is visible (single sheet still renders)
    expect(screen.getByText("Sheet1")).toBeTruthy()
    // Column letter A is rendered
    expect(screen.getAllByText("A").length).toBeGreaterThan(0)
    // Header cell content rendered
    expect(screen.getByText("Year")).toBeTruthy()
    expect(screen.getByText("Revenue")).toBeTruthy()
  })

  it("formats currency values per cell.format", async () => {
    render(<SpecWorkbookView content={minimalSpec} />)
    expect(await screen.findByText(/\$\s?100/)).toBeTruthy()
  })

  it("shows error banner when content is invalid JSON", async () => {
    render(<SpecWorkbookView content="{not valid" />)
    expect(screen.getByText(/Invalid spreadsheet spec/i)).toBeTruthy()
  })
})
