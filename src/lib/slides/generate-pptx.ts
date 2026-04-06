import PptxGenJS from "pptxgenjs"
import type { PresentationData, SlideData, SlideTheme } from "./types"

/** Strip markdown syntax that LLMs sometimes inject into slide text */
function clean(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "")
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

function lightenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const lr = Math.min(255, Math.round(r + (255 - r) * amount))
  const lg = Math.min(255, Math.round(g + (255 - g) * amount))
  const lb = Math.min(255, Math.round(b + (255 - b) * amount))
  return `${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`
}

function darkenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const dr = Math.round(r * (1 - amount))
  const dg = Math.round(g * (1 - amount))
  const db = Math.round(b * (1 - amount))
  return `${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`
}

function strip(color: string): string {
  return color.replace("#", "")
}

function ff(theme: SlideTheme): string {
  return theme.fontFamily.split(",")[0].trim()
}

/** Add slide number to bottom-right */
function addSlideNumber(s: PptxGenJS.Slide, index: number, total: number, dark: boolean) {
  s.addText(`Page ${index + 1} / ${total}`, {
    x: 10.5,
    y: 6.9,
    w: 2.3,
    h: 0.4,
    fontSize: 9,
    fontFace: "Inter",
    color: dark ? lightenColor("#000000", 0.6) : "999999",
    align: "right",
  })
}

/** Accent line shape — thin horizontal bar */
function addAccentLine(s: PptxGenJS.Slide, theme: SlideTheme, x: number, y: number, w: number) {
  s.addShape("rect", {
    x,
    y,
    w,
    h: 0.04,
    fill: { color: strip(theme.secondaryColor) },
    line: { color: strip(theme.secondaryColor), width: 0 },
  })
}

/** Title accent bar — vertical bar next to content slide titles */
function addTitleAccentBar(s: PptxGenJS.Slide, theme: SlideTheme, y: number) {
  s.addShape("rect", {
    x: 0.7,
    y,
    w: 0.06,
    h: 0.45,
    fill: { color: strip(theme.secondaryColor) },
    line: { color: strip(theme.secondaryColor), width: 0 },
  })
}

function renderTitleSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: strip(theme.primaryColor) }

  if (slide.title) {
    s.addText(slide.title, {
      x: 1.5,
      y: 1.8,
      w: 10,
      h: 1.5,
      fontSize: 40,
      fontFace: ff(theme),
      color: "FFFFFF",
      bold: true,
      align: "center",
      valign: "bottom",
    })
  }

  // Accent line under title
  addAccentLine(s, theme, 5.4, 3.5, 2.2)

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 2,
      y: 3.8,
      w: 9,
      h: 0.8,
      fontSize: 18,
      fontFace: ff(theme),
      color: lightenColor(strip(theme.primaryColor), 0.5),
      align: "center",
      valign: "top",
      italic: false,
    })
  }

  if (slide.note) {
    s.addText(slide.note, {
      x: 2,
      y: 6.3,
      w: 9,
      h: 0.5,
      fontSize: 11,
      fontFace: ff(theme),
      color: lightenColor(strip(theme.primaryColor), 0.35),
      align: "center",
    })
  }

  addSlideNumber(s, index, total, true)
}

function renderContentSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  // Title accent bar + title
  if (slide.title) {
    addTitleAccentBar(s, theme, 0.5)
    s.addText(slide.title, {
      x: 1,
      y: 0.4,
      w: 11,
      h: 0.7,
      fontSize: 26,
      fontFace: ff(theme),
      color: strip(theme.primaryColor),
      bold: true,
    })
  }

  // Subtle line under title area
  s.addShape("rect", {
    x: 1,
    y: 1.25,
    w: 11.5,
    h: 0.01,
    fill: { color: "E2E8F0" },
    line: { color: "E2E8F0", width: 0 },
  })

  if (slide.bullets && slide.bullets.length > 0) {
    const textRows = slide.bullets.map((b) => ({
      text: b,
      options: {
        fontSize: 16,
        fontFace: ff(theme),
        color: "334155" as string,
        bullet: { type: "bullet" as const, color: strip(theme.secondaryColor) },
        paraSpaceAfter: 10,
        lineSpacingMultiple: 1.3,
      },
    }))
    s.addText(textRows, {
      x: 1.2,
      y: 1.5,
      w: 10.5,
      h: 4.5,
      valign: "top",
    })
  } else if (slide.content) {
    s.addText(slide.content, {
      x: 1.2,
      y: 1.5,
      w: 10.5,
      h: 4.5,
      fontSize: 16,
      fontFace: ff(theme),
      color: "475569",
      valign: "top",
      lineSpacingMultiple: 1.5,
    })
  }

  if (slide.note) {
    s.addText(slide.note, {
      x: 0.8,
      y: 6.5,
      w: 8,
      h: 0.4,
      fontSize: 9,
      fontFace: ff(theme),
      color: "94A3B8",
      italic: true,
    })
  }

  addSlideNumber(s, index, total, false)
}

function renderTwoColumnSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  if (slide.title) {
    addTitleAccentBar(s, theme, 0.5)
    s.addText(slide.title, {
      x: 1,
      y: 0.4,
      w: 11,
      h: 0.7,
      fontSize: 26,
      fontFace: ff(theme),
      color: strip(theme.primaryColor),
      bold: true,
    })
  }

  // Column divider line
  s.addShape("rect", {
    x: 6.35,
    y: 1.5,
    w: 0.01,
    h: 4.5,
    fill: { color: "E2E8F0" },
    line: { color: "E2E8F0", width: 0 },
  })

  const leftItems = slide.leftColumn || []
  const rightItems = slide.rightColumn || []

  if (leftItems.length > 0) {
    const textRows = leftItems.map((b) => ({
      text: b,
      options: {
        fontSize: 14,
        fontFace: ff(theme),
        color: "334155" as string,
        bullet: { type: "bullet" as const, color: strip(theme.secondaryColor) },
        paraSpaceAfter: 8,
        lineSpacingMultiple: 1.3,
      },
    }))
    s.addText(textRows, {
      x: 1,
      y: 1.5,
      w: 5,
      h: 4.5,
      valign: "top",
    })
  }

  if (rightItems.length > 0) {
    const textRows = rightItems.map((b) => ({
      text: b,
      options: {
        fontSize: 14,
        fontFace: ff(theme),
        color: "334155" as string,
        bullet: { type: "bullet" as const, color: strip(theme.secondaryColor) },
        paraSpaceAfter: 8,
        lineSpacingMultiple: 1.3,
      },
    }))
    s.addText(textRows, {
      x: 6.8,
      y: 1.5,
      w: 5,
      h: 4.5,
      valign: "top",
    })
  }

  addSlideNumber(s, index, total, false)
}

function renderSectionSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: strip(theme.primaryColor) }

  if (slide.title) {
    s.addText(slide.title, {
      x: 1.5,
      y: 2.2,
      w: 10,
      h: 1.2,
      fontSize: 34,
      fontFace: ff(theme),
      color: "FFFFFF",
      bold: true,
      align: "center",
      valign: "middle",
    })
  }

  addAccentLine(s, theme, 5.4, 3.6, 2.2)

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 2,
      y: 3.9,
      w: 9,
      h: 0.7,
      fontSize: 16,
      fontFace: ff(theme),
      color: lightenColor(strip(theme.primaryColor), 0.45),
      align: "center",
    })
  }

  addSlideNumber(s, index, total, true)
}

function renderQuoteSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  // Decorative large quote mark
  s.addText("\u201C", {
    x: 4.5,
    y: 0.8,
    w: 4,
    h: 2,
    fontSize: 120,
    fontFace: "Georgia",
    color: lightenColor(strip(theme.secondaryColor), 0.7),
    align: "center",
    valign: "top",
  })

  if (slide.quote) {
    s.addText(slide.quote, {
      x: 2,
      y: 2,
      w: 9,
      h: 2.5,
      fontSize: 22,
      fontFace: ff(theme),
      color: "334155",
      italic: true,
      align: "center",
      valign: "middle",
      lineSpacingMultiple: 1.5,
    })
  }

  if (slide.attribution) {
    s.addText(`\u2014 ${slide.attribution}`, {
      x: 3,
      y: 4.8,
      w: 7,
      h: 0.5,
      fontSize: 14,
      fontFace: ff(theme),
      color: strip(theme.secondaryColor),
      align: "center",
      bold: true,
    })
  }

  addSlideNumber(s, index, total, false)
}

function renderClosingSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: strip(theme.primaryColor) }

  s.addText(slide.title || "Thank You", {
    x: 1.5,
    y: 2,
    w: 10,
    h: 1.5,
    fontSize: 40,
    fontFace: ff(theme),
    color: "FFFFFF",
    bold: true,
    align: "center",
    valign: "middle",
  })

  addAccentLine(s, theme, 5.4, 3.7, 2.2)

  if (slide.subtitle || slide.content) {
    s.addText(slide.subtitle || slide.content || "", {
      x: 2,
      y: 4,
      w: 9,
      h: 0.8,
      fontSize: 16,
      fontFace: ff(theme),
      color: lightenColor(strip(theme.primaryColor), 0.45),
      align: "center",
    })
  }

  addSlideNumber(s, index, total, true)
}

/** Sanitize all text fields in a slide to remove markdown syntax */
function cleanSlide(slide: SlideData): SlideData {
  return {
    ...slide,
    title: slide.title ? clean(slide.title) : undefined,
    subtitle: slide.subtitle ? clean(slide.subtitle) : undefined,
    content: slide.content ? clean(slide.content) : undefined,
    note: slide.note ? clean(slide.note) : undefined,
    quote: slide.quote ? clean(slide.quote) : undefined,
    attribution: slide.attribution ? clean(slide.attribution) : undefined,
    bullets: slide.bullets?.map(clean),
    leftColumn: slide.leftColumn?.map(clean),
    rightColumn: slide.rightColumn?.map(clean),
  }
}

export async function generatePptx(data: PresentationData): Promise<Blob> {
  const pptx = new PptxGenJS()
  const theme = data.theme
  const total = data.slides.length

  pptx.layout = "LAYOUT_WIDE"
  pptx.author = "RantAI"
  pptx.subject = clean(data.slides[0]?.title || "Presentation")
  pptx.title = clean(data.slides[0]?.title || "Presentation")

  data.slides.forEach((raw, index) => {
    const slide = cleanSlide(raw)
    switch (slide.layout) {
      case "title":
        renderTitleSlide(pptx, slide, theme, index, total)
        break
      case "content":
      case "image-text":
        renderContentSlide(pptx, slide, theme, index, total)
        break
      case "two-column":
        renderTwoColumnSlide(pptx, slide, theme, index, total)
        break
      case "section":
        renderSectionSlide(pptx, slide, theme, index, total)
        break
      case "quote":
        renderQuoteSlide(pptx, slide, theme, index, total)
        break
      case "closing":
        renderClosingSlide(pptx, slide, theme, index, total)
        break
      default:
        renderContentSlide(pptx, slide, theme, index, total)
    }
  })

  return (await pptx.write({ outputType: "blob" })) as Blob
}
