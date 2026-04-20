import { z } from "zod"

/**
 * Memo template — internal email-style memo.
 *
 * Paged layout (lighter than report — no cover). Chrome renders a table
 * header with From/To/Date/Subject (plus optional cc/priority), then a
 * horizontal rule, then the markdown body.
 */
export const memoTemplate = {
  name: "memo" as const,
  label: "Memo",
  layoutMode: "paged" as const,
  schema: z.object({
    template: z.literal("memo"),
    from: z.string().min(1, "from is required"),
    to: z.string().min(1, "to is required"),
    date: z.string().min(1, "date is required"),
    subject: z.string().min(1, "subject is required"),
    cc: z.string().optional(),
    priority: z.string().optional(),
  }),
  render: {
    marginMm: { top: 20, right: 20, bottom: 20, left: 20 },
    fontFamilySuggestion: "Inter, system-ui, sans-serif",
    hasCover: false,
    hasPageNumbers: false,
  },
  promptHints: {
    whenToUse:
      "Internal memo addressed to one or more colleagues — announcements, status updates, internal decisions. Pick this when the document needs an email-style From/To/Date/Subject header but not a formal letter framing.",
    requiredFieldsDoc: "from, to, date, subject",
  },
  chrome: "MemoHeader" as const,
} as const
