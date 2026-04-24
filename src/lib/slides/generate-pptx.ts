import PptxGenJS from "pptxgenjs"
import type { PresentationData, SlideData, SlideTheme } from "./types"
import { chartToSvg } from "@/lib/rendering/chart-to-svg"
import { svgToBase64Png, fetchImageAsBase64, mermaidToBase64Png } from "./svg-to-png"
import {
  cleanMarkdown,
  lightenColor,
  stripHash,
  CHART_DIMENSIONS,
  MERMAID_DIMENSIONS,
} from "./utils"
import { stripIcons } from "./icons"

/** Strip markdown syntax - alias for cleanMarkdown */
const clean = cleanMarkdown

/**
 * Clean text for PPTX: strip markdown and icons.
 * Icons can't render inline in PowerPoint text boxes.
 */
function cleanPptx(text: string): string {
  const [stripped] = stripIcons(text)
  return clean(stripped)
}

/** Strip # from hex color - alias for stripHash */
const strip = stripHash

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

async function renderQuoteSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()

  // Card style gets a subtle background
  const isCard = slide.quoteStyle === "card"
  s.background = { fill: "FFFFFF" }

  if (isCard) {
    s.addShape("roundRect", {
      x: 1.5,
      y: 1,
      w: 10,
      h: 5,
      fill: { color: "F8FAFC" },
      line: { color: "E2E8F0", width: 1 },
      rectRadius: 0.2,
      shadow: { type: "outer", blur: 8, offset: 3, angle: 45, color: "000000", opacity: 0.08 },
    })
  }

  // Decorative large quote mark
  const quoteMarkSize = slide.quoteStyle === "minimal" ? 80 : 120
  s.addText("\u201C", {
    x: 4.5,
    y: isCard ? 1.2 : 0.8,
    w: 4,
    h: 2,
    fontSize: quoteMarkSize,
    fontFace: "Georgia",
    color: lightenColor(strip(theme.secondaryColor), 0.7),
    align: "center",
    valign: "top",
  })

  if (slide.quote) {
    const quoteFontSize = slide.quoteStyle === "minimal" ? 18 : 22
    s.addText(slide.quote, {
      x: 2,
      y: isCard ? 2.2 : 2,
      w: 9,
      h: 2.5,
      fontSize: quoteFontSize,
      fontFace: ff(theme),
      color: "334155",
      italic: true,
      align: "center",
      valign: "middle",
      lineSpacingMultiple: 1.5,
    })
  }

  // Attribution with optional avatar
  const attrY = isCard ? 5 : 4.8

  if (slide.quoteImage) {
    const imageData = await fetchImageAsBase64(slide.quoteImage)
    if (imageData) {
      // Avatar image (circular effect via small rounding)
      s.addImage({
        data: imageData,
        x: 5.2,
        y: attrY,
        w: 0.7,
        h: 0.7,
        rounding: true,
      })
    }
  }

  if (slide.attribution) {
    const attrX = slide.quoteImage ? 6 : 3
    const attrW = slide.quoteImage ? 5 : 7
    s.addText(`\u2014 ${slide.attribution}`, {
      x: attrX,
      y: attrY + 0.1,
      w: attrW,
      h: 0.5,
      fontSize: 14,
      fontFace: ff(theme),
      color: strip(theme.secondaryColor),
      align: slide.quoteImage ? "left" : "center",
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

// === Visual Layout Renderers ===

async function renderDiagramSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  let yOffset = 0.4

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
    yOffset = 1.3
  }

  if (slide.diagram) {
    const pngData = await mermaidToBase64Png(slide.diagram, MERMAID_DIMENSIONS.fullSlide.width, MERMAID_DIMENSIONS.fullSlide.height)
    if (pngData) {
      s.addImage({
        data: pngData,
        x: 1,
        y: yOffset,
        w: 11,
        h: 5.5,
        sizing: { type: "contain", w: 11, h: 5.5 },
      })
    } else {
      s.addText("Diagram could not be rendered", {
        x: 1,
        y: 3,
        w: 11,
        h: 1,
        fontSize: 14,
        fontFace: ff(theme),
        color: "94A3B8",
        align: "center",
      })
    }
  }

  addSlideNumber(s, index, total, false)
}

async function renderImageSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  if (slide.imageUrl) {
    const imageData = await fetchImageAsBase64(slide.imageUrl)
    if (imageData) {
      s.addImage({
        data: imageData,
        x: 1.5,
        y: 0.8,
        w: 10,
        h: 5.2,
        sizing: { type: "contain", w: 10, h: 5.2 },
        shadow: {
          type: "outer",
          blur: 8,
          offset: 4,
          angle: 45,
          color: "000000",
          opacity: 0.15,
        },
        rounding: true,
      })
    } else {
      s.addText("Image could not be loaded", {
        x: 1,
        y: 3,
        w: 11,
        h: 1,
        fontSize: 14,
        fontFace: ff(theme),
        color: "94A3B8",
        align: "center",
      })
    }
  }

  if (slide.imageCaption) {
    s.addText(slide.imageCaption, {
      x: 1,
      y: 6.2,
      w: 11,
      h: 0.5,
      fontSize: 12,
      fontFace: ff(theme),
      color: "64748B",
      align: "center",
      italic: true,
    })
  }

  addSlideNumber(s, index, total, false)
}

