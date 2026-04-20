/**
 * Shared types for the document artifact subsystem.
 *
 * Document content is markdown with an optional YAML frontmatter block:
 *
 *   ---
 *   template: letter
 *   recipient_name: Jane Doe
 *   ...
 *   ---
 *   # Body starts here
 *
 * Documents without a frontmatter block are treated as the implicit
 * `plain` template with empty metadata — no migration script for legacy
 * markdown content.
 */

export interface FrontmatterResult {
  /** Template name from the `template:` key, or "plain" if absent. */
  template: string
  /** All other frontmatter fields — validated downstream per-template. */
  metadata: Record<string, unknown>
  /** Document body (markdown without the frontmatter block). */
  body: string
  /** true when no frontmatter block was present (implicit plain template). */
  implicit: boolean
  /**
   * Populated when the `---` block was present but YAML parsing failed.
   * Renderer surfaces this via the validation banner — user-friendly form
   * like `Line 3: expected string for "recipient_name"`, NOT raw YAML
   * parser exception text.
   *
   * When parseError is set, `template` falls back to "plain" and `body`
   * contains the whole original content (including the malformed
   * frontmatter block) so the user can see their raw source.
   */
  parseError?: string
}
