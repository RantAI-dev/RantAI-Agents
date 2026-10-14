import { Paragraph, TextRun, type IParagraphOptions } from "docx"

export interface BuildParagraphOptions extends IParagraphOptions {
  text?: string
}

/**
 * Default paragraph spacing:
 * - `after: 140` (140 DXA = 7 pt, matching 6-8pt standard spacing after)
 * - `line: 276` (1.15 line spacing)
 */
export const DEFAULT_PARAGRAPH_SPACING = {
  after: 140,
  line: 276,
}

/**
 * Builds a docx Paragraph with consistent leading-whitespace trimming and
 * default paragraph spacing (~7pt after, 1.15 line spacing).
 *
 * TC-1516:
 * - Trims leading whitespace of paragraph text consistently so that paragraphs
 *   (including the first paragraph of every chapter/BAB) are not accidentally
 *   indented with a leading space.
 * - Sets paragraph spacing (spacing after ~ 6-8pt / line spacing) by default.
 */
export function buildParagraph(
  input?: string | BuildParagraphOptions,
): Paragraph {
  if (input === undefined || input === null) {
    return new Paragraph({
      spacing: DEFAULT_PARAGRAPH_SPACING,
      children: [],
    })
  }

  if (typeof input === "string") {
    const trimmed = input.replace(/^\s+/, "")
    return new Paragraph({
      spacing: DEFAULT_PARAGRAPH_SPACING,
      children: [new TextRun(trimmed)],
    })
  }

  const { text, children, spacing, ...rest } = input

  let runs = children
  if (text !== undefined) {
    const trimmed = text.replace(/^\s+/, "")
    runs = [new TextRun(trimmed), ...(children ?? [])]
  }

  return new Paragraph({
    spacing: spacing ?? DEFAULT_PARAGRAPH_SPACING,
    children: runs,
    ...rest,
  })
}