async function renderChartSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  let yOffset = 0.4

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
    yOffset = 1.3
  }

  if (slide.chart) {
    const svgString = chartToSvg(slide.chart, CHART_DIMENSIONS.pptx.fullSlide.width, CHART_DIMENSIONS.pptx.fullSlide.height)
    const pngData = await svgToBase64Png(svgString, 900, 500)
    s.addImage({
      data: pngData,
      x: 1.5,
      y: yOffset,
      w: 10,
      h: 5.2,
      sizing: { type: "contain", w: 10, h: 5.2 },
    })
  }

  addSlideNumber(s, index, total, false)
}

async function renderDiagramContentSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  // Title
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

  // Diagram on left
  if (slide.diagram) {
    const pngData = await mermaidToBase64Png(slide.diagram, MERMAID_DIMENSIONS.splitLayout.width, MERMAID_DIMENSIONS.splitLayout.height)
    if (pngData) {
      s.addImage({
        data: pngData,
        x: 0.5,
        y: 1.3,
        w: 6,
        h: 5,
        sizing: { type: "contain", w: 6, h: 5 },
      })
    }
  }

  // Content on right
  if (slide.bullets && slide.bullets.length > 0) {
    const textRows = slide.bullets.map((b) => ({
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
      w: 5.5,
      h: 4.5,
      valign: "top",
    })
  } else if (slide.content) {
    s.addText(slide.content, {
      x: 6.8,
      y: 1.5,
      w: 5.5,
      h: 4.5,
      fontSize: 14,
      fontFace: ff(theme),
      color: "475569",
      valign: "top",
      lineSpacingMultiple: 1.5,
    })
  }

  addSlideNumber(s, index, total, false)
}

async function renderImageContentSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  // Title
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

  // Image on left
  if (slide.imageUrl) {
    const imageData = await fetchImageAsBase64(slide.imageUrl)
    if (imageData) {
      s.addImage({
        data: imageData,
        x: 0.5,
        y: 1.3,
        w: 6,
        h: 5,
        sizing: { type: "contain", w: 6, h: 5 },
        shadow: {
          type: "outer",
          blur: 6,
          offset: 3,
          angle: 45,
          color: "000000",
          opacity: 0.12,
        },
        rounding: true,
      })
    }
  }

  // Content on right
  if (slide.bullets && slide.bullets.length > 0) {
    const textRows = slide.bullets.map((b) => ({
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
      w: 5.5,
      h: 4.5,
      valign: "top",
    })
  } else if (slide.content) {
    s.addText(slide.content, {
      x: 6.8,
      y: 1.5,
      w: 5.5,
      h: 4.5,
      fontSize: 14,
      fontFace: ff(theme),
      color: "475569",
      valign: "top",
      lineSpacingMultiple: 1.5,
    })
  }

  addSlideNumber(s, index, total, false)
}

