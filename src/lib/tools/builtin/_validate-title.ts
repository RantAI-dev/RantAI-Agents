/**
 * Title validation for create_artifact and update_artifact tool calls.
 *
 * The model receives a tool description that asks for a "concise descriptive
 * title (3-8 words)", but smaller/faster models routinely ignore that and
 * pass single placeholder words like "Snippet" or "Untitled". Those titles
 * carry no information — every artifact in the user's Files list ends up
 * indistinguishable from every other one.
 *
 * Surfacing rejection back through the SDK's failureReason: "validation"
 * channel triggers the tool-call retry loop, which prompts the model to
 * re-issue with a meaningful title.
 */

/** Minimum title length after trim. Two chars is the practical floor — single
 *  characters and empty strings are clearly the model giving up on titling. */
const MIN_TITLE_LENGTH = 3

/** Known generic titles LLMs reach for when they don't bother to be descriptive.
 *  Stored lowercase; comparison is case-insensitive against the trimmed input.
 *  Single domain-specific words (e.g. "Fibonacci", "Mandelbrot") aren't here —
 *  this list is narrowly the placeholder words that carry no information. */
const LAZY_TITLES: ReadonlySet<string> = new Set([
  "snippet",
  "untitled",
  "example",
  "code",
  "test",
  "document",
  "output",
  "result",
  "artifact",
  "draft",
  "sample",
  "demo",
  "placeholder",
  "thing",
  "file",
])

export type TitleValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export function validateArtifactTitle(rawTitle: string): TitleValidationResult {
  const title = rawTitle.trim()
  if (title.length === 0) {
    return {
      ok: false,
      reason:
        "Title is empty. Provide a concise descriptive title (3-8 words) that identifies the artifact content.",
    }
  }
  if (title.length < MIN_TITLE_LENGTH) {
    return {
      ok: false,
      reason: `Title "${title}" is too short. Provide a descriptive 3-8 word title — e.g. "Tip calculator with tax", "Fibonacci visualizer", not single characters.`,
    }
  }
  if (LAZY_TITLES.has(title.toLowerCase())) {
    return {
      ok: false,
      reason: `Title "${title}" is a generic placeholder. Re-issue with a descriptive 3-8 word title that summarizes what the artifact does — e.g. "Login form with email validation", "Fibonacci sequence visualizer", "Markdown to HTML converter" — not single placeholder words.`,
    }
  }
  return { ok: true }
}
