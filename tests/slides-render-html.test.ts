import { describe, expect, it } from "vitest"
import { slidesToHtml } from "@/lib/slides/render-html"
import { DEFAULT_THEME } from "@/lib/slides/types"
import type { PresentationData } from "@/lib/slides/types"

/**
 * Chart layouts colour their SVG from the deck theme. That colour used to be
 * read from a variable that only existed in `slidesToHtml`'s scope, so any deck
 * containing a chart threw "ReferenceError: theme is not defined" — and since
 * the artifact panel renders this on the client, the whole panel died behind an
 * error boundary ("Something went wrong").
 */
function deck(layout: "chart-content" | "chart"): PresentationData {
  return {
    theme: DEFAULT_THEME,
    slides: [
      {
        layout,
        title: "Quarterly revenue",
        chart: {
          type: "bar",
          data: [
            { label: "Q1", value: 120 },
            { label: "Q2", value: 180 },
          ],
        },
      } as PresentationData["slides"][number],
    ],
  }
}

describe("slidesToHtml", () => {
  it("renders a chart slide without throwing", () => {
    expect(() => slidesToHtml(deck("chart-content"))).not.toThrow()
  })

  it("emits the chart SVG for both chart-bearing layouts", () => {
    for (const layout of ["chart-content", "chart"] as const) {
      const html = slidesToHtml(deck(layout))
      expect(html).toContain("chart-container")
      expect(html).toContain("<svg")
    }
  })
})