async function renderChartContentSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  // Title
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

  // Chart on left
  if (slide.chart) {
    const svgString = chartToSvg(slide.chart, CHART_DIMENSIONS.pptx.splitLayout.width, CHART_DIMENSIONS.pptx.splitLayout.height)
    const pngData = await svgToBase64Png(svgString, 600, 450)
    s.addImage({
      data: pngData,
      x: 0.5,
      y: 1.3,
      w: 6,
      h: 5,
      sizing: { type: "contain", w: 6, h: 5 },
    })
  }

  // Content on right
  if (slide.bullets && slide.bullets.length > 0) {
    const textRows = slide.bullets.map((b) => ({
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
      w: 5.5,
      h: 4.5,
      valign: "top",
    })
  } else if (slide.content) {
    s.addText(slide.content, {
      x: 6.8,
      y: 1.5,
      w: 5.5,
      h: 4.5,
      fontSize: 14,
      fontFace: ff(theme),
      color: "475569",
      valign: "top",
      lineSpacingMultiple: 1.5,
    })
  }

  addSlideNumber(s, index, total, false)
}

async function renderHeroSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()

  // Set background image if available
  if (slide.backgroundImage) {
    const imageData = await fetchImageAsBase64(slide.backgroundImage)
    if (imageData) {
      s.background = { data: imageData }
    } else {
      s.background = { fill: strip(theme.primaryColor) }
    }
  } else {
    s.background = { fill: strip(theme.primaryColor) }
  }

  // Add overlay shape (semi-transparent rectangle)
  const overlay = slide.overlay || "dark"
  if (overlay !== "none") {
    const overlayColor = overlay === "light" ? "FFFFFF" : "000000"
    const overlayOpacity = 0.5
    s.addShape("rect", {
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
      fill: { color: overlayColor, transparency: (1 - overlayOpacity) * 100 },
      line: { color: overlayColor, width: 0 },
    })
  }

  // Title text
  const textColor = slide.overlay === "light" ? "1E293B" : "FFFFFF"
  if (slide.title) {
    s.addText(slide.title, {
      x: 1,
      y: 2.2,
      w: 11,
      h: 1.5,
      fontSize: 48,
      fontFace: ff(theme),
      color: textColor,
      bold: true,
      align: "center",
      valign: "middle",
      shadow: overlay !== "none" ? { type: "outer", blur: 4, offset: 2, angle: 45, color: "000000", opacity: 0.3 } : undefined,
    })
  }

  // Subtitle
  if (slide.subtitle) {
    const subtitleColor = slide.overlay === "light" ? "475569" : lightenColor("000000", 0.9)
    s.addText(slide.subtitle, {
      x: 2,
      y: 4,
      w: 9,
      h: 0.8,
      fontSize: 20,
      fontFace: ff(theme),
      color: subtitleColor,
      align: "center",
      shadow: overlay !== "none" ? { type: "outer", blur: 2, offset: 1, angle: 45, color: "000000", opacity: 0.2 } : undefined,
    })
  }

  addSlideNumber(s, index, total, overlay !== "light")
}

function renderStatsSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  let yOffset = 0.4

  // Title with accent bar
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
    yOffset = 1.5
  }

  // Stats grid
  if (slide.stats && slide.stats.length > 0) {
    const statCount = slide.stats.length
    const statWidth = 11 / statCount
    const startX = 1

    for (let i = 0; i < slide.stats.length; i++) {
      const stat = slide.stats[i]
      const x = startX + i * statWidth

      // Background card shape
      s.addShape("roundRect", {
        x: x + 0.15,
        y: yOffset,
        w: statWidth - 0.3,
        h: 4,
        fill: { color: "F8FAFC" },
        line: { color: "E2E8F0", width: 1 },
        rectRadius: 0.15,
      })

      // Value (big number)
      s.addText(stat.value, {
        x,
        y: yOffset + 0.5,
        w: statWidth,
        h: 1.5,
        fontSize: 44,
        fontFace: ff(theme),
        color: strip(theme.secondaryColor),
        bold: true,
        align: "center",
        valign: "middle",
      })

      // Label
      s.addText(stat.label, {
        x,
        y: yOffset + 2.2,
        w: statWidth,
        h: 0.6,
        fontSize: 14,
        fontFace: ff(theme),
        color: "64748B",
        align: "center",
        valign: "top",
      })

      // Change indicator
      if (stat.change) {
        const trendIcon = stat.trend === "up" ? "↑ " : stat.trend === "down" ? "↓ " : ""
        const trendColor = stat.trend === "up" ? "22C55E" : stat.trend === "down" ? "EF4444" : "64748B"
        s.addText(trendIcon + stat.change, {
          x,
          y: yOffset + 2.9,
          w: statWidth,
          h: 0.5,
          fontSize: 12,
          fontFace: ff(theme),
          color: trendColor,
          align: "center",
          bold: true,
        })
      }
    }
  }

  addSlideNumber(s, index, total, false)
}

