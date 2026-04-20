import { z } from "zod"

/**
 * Report template — formal report with a cover page.
 *
 * Paged layout with a dedicated cover (title / subtitle / author / date /
 * version / confidentiality stamp). Body follows on subsequent pages.
 * The TOC placeholder is rendered in the reader view; actual TOC
 * generation happens at export time (PR 2).
 */
export const reportTemplate = {
  name: "report" as const,
  label: "Report",
  layoutMode: "paged" as const,
  schema: z.object({
    template: z.literal("report"),
    title: z.string().min(1, "title is required"),
    subtitle: z.string().optional(),
    author: z.string().min(1, "author is required"),
    organization: z.string().optional(),
    organization_logo: z.string().optional(),
    date: z.string().min(1, "date is required"),
    version: z.string().optional(),
    confidentiality: z.string().optional(),
  }),
  render: {
    marginMm: { top: 25, right: 25, bottom: 25, left: 25 },
    fontFamilySuggestion: "Inter, system-ui, sans-serif",
    hasCover: true,
    hasPageNumbers: true,
  },
  promptHints: {
    whenToUse:
      "Longer formal report with a cover page — quarterly reports, research writeups, technical audits, postmortems. Pick this when the content benefits from a title/author/date framing and multi-section body (cover + TOC placeholder + sections).",
    requiredFieldsDoc: "title, author, date",
  },
  chrome: "ReportCover" as const,
} as const
