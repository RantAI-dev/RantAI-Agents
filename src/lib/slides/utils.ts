/**
 * Shared utilities for slides HTML and PPTX rendering
 */

// ============================================
// Text Cleaning
// ============================================

/**
 * Remove markdown syntax from text (bold, italic, headings, lists, code)
 */
export function cleanMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")         // ### headings
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1") // ***bold italic***
    .replace(/\*\*(.*?)\*\*/g, "$1")     // **bold**
    .replace(/\*(.*?)\*/g, "$1")         // *italic*
    .replace(/__(.*?)__/g, "$1")         // __underline__
    .replace(/~~(.*?)~~/g, "$1")         // ~~strikethrough~~
    .replace(/`([^`]+)`/g, "$1")         // `inline code`
    .replace(/^>\s+/gm, "")              // > blockquote
    .replace(/^[-*+]\s+/gm, "")          // - list items
    .replace(/^\d+\.\s+/gm, "")          // 1. numbered list
}

// ============================================
// Color Utilities
// ============================================

/**
 * Parse hex color to RGB components
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "")
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  }
}

/**
 * Convert RGB to hex string (with # prefix)
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`
}

/**
 * Darken a hex color by a given amount (0-1)
 * Returns hex with # prefix
 */
export function darkenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(
    r * (1 - amount),
    g * (1 - amount),
    b * (1 - amount)
  )
}

/**
 * Lighten a hex color by a given amount (0-1)
 * Returns hex WITHOUT # prefix (for pptxgenjs compatibility)
 */
export function lightenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const lr = Math.min(255, Math.round(r + (255 - r) * amount))
  const lg = Math.min(255, Math.round(g + (255 - g) * amount))
  const lb = Math.min(255, Math.round(b + (255 - b) * amount))
  return `${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`
}

/**
 * Strip # from hex color (for pptxgenjs)
 */
export function stripHash(hex: string): string {
  return hex.replace("#", "")
}

// ============================================
// Chart Dimensions
// ============================================

export const CHART_DIMENSIONS = {
  // HTML preview
  html: {
    fullSlide: { width: 700, height: 400 },
    splitLayout: { width: 450, height: 350 },
  },
  // PPTX export
  pptx: {
    fullSlide: { width: 900, height: 500 },
    splitLayout: { width: 600, height: 450 },
  },
} as const

// ============================================
// Mermaid Dimensions
// ============================================

export const MERMAID_DIMENSIONS = {
  fullSlide: { width: 1200, height: 700 },
  splitLayout: { width: 700, height: 500 },
} as const