async function renderGallerySlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  let yOffset = 0.4

  // Title with accent bar
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
    yOffset = 1.4
  }

  // Gallery grid
  if (slide.gallery && slide.gallery.length > 0) {
    const items = slide.gallery
    const cols = slide.galleryColumns || (items.length <= 4 ? 2 : items.length <= 6 ? 3 : 4)
    const rows = Math.ceil(items.length / cols)

    const gridWidth = 11
    const gridHeight = 5
    const cellWidth = gridWidth / cols
    const cellHeight = gridHeight / rows
    const imgSize = Math.min(cellWidth - 0.4, cellHeight - 0.6)

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = 1 + col * cellWidth + (cellWidth - imgSize) / 2
      const y = yOffset + row * cellHeight

      const imageData = await fetchImageAsBase64(item.imageUrl)
      if (imageData) {
        s.addImage({
          data: imageData,
          x,
          y,
          w: imgSize,
          h: imgSize * 0.7,
          sizing: { type: "contain", w: imgSize, h: imgSize * 0.7 },
        })
      }

      if (item.caption) {
        s.addText(item.caption, {
          x: 1 + col * cellWidth,
          y: y + imgSize * 0.7 + 0.1,
          w: cellWidth,
          h: 0.4,
          fontSize: 10,
          fontFace: ff(theme),
          color: "64748B",
          align: "center",
        })
      }
    }
  }

  addSlideNumber(s, index, total, false)
}

function renderComparisonSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  let yOffset = 0.4

  // Title with accent bar
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
    yOffset = 1.4
  }

  // Comparison table
  if (slide.comparisonHeaders && slide.comparisonRows) {
    const headers = slide.comparisonHeaders
    const rows = slide.comparisonRows

    // Build table data
    const tableRows: Array<Array<{ text: string; options?: object }>> = []

    // Header row
    tableRows.push(
      headers.map((h, i) => ({
        text: h,
        options: {
          fill: { color: strip(theme.primaryColor) },
          color: "FFFFFF",
          bold: true,
          align: i === 0 ? "left" : "center",
        },
      }))
    )

    // Data rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowData: Array<{ text: string; options?: object }> = []
      const isOdd = i % 2 === 0
      const bgColor = isOdd ? "F8FAFC" : "FFFFFF"

      // Feature cell
      rowData.push({
        text: row.feature,
        options: { fill: { color: bgColor }, bold: true, align: "left" },
      })

      // Value cells
      for (const val of row.values) {
        if (val === true) {
          rowData.push({
            text: "✓",
            options: { fill: { color: bgColor }, color: "22C55E", bold: true, align: "center" },
          })
        } else if (val === false) {
          rowData.push({
            text: "✗",
            options: { fill: { color: bgColor }, color: "EF4444", bold: true, align: "center" },
          })
        } else {
          rowData.push({
            text: String(val),
            options: { fill: { color: bgColor }, align: "center" },
          })
        }
      }

      tableRows.push(rowData)
    }

    // Add table
    s.addTable(tableRows, {
      x: 0.8,
      y: yOffset,
      w: 11.4,
      fontFace: ff(theme),
      fontSize: 12,
      border: { pt: 0.5, color: "E2E8F0" },
      colW: Array(headers.length).fill(11.4 / headers.length),
    })
  }

  addSlideNumber(s, index, total, false)
}

