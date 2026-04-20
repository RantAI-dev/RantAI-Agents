/**
 * Document template registry.
 *
 * Each template defines:
 * - `name`, `label` — display identity
 * - `layoutMode` — flowing (scroll-continuous) vs paged (A4 pages)
 * - `schema` — Zod validator for the frontmatter metadata shape
 * - `render` — renderer metadata (margins, cover flag, page numbers)
 * - `promptHints` — LLM guidance ("when to use", required fields doc)
 * - `chrome` — name of the per-template header component, or undefined
 *
 * Add a new template by creating a sub-file here, importing it below,
 * and adding it to `ALL_DOCUMENT_TEMPLATES`. The derived type union
 * (`DocumentTemplateName`) and `getDocumentTemplate` fallback stay
 * correct automatically.
 */

import { plainTemplate } from "./plain"
import { letterTemplate } from "./letter"
import { reportTemplate } from "./report"
import { memoTemplate } from "./memo"

export const ALL_DOCUMENT_TEMPLATES = [
  plainTemplate,
  letterTemplate,
  reportTemplate,
  memoTemplate,
] as const

/** Union of all valid template names, derived from the registry. */
export type DocumentTemplateName = (typeof ALL_DOCUMENT_TEMPLATES)[number]["name"]

/** Union of all template objects, derived from the registry. */
export type DocumentTemplate = (typeof ALL_DOCUMENT_TEMPLATES)[number]

const TEMPLATE_MAP = new Map<string, DocumentTemplate>(
  ALL_DOCUMENT_TEMPLATES.map((t) => [t.name, t as DocumentTemplate]),
)

/**
 * Look up a template by name. Returns `plainTemplate` as a safe
 * fallback when the name is unknown — consumers never have to
 * null-check. Unknown names are reported via `validateDocumentFrontmatter`
 * as a warning rather than silently swallowed.
 */
export function getDocumentTemplate(name: string): DocumentTemplate {
  return TEMPLATE_MAP.get(name) ?? plainTemplate
}

/** True when the supplied name matches a registered template. */
export function isKnownTemplateName(name: string): name is DocumentTemplateName {
  return TEMPLATE_MAP.has(name)
}

export { plainTemplate, letterTemplate, reportTemplate, memoTemplate }
