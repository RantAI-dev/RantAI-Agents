import type { PresentationData, SlideData } from "./types"
import { DEFAULT_THEME } from "./types"

/**
 * Convert legacy markdown-format slides (separated by \n---\n) to PresentationData.
 * Used for backwards compatibility with old saved slides.
 */
export function parseLegacyMarkdown(markdown: string): PresentationData {
  const rawSlides = markdown
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const slides: SlideData[] = rawSlides.map((raw, i) => {
    const lines = raw.split("\n")
    let title: string | undefined
    const bullets: string[] = []
    const contentLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!title && /^#{1,2}\s+/.test(trimmed)) {
        title = trimmed.replace(/^#{1,2}\s+/, "")
      } else if (/^[-*]\s+/.test(trimmed)) {
        bullets.push(trimmed.replace(/^[-*]\s+/, ""))
      } else if (trimmed) {
        contentLines.push(trimmed)
      }
    }

    // First slide → title layout, last slide → closing, rest → content
    if (i === 0) {
      return {
        layout: "title" as const,
        title: title || contentLines[0] || "Untitled",
        subtitle: contentLines.length > 0 ? contentLines.join(" ") : undefined,
      }
    }

    if (i === rawSlides.length - 1 && !bullets.length) {
      return {
        layout: "closing" as const,
        title: title || contentLines[0] || "Thank You",
        subtitle: contentLines.length > 1 ? contentLines.slice(1).join(" ") : undefined,
      }
    }

    return {
      layout: bullets.length > 0 ? ("content" as const) : ("content" as const),
      title,
      bullets: bullets.length > 0 ? bullets : undefined,
      content: contentLines.length > 0 ? contentLines.join("\n") : undefined,
    }
  })

  return {
    theme: { ...DEFAULT_THEME },
    slides,
  }
}

/**
 * Check if content is JSON PresentationData or legacy markdown.
 */
export function isJsonPresentation(content: string): boolean {
  const trimmed = content.trimStart()
  return trimmed.startsWith("{") && trimmed.includes('"slides"')
}
