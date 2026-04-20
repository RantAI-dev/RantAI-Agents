import { z } from "zod"

/**
 * Plain template — default for documents without a frontmatter block.
 *
 * Flowing layout, zero chrome. Use case: READMEs, technical notes, rich
 * text content where the user wants a simple scrollable reader without
 * any paged-document framing.
 *
 * Schema is permissive (`passthrough`) so the template accepts any
 * unknown frontmatter keys without rejecting — users who type a `---`
 * block but choose `template: plain` still get the same flowing reader.
 */
export const plainTemplate = {
  name: "plain" as const,
  label: "Plain Document",
  layoutMode: "flowing" as const,
  schema: z
    .object({
      template: z.literal("plain").optional(),
    })
    .passthrough(),
  render: {
    // Flowing layout ignores marginMm — set to 0 so the shape stays
    // uniform across all templates for the renderer.
    marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
    fontFamilySuggestion: "Inter, system-ui, sans-serif",
    hasCover: false,
    hasPageNumbers: false,
  },
  promptHints: {
    whenToUse:
      "Default for free-form markdown content — READMEs, technical notes, documentation, articles. Pick this when the content does not need a formal letterhead, cover page, or email-style memo header.",
    requiredFieldsDoc: "No required fields (no frontmatter block needed).",
  },
  chrome: undefined,
} as const
