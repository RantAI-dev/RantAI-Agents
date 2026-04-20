/**
 * Permissive frontmatter validation for document artifacts.
 *
 * Never throws. Returns an errors array that the renderer surfaces via
 * a banner, while still allowing the body to render with the metadata
 * the user provided. Pattern mirrors `_validate-artifact.ts` — surface
 * issues without blocking.
 */

import {
  getDocumentTemplate,
  isKnownTemplateName,
  type DocumentTemplate,
} from "./templates"

export interface FrontmatterValidationResult {
  /** True when no errors (warnings are allowed). */
  ok: boolean
  /**
   * Parsed & coerced metadata when validation succeeded; the original
   * unchecked metadata otherwise (so the renderer can still read
   * whatever is present, knowing some fields may be missing/wrong).
   */
  data: Record<string, unknown>
  /** Hard errors — missing required fields or type mismatches. */
  errors: string[]
  /** Soft notices — e.g. unknown template name fell back to plain. */
  warnings: string[]
  /** Resolved template (falls back to plain for unknown names). */
  template: DocumentTemplate
}

/**
 * Validate the raw metadata object against the template's Zod schema.
 * Returns a result object rather than throwing so the renderer can
 * display a banner + still show the body.
 *
 * Behavior contract:
 * - Unknown `templateName` → fall back to `plain`; add a warning and
 *   run plain's (permissive) schema so downstream code doesn't crash.
 * - Valid metadata → `ok: true`, `data` is the coerced output.
 * - Invalid metadata → `ok: false`, `data` is the original metadata
 *   (not the parser output), errors list per-field messages formatted
 *   as `path: reason` (e.g. `recipient_name: recipient_name is required`).
 */
export function validateDocumentFrontmatter(
  templateName: string,
  metadata: Record<string, unknown>,
): FrontmatterValidationResult {
  const warnings: string[] = []
  if (!isKnownTemplateName(templateName)) {
    warnings.push(
      `Unknown template "${templateName}" — falling back to plain. Known templates: plain, letter, report, memo.`,
    )
  }

  const template = getDocumentTemplate(templateName)
  const parsed = template.schema.safeParse(metadata)

  if (parsed.success) {
    return {
      ok: true,
      data: parsed.data as Record<string, unknown>,
      errors: [],
      warnings,
      template,
    }
  }

  const errors = parsed.error.issues.map((i) => {
    const path = i.path.length > 0 ? i.path.join(".") : "(root)"
    return `${path}: ${i.message}`
  })

  return {
    ok: false,
    data: metadata,
    errors,
    warnings,
    template,
  }
}