function renderFeaturesSlide(
  pptx: PptxGenJS,
  slide: SlideData,
  theme: SlideTheme,
  index: number,
  total: number
) {
  const s = pptx.addSlide()
  s.background = { fill: "FFFFFF" }

  let yOffset = 0.4

  // Title with accent bar
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
    yOffset = 1.4
  }

  // Features grid
  if (slide.features && slide.features.length > 0) {
    const features = slide.features
    const cols = slide.featuresColumns || (features.length <= 3 ? features.length : 3)
    const rows = Math.ceil(features.length / cols)

    const gridWidth = 11.4
    const gridHeight = 5.0
    const itemWidth = gridWidth / cols - 0.3
    const itemHeight = gridHeight / rows - 0.3
    const startX = 0.8
    const startY = yOffset + 0.2

    features.forEach((feature, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = startX + col * (itemWidth + 0.3)
      const y = startY + row * (itemHeight + 0.3)

      // Feature card background
      s.addShape("roundRect", {
        x,
        y,
        w: itemWidth,
        h: itemHeight,
        fill: { color: "F8FAFC" },
        line: { color: "E2E8F0", width: 0.5 },
        rectRadius: 0.1,
      })

      // Icon circle
      const circleSize = 0.6
      const circleX = x + itemWidth / 2 - circleSize / 2
      const circleY = y + 0.3
      s.addShape("ellipse", {
        x: circleX,
        y: circleY,
        w: circleSize,
        h: circleSize,
        fill: { color: strip(theme.secondaryColor) },
      })

      // Icon text (using emoji as fallback - PPTX can't embed SVG easily)
      const iconEmoji = getIconEmoji(feature.icon)
      s.addText(iconEmoji, {
        x: circleX,
        y: circleY,
        w: circleSize,
        h: circleSize,
        fontSize: 18,
        align: "center",
        valign: "middle",
        color: "FFFFFF",
      })

      // Feature title
      s.addText(feature.title, {
        x,
        y: circleY + circleSize + 0.2,
        w: itemWidth,
        h: 0.4,
        fontSize: 14,
        fontFace: ff(theme),
        color: strip(theme.primaryColor),
        bold: true,
        align: "center",
      })

      // Feature description
      if (feature.description) {
        s.addText(feature.description, {
          x: x + 0.1,
          y: circleY + circleSize + 0.6,
          w: itemWidth - 0.2,
          h: itemHeight - circleSize - 1.1,
          fontSize: 10,
          fontFace: ff(theme),
          color: "64748B",
          align: "center",
          valign: "top",
        })
      }
    })
  }

  addSlideNumber(s, index, total, false)
}

/** Map icon names to emoji fallbacks for PPTX */
function getIconEmoji(iconName: string): string {
  const emojiMap: Record<string, string> = {
    rocket: "🚀",
    star: "⭐",
    heart: "❤️",
    check: "✓",
    "check-circle": "✓",
    x: "✗",
    zap: "⚡",
    shield: "🛡",
    "shield-check": "🛡",
    lock: "🔒",
    unlock: "🔓",
    target: "🎯",
    trophy: "🏆",
    award: "🏅",
    gift: "🎁",
    users: "👥",
    user: "👤",
    globe: "🌐",
    cloud: "☁️",
    database: "💾",
    server: "🖥",
    code: "💻",
    settings: "⚙️",
    mail: "📧",
    phone: "📞",
    calendar: "📅",
    clock: "⏰",
    "trending-up": "📈",
    "trending-down": "📉",
    "bar-chart": "📊",
    "pie-chart": "📊",
    "dollar-sign": "💲",
    "credit-card": "💳",
    wallet: "👛",
    briefcase: "💼",
    building: "🏢",
    store: "🏪",
    truck: "🚚",
    "shopping-bag": "🛍",
    "shopping-cart": "🛒",
    package: "📦",
    leaf: "🍃",
    sun: "☀️",
    moon: "🌙",
    lightbulb: "💡",
    sparkles: "✨",
    flag: "🚩",
    "map-pin": "📍",
    search: "🔍",
    eye: "👁",
    play: "▶️",
    pause: "⏸",
    download: "⬇️",
    upload: "⬆️",
    link: "🔗",
    file: "📄",
    folder: "📁",
    image: "🖼",
    video: "🎬",
    mic: "🎤",
    headphones: "🎧",
    wifi: "📶",
    battery: "🔋",
    smartphone: "📱",
    laptop: "💻",
    coffee: "☕",
    utensils: "🍴",
    wrench: "🔧",
    tool: "🔧",
  }
  return emojiMap[iconName] || "●"
}

