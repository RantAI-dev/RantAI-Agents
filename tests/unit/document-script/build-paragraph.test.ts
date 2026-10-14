// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  buildParagraph,
  DEFAULT_PARAGRAPH_SPACING,
} from "@/lib/document-script/build-paragraph"

describe("buildParagraph (TC-1516)", () => {
  it("trims leading whitespace consistently from string input", () => {
    const p = buildParagraph(" BAB 1: PENDAHULUAN")
    const json = JSON.parse(JSON.stringify(p))

    // Find the TextRun containing the text
    const textNode = json.root.find((node: Record<string, unknown>) => node.rootKey === "w:r")
    const tChild = textNode?.root?.find((node: Record<string, unknown>) => node.rootKey === "w:t")
    const textContent = tChild?.root?.[1]

    expect(textContent).toBe("BAB 1: PENDAHULUAN")
  })

  it("trims multiple leading spaces and tabs from string input", () => {
    const p = buildParagraph("   \t  Paragraf pertama setiap bab tanpa indent spasi")
    const json = JSON.parse(JSON.stringify(p))

    const textNode = json.root.find((node: Record<string, unknown>) => node.rootKey === "w:r")
    const tChild = textNode?.root?.find((node: Record<string, unknown>) => node.rootKey === "w:t")
    const textContent = tChild?.root?.[1]

    expect(textContent).toBe("Paragraf pertama setiap bab tanpa indent spasi")
  })

  it("trims leading whitespace from options.text input", () => {
    const p = buildParagraph({
      text: "  Paragraf berikutnya dalam dokumen",
    })
    const json = JSON.parse(JSON.stringify(p))

    const textNode = json.root.find((node: Record<string, unknown>) => node.rootKey === "w:r")
    const tChild = textNode?.root?.find((node: Record<string, unknown>) => node.rootKey === "w:t")
    const textContent = tChild?.root?.[1]

    expect(textContent).toBe("Paragraf berikutnya dalam dokumen")
  })

  it("sets paragraph spacing property to default (~7pt after, 1.15 line spacing)", () => {
    const p = buildParagraph("Isi paragraf normal")
    const json = JSON.parse(JSON.stringify(p))

    const pPr = json.root.find((node: Record<string, unknown>) => node.rootKey === "w:pPr")
    const spacingNode = pPr?.root?.find((node: Record<string, unknown>) => node.rootKey === "w:spacing")
    const spacingAttr = spacingNode?.root?.[0]?.root

    expect(spacingAttr).toEqual({
      after: DEFAULT_PARAGRAPH_SPACING.after,
      line: DEFAULT_PARAGRAPH_SPACING.line,
    })
    expect(DEFAULT_PARAGRAPH_SPACING.after).toBe(140) // ~7pt
    expect(DEFAULT_PARAGRAPH_SPACING.line).toBe(276)
  })

  it("allows custom spacing override", () => {
    const p = buildParagraph({
      text: "Paragraf dengan spacing kustom",
      spacing: { after: 160, line: 240 },
    })
    const json = JSON.parse(JSON.stringify(p))

    const pPr = json.root.find((node: Record<string, unknown>) => node.rootKey === "w:pPr")
    const spacingNode = pPr?.root?.find((node: Record<string, unknown>) => node.rootKey === "w:spacing")
    const spacingAttr = spacingNode?.root?.[0]?.root

    expect(spacingAttr).toEqual({
      after: 160,
      line: 240,
    })
  })

  it("handles empty or undefined input gracefully", () => {
    const p = buildParagraph()
    const json = JSON.parse(JSON.stringify(p))

    const pPr = json.root.find((node: Record<string, unknown>) => node.rootKey === "w:pPr")
    const spacingNode = pPr?.root?.find((node: Record<string, unknown>) => node.rootKey === "w:spacing")
    const spacingAttr = spacingNode?.root?.[0]?.root

    expect(spacingAttr).toEqual({
      after: 140,
      line: 276,
    })
  })
})
