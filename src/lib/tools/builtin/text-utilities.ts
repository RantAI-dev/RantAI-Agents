import { z } from "zod"
import type { ToolDefinition } from "../types"

export const textUtilitiesTool: ToolDefinition = {
  name: "text_utilities",
  displayName: "Text Utilities",
  description:
    "Process text: get word/character statistics, extract emails or URLs, create URL slugs, truncate text, or match regex patterns.",
  category: "builtin",
  parameters: z.object({
    text: z.string().describe("The text to process"),
    operation: z
      .enum([
        "summarize_stats",
        "extract_emails",
        "extract_urls",
        "slug",
        "truncate",
        "regex_match",
      ])
      .describe(
        "Operation: 'summarize_stats' = word/char/sentence counts, 'extract_emails' = find email addresses, 'extract_urls' = find URLs, 'slug' = create URL slug, 'truncate' = truncate text, 'regex_match' = match regex pattern"
      ),
    pattern: z
      .string()
      .optional()
      .describe("Regex pattern for regex_match operation"),
    maxLength: z
      .number()
      .optional()
      .default(100)
      .describe("Maximum length for truncate operation"),
  }),
  execute: async (params) => {
    const text = params.text as string
    const operation = params.operation as string

    try {
      switch (operation) {
        case "summarize_stats": {
          const words = text.split(/\s+/).filter(Boolean)
          const sentences = text.split(/[.!?]+/).filter((s) => s.trim())
          const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())
          return {
            success: true,
            result: {
              characters: text.length,
              words: words.length,
              sentences: sentences.length,
              paragraphs: paragraphs.length,
              averageWordLength:
                words.length > 0
                  ? Math.round(
                      (words.reduce((sum, w) => sum + w.length, 0) /
                        words.length) *
                        10
                    ) / 10
                  : 0,
            },
          }
        }

        case "extract_emails": {
          const emailPattern =
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
          const emails = [...new Set(text.match(emailPattern) || [])]
          return { success: true, result: emails, count: emails.length }
        }

        case "extract_urls": {
          const urlPattern =
            /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
          const urls = [...new Set(text.match(urlPattern) || [])]
          return { success: true, result: urls, count: urls.length }
        }

        case "slug": {
          const slug = text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
          return { success: true, result: slug }
        }

        case "truncate": {
          const maxLen = (params.maxLength as number) || 100
          if (text.length <= maxLen) {
            return { success: true, result: text, truncated: false }
          }
          const truncated = text.slice(0, maxLen).replace(/\s+\S*$/, "") + "..."
          return { success: true, result: truncated, truncated: true }
        }

        case "regex_match": {
          if (!params.pattern) {
            return {
              success: false,
              error: "'pattern' is required for regex_match operation",
            }
          }
          const regex = new RegExp(params.pattern as string, "g")
          const matches = [...text.matchAll(regex)].map((m) => ({
            match: m[0],
            index: m.index,
            groups: m.groups || null,
          }))
          return {
            success: true,
            result: matches,
            count: matches.length,
          }
        }

        default:
          return { success: false, error: `Unknown operation: ${operation}` }
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Text operation failed",
      }
    }
  },
}