/** Sanitize all text fields in a slide to remove markdown syntax and icons */
function cleanSlide(slide: SlideData): SlideData {
  return {
    ...slide,
    title: slide.title ? cleanPptx(slide.title) : undefined,
    subtitle: slide.subtitle ? cleanPptx(slide.subtitle) : undefined,
    content: slide.content ? cleanPptx(slide.content) : undefined,
    note: slide.note ? cleanPptx(slide.note) : undefined,
    quote: slide.quote ? cleanPptx(slide.quote) : undefined,
    attribution: slide.attribution ? cleanPptx(slide.attribution) : undefined,
    bullets: slide.bullets?.map(cleanPptx),
    leftColumn: slide.leftColumn?.map(cleanPptx),
    rightColumn: slide.rightColumn?.map(cleanPptx),
    // Visual fields - don't clean diagram code or URLs
    imageCaption: slide.imageCaption ? cleanPptx(slide.imageCaption) : undefined,
    // Stats fields
    stats: slide.stats?.map((s) => ({
      ...s,
      value: cleanPptx(s.value),
      label: cleanPptx(s.label),
      change: s.change ? cleanPptx(s.change) : undefined,
    })),
    // Gallery fields
    gallery: slide.gallery?.map((g) => ({
      ...g,
      caption: g.caption ? cleanPptx(g.caption) : undefined,
    })),
    // Comparison fields
    comparisonHeaders: slide.comparisonHeaders?.map(cleanPptx),
    comparisonRows: slide.comparisonRows?.map((r) => ({
      ...r,
      feature: cleanPptx(r.feature),
      values: r.values.map((v) => (typeof v === "string" ? cleanPptx(v) : v)),
    })),
    // Features fields
    features: slide.features?.map((f) => ({
      ...f,
      title: cleanPptx(f.title),
      description: f.description ? cleanPptx(f.description) : undefined,
    })),
  }
}

export async function generatePptx(data: PresentationData): Promise<Blob> {
  const pptx = new PptxGenJS()
  const theme = data.theme
  const total = data.slides.length

  pptx.layout = "LAYOUT_WIDE"
  pptx.author = "RantAI"
  pptx.subject = cleanPptx(data.slides[0]?.title || "Presentation")
  pptx.title = cleanPptx(data.slides[0]?.title || "Presentation")

  // Use for...of to support async visual renderers
  for (let index = 0; index < data.slides.length; index++) {
    const slide = cleanSlide(data.slides[index])
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
        await renderQuoteSlide(pptx, slide, theme, index, total)
        break
      case "closing":
        renderClosingSlide(pptx, slide, theme, index, total)
        break
      // Visual layouts (async)
      case "diagram":
        await renderDiagramSlide(pptx, slide, theme, index, total)
        break
      case "image":
        await renderImageSlide(pptx, slide, theme, index, total)
        break
      case "chart":
        await renderChartSlide(pptx, slide, theme, index, total)
        break
      case "diagram-content":
        await renderDiagramContentSlide(pptx, slide, theme, index, total)
        break
      case "image-content":
        await renderImageContentSlide(pptx, slide, theme, index, total)
        break
      case "chart-content":
        await renderChartContentSlide(pptx, slide, theme, index, total)
        break
      case "hero":
        await renderHeroSlide(pptx, slide, theme, index, total)
        break
      case "stats":
        renderStatsSlide(pptx, slide, theme, index, total)
        break
      case "gallery":
        await renderGallerySlide(pptx, slide, theme, index, total)
        break
      case "comparison":
        renderComparisonSlide(pptx, slide, theme, index, total)
        break
      case "features":
        renderFeaturesSlide(pptx, slide, theme, index, total)
        break
      default:
        renderContentSlide(pptx, slide, theme, index, total)
    }
  }

  return (await pptx.write({ outputType: "blob" })) as Blob
}
