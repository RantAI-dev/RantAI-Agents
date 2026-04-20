import { z } from "zod"

/**
 * Letter template — formal external correspondence.
 *
 * Paged layout. Chrome renders a company block (logo + name + address)
 * at top-right, reference/date block at top-left, "Kepada Yth." recipient
 * block, subject line, then the markdown body, and a signatory block at
 * the end (handled by the renderer since the body is markdown — the
 * template only supplies the fields).
 */
export const letterTemplate = {
  name: "letter" as const,
  label: "Formal Letter",
  layoutMode: "paged" as const,
  schema: z.object({
    template: z.literal("letter"),
    company_name: z.string().min(1, "company_name is required"),
    company_logo: z.string().optional(),
    company_address: z.string().min(1, "company_address is required"),
    recipient_name: z.string().min(1, "recipient_name is required"),
    recipient_organization: z.string().optional(),
    recipient_address: z.string().optional(),
    date: z.string().min(1, "date is required"),
    subject: z.string().min(1, "subject is required"),
    reference_number: z.string().optional(),
    signatory_name: z.string().min(1, "signatory_name is required"),
    signatory_position: z.string().min(1, "signatory_position is required"),
  }),
  render: {
    marginMm: { top: 25, right: 20, bottom: 25, left: 25 },
    fontFamilySuggestion: "Inter, system-ui, sans-serif",
    hasCover: false,
    hasPageNumbers: false,
  },
  promptHints: {
    whenToUse:
      "Formal external correspondence addressed to a specific recipient and organization. One-to-one letters (not broad announcements). Pick this when the document needs a letterhead + recipient block + subject + signatory.",
    requiredFieldsDoc:
      "company_name, company_address, recipient_name, date, subject, signatory_name, signatory_position",
  },
  chrome: "LetterHeader" as const,
} as const
