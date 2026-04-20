/**
 * Parse a document's content into (template, metadata, body).
 *
 * Documents without a `---` block are auto-wrapped as the implicit
 * `plain` template — the caller gets default metadata and the raw
 * content as `body`. Malformed YAML surfaces as `parseError` so the
 * renderer can display a banner instead of silently rendering raw
 * content.
 */

import matter from "gray-matter"
import type { FrontmatterResult } from "./types"

const FRONTMATTER_BLOCK_REGEX = /^---\s*\r?\n/

/**
 * Format a gray-matter exception into a user-friendly one-line message.
 *
 * gray-matter wraps the underlying `js-yaml` error which usually
 * includes a `mark.line` (zero-indexed). We translate to 1-indexed and
 * strip the stack trace noise so the banner shows something like
 * `Line 3: bad indentation of a mapping entry`.
 */
function formatParseError(err: unknown): string {
  if (!err || typeof err !== "object") return "Frontmatter parse error"
  const maybeYamlErr = err as {
    message?: string
    mark?: { line?: number }
    reason?: string
  }
  const line =
    typeof maybeYamlErr.mark?.line === "number"
      ? maybeYamlErr.mark.line + 1
      : undefined
  const reason =
    maybeYamlErr.reason ||
    (typeof maybeYamlErr.message === "string"
      ? maybeYamlErr.message.split("\n")[0]
      : "parse error")
  return line ? `Line ${line}: ${reason}` : reason
}

export function parseDocumentFrontmatter(content: string): FrontmatterResult {
  const hasBlock = FRONTMATTER_BLOCK_REGEX.test(content)

  if (!hasBlock) {
    return {
      template: "plain",
      metadata: {},
      body: content,
      implicit: true,
    }
  }

  try {
    const parsed = matter(content)
    const rawTemplate = parsed.data.template
    const template =
      typeof rawTemplate === "string" && rawTemplate.trim().length > 0
        ? rawTemplate.trim()
        : "plain"
    return {
      template,
      metadata: parsed.data,
      body: parsed.content,
      implicit: false,
    }
  } catch (err) {
    // YAML syntax error — surface via parseError so the renderer can
    // show a banner. Body keeps the whole raw content so the user can
    // still see what they wrote.
    return {
      template: "plain",
      metadata: {},
      body: content,
      implicit: false,
      parseError: formatParseError(err),
    }
  }
}
