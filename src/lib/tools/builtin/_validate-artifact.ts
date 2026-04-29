/**
 * Server-side validation for HTML and React artifact content.
 *
 * Goals:
 *  - Catch the most common LLM failure modes (missing export default,
 *    non-whitelisted imports, missing viewport, broken HTML structure)
 *    BEFORE persisting to S3 / Prisma.
 *  - Surface failures to the LLM as a structured tool-error so the AI SDK's
 *    natural retry loop produces a corrected artifact on the next call.
 *  - Stay cheap (< 25 ms p50). No network, no LLM, no recursion.
 *
 * Validation is intentionally permissive: only hard runtime-breaking issues
 * are flagged as errors. Style nags are returned as warnings (currently
 * unused but available to renderers later).
 */

import { parse as parseHtml } from "parse5"
import { parse as parseJs } from "@babel/parser"
import type { ArtifactType } from "@/features/conversations/components/chat/artifacts/registry"
import { detectShape, parseSpec } from "@/lib/spreadsheet/parse"
import { evaluateWorkbook } from "@/lib/spreadsheet/formulas"
import { tokenizeCsv } from "@/lib/spreadsheet/csv"
import {
  AESTHETIC_DIRECTIONS,
  DEFAULT_FONTS_BY_DIRECTION,
  MAX_FONT_FAMILIES,
  parseDirectives,
  validateFontSpec,
  type AestheticDirection,
} from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"
import { MERMAID_DIAGRAM_TYPES as MERMAID_DIAGRAM_TYPES_SHARED } from "@/lib/rendering/mermaid-types"

export interface ArtifactValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  /** Resolved/transformed content to persist in place of the original (optional). */
  content?: string
}

/** React libraries the renderer exposes as window globals. */
const REACT_IMPORT_WHITELIST = new Set([
  "react",
  "react-dom",
  "recharts",
  "lucide-react",
  "framer-motion",
])

/** Maximum non-blank lines allowed inside inline <style> blocks. */
const MAX_INLINE_STYLE_LINES = 10

/**
 * Per-artifact-type content validators. The `Record<ArtifactType, …>`
 * constraint makes this exhaustive: adding a new entry to the artifact
 * registry without a validator branch here is a compile-time error.
 *
 * Validators may be sync or async — `validateArtifactContent` awaits the
 * result so callers always get a resolved `ArtifactValidationResult`.
 */
/**
 * Optional context passed through the dispatcher into individual validators.
 *
 * - `isNew`: this content is being CREATED, not updated. Lets validators apply
 *   stricter rules (e.g. size caps, layout deprecations) only to fresh content
 *   and grandfather existing artifacts that pre-date the rule.
 */
export interface ValidationContext {
  isNew?: boolean
}

const VALIDATORS: Record<
  ArtifactType,
  (
    content: string,
    ctx?: ValidationContext,
  ) => ArtifactValidationResult | Promise<ArtifactValidationResult>
> = {
  "text/html": validateHtml,
  "application/react": validateReact,
  "image/svg+xml": validateSvg,
  "application/mermaid": validateMermaid,
  "application/python": validatePython,
  "application/code": validateCode,
  "text/markdown": validateMarkdown,
  "text/document": validateDocument,
  "text/latex": validateLatex,
  "application/sheet": validateSheet,
  "application/slides": validateSlides,
  "application/3d": validate3d,
}

/**
 * Wall-clock budget enforced on every `validateArtifactContent` call.
 *
 * Without a cap, a malicious or pathological artifact can wedge a validator
 * for an unbounded time — `validateLatex` is hand-rolled regex parsing,
 * `validateSlides` walks a deeply branching tree, and `evaluateWorkbook`'s
 * topological sort is O(n²) worst case. The 5-second budget is generous for
 * legitimate artifacts (typical validation completes in < 50ms) and short
 * enough that a malicious payload can't stall the request indefinitely.
 */
/** The default 5-second budget. Read it via `getValidateTimeoutMs()` so
 *  the test override below can shadow it without exposing a mutable
 *  module-level binding to production callers. */
const DEFAULT_VALIDATE_TIMEOUT_MS = 5_000

/** Test-only override. Lives in module scope but is hidden from external
 *  consumers; only the test hook below can mutate it. Reset to undefined
 *  via `__setValidateTimeoutMsForTesting(undefined)` so production
 *  behaviour resumes. */
let __testTimeoutOverride: number | undefined

/** Public read-only accessor. Production callers see the default unless
 *  the test hook has overridden it for a single test. */
export const VALIDATE_TIMEOUT_MS = DEFAULT_VALIDATE_TIMEOUT_MS
function getValidateTimeoutMs(): number {
  return __testTimeoutOverride ?? DEFAULT_VALIDATE_TIMEOUT_MS
}

/** Test-only hook — production code should not call this. Pass `undefined`
 *  to clear the override and restore the default. */
export function __setValidateTimeoutMsForTesting(ms: number | undefined) {
  __testTimeoutOverride = ms
}

export async function validateArtifactContent(
  type: string,
  content: string,
  ctx?: ValidationContext,
): Promise<ArtifactValidationResult> {
  const validator = VALIDATORS[type as ArtifactType]
  if (!validator) return { ok: true, errors: [], warnings: [] }
  const timeoutMs = getValidateTimeoutMs()
  const result = await Promise.race([
    Promise.resolve().then(() => validator(content, ctx)),
    new Promise<ArtifactValidationResult>((resolve) => {
      setTimeout(() => {
        resolve({
          ok: false,
          errors: [
            `Validation timeout: ${type} validator exceeded ${timeoutMs}ms budget. Content may be too complex (e.g. deeply nested structures, oversized formula DAG).`,
          ],
          warnings: [],
        })
      }, timeoutMs).unref?.()
    }),
  ])
  // Post-validation: resolve unsplash:keyword URLs for HTML and slides so
  // every entry-point (LLM tool, API route, manual edit via service.ts) gets
  // resolved content without each having to call the resolvers itself.
  // text/document already resolves inside validateDocument; other types skip.
  if (!result.ok) return result
  if (type === "text/html") {
    const { resolveImages } = await import("@/lib/unsplash")
    return { ...result, content: await resolveImages(result.content ?? content) }
  }
  if (type === "application/slides") {
    const { resolveSlideImages } = await import("@/lib/unsplash")
    return { ...result, content: await resolveSlideImages(result.content ?? content) }
  }
  return result
}

// ---------------------------------------------------------------------------
// Document validation — docx-js script (TS parse + sandbox dry-run)
// ---------------------------------------------------------------------------

async function validateDocument(
  content: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _ctx?: ValidationContext,
): Promise<ArtifactValidationResult> {
  const { validateScriptArtifact } = await import("@/lib/document-script/validator")
  const r = await validateScriptArtifact(content)
  return { ok: r.ok, errors: r.errors, warnings: [] }
}


// ---------------------------------------------------------------------------
// Slides validation (JSON deck — application/slides)
// ---------------------------------------------------------------------------
//
// Mirrors `src/lib/slides/types.ts` (SlideLayout, SlideData) and the
// renderer at slides-renderer.tsx. Hard errors are conditions that would
// produce an empty / broken deck silently; warnings are nags that pass.
const SLIDE_LAYOUTS = new Set([
  "title",
  "content",
  "two-column",
  "section",
  "quote",
  "image-text",
  "closing",
  // Visual layouts
  "diagram",
  "image",
  "chart",
  "diagram-content",
  "image-content",
  "chart-content",
  "hero",
  "stats",
  "gallery",
  "comparison",
  "features",
])
const MAX_SLIDE_BULLETS = 6
const MAX_BULLET_WORDS = 10
const MIN_DECK_SLIDES = 7
const MAX_DECK_SLIDES = 12

function validateSlides(content: string, ctx?: ValidationContext): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("Slides content is empty.")
    return { ok: false, errors, warnings }
  }

  // The renderer falls back to a legacy markdown parser for non-JSON input.
  // We discourage that path: prompts must produce JSON.
  if (!content.trimStart().startsWith("{")) {
    errors.push(
      "Slides content must be a JSON object starting with `{`. The legacy markdown deck format is deprecated and may be removed.",
    )
    return { ok: false, errors, warnings }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    errors.push(
      `Slides JSON failed to parse: ${err instanceof Error ? err.message : String(err)}`,
    )
    return { ok: false, errors, warnings }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    errors.push(
      "Top-level slides JSON must be an object with `theme` and `slides` keys.",
    )
    return { ok: false, errors, warnings }
  }
  const root = parsed as Record<string, unknown>

  if (!Array.isArray(root.slides)) {
    errors.push('Missing `slides` array. Shape: `{ "theme": {...}, "slides": [...] }`.')
    return { ok: false, errors, warnings }
  }
  const slides = root.slides as unknown[]
  if (slides.length === 0) {
    errors.push("`slides` array is empty — provide at least one slide.")
    return { ok: false, errors, warnings }
  }

  // Per-slide structural checks
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    if (!slide || typeof slide !== "object" || Array.isArray(slide)) {
      errors.push(`Slide ${i + 1} must be an object, got ${typeof slide}.`)
      continue
    }
    const s = slide as Record<string, unknown>

    if (typeof s.layout !== "string" || !SLIDE_LAYOUTS.has(s.layout)) {
      errors.push(
        `Slide ${i + 1} has invalid layout "${String(s.layout)}". Allowed: ${[
          ...SLIDE_LAYOUTS,
        ].join(", ")}.`,
      )
      continue
    }

    // Title slide should provide a title (and ideally a subtitle).
    if (s.layout === "title") {
      if (typeof s.title !== "string" || !s.title.trim()) {
        errors.push(`Slide ${i + 1} (title layout) is missing a non-empty \`title\`.`)
      }
      if (typeof s.subtitle !== "string" || !s.subtitle.trim()) {
        warnings.push(`Slide ${i + 1} (title layout) has no \`subtitle\`.`)
      }
    }

    // Content slide must have either bullets or content
    if (s.layout === "content") {
      const hasBullets = Array.isArray(s.bullets) && s.bullets.length > 0
      const hasContent = typeof s.content === "string" && s.content.trim().length > 0
      if (!hasBullets && !hasContent) {
        errors.push(
          `Slide ${i + 1} (content layout) must provide either \`bullets\` (array) or \`content\` (string).`,
        )
      }
    }

    if (s.layout === "two-column") {
      if (!Array.isArray(s.leftColumn) || !Array.isArray(s.rightColumn)) {
        errors.push(
          `Slide ${i + 1} (two-column layout) requires both \`leftColumn\` and \`rightColumn\` as arrays.`,
        )
      }
    }

    if (s.layout === "quote") {
      if (typeof s.quote !== "string" || !s.quote.trim()) {
        errors.push(`Slide ${i + 1} (quote layout) needs a non-empty \`quote\`.`)
      }
    }

    // Bullet count guard
    if (Array.isArray(s.bullets) && s.bullets.length > MAX_SLIDE_BULLETS) {
      warnings.push(
        `Slide ${i + 1} has ${s.bullets.length} bullets — keep slides to ≤ ${MAX_SLIDE_BULLETS} for readability.`,
      )
    }

    // Bullet length guard — bullets are takeaways, not full sentences.
    if (Array.isArray(s.bullets)) {
      for (let b = 0; b < s.bullets.length; b++) {
        const bullet = s.bullets[b]
        if (typeof bullet !== "string") continue
        const wordCount = bullet.trim().split(/\s+/).filter(Boolean).length
        if (wordCount > MAX_BULLET_WORDS) {
          warnings.push(
            `Slide ${i + 1} bullet ${b + 1} is ${wordCount} words — keep bullets ≤ ${MAX_BULLET_WORDS} words. If you need a sentence, use \`content\` instead.`,
          )
        }
      }
    }

    // image-text is deprecated. New artifacts must use `content` (renderer +
    // PPTX both treat the two identically anyway, so there's no migration cost
    // beyond renaming). Existing artifacts still validate to keep them
    // editable until their next save replaces the layout.
    if (s.layout === "image-text") {
      const message = `Slide ${i + 1} uses \`image-text\` layout — this renders identically to \`content\` and adds no image support. Use \`content\` instead.`
      if (ctx?.isNew) {
        errors.push(message)
      } else {
        warnings.push(message)
      }
    }

    // Closing slides should have a title (the CTA / takeaway line).
    if (s.layout === "closing") {
      if (typeof s.title !== "string" || !s.title.trim()) {
        warnings.push(
          `Slide ${i + 1} (closing layout) has no \`title\` — closing slides should carry the CTA or final takeaway.`,
        )
      }
    }

    // Visual layouts validation
    // Diagram layouts require diagram field
    if (s.layout === "diagram" || s.layout === "diagram-content") {
      if (typeof s.diagram !== "string" || !s.diagram.trim()) {
        errors.push(
          `Slide ${i + 1} (${s.layout} layout) requires a non-empty \`diagram\` field with Mermaid code.`,
        )
      } else {
        // Warn if diagram doesn't start with a valid Mermaid declaration.
        // Uses the shared MERMAID_DIAGRAM_TYPES list so this list stays in
        // lockstep with the standalone validator and the document-AST one —
        // historically this had a hand-maintained subset that lacked
        // stateDiagram-v2, xychart-beta, etc., producing "may be invalid"
        // warnings on diagrams the renderer handled fine.
        const diagramTrimmed = (s.diagram as string).trim()
        const hasValidStart = MERMAID_DIAGRAM_TYPES_SHARED.some(
          (k) => diagramTrimmed.startsWith(k + " ") || diagramTrimmed.startsWith(k + "\n") || diagramTrimmed === k,
        )
        if (!hasValidStart) {
          warnings.push(
            `Slide ${i + 1} diagram may be invalid — should start with flowchart, sequenceDiagram, erDiagram, etc.`,
          )
        }
      }
    }

    // Image layouts require imageUrl field
    if (s.layout === "image" || s.layout === "image-content") {
      if (typeof s.imageUrl !== "string" || !s.imageUrl.trim()) {
        errors.push(
          `Slide ${i + 1} (${s.layout} layout) requires a non-empty \`imageUrl\` field (URL or "unsplash:keyword").`,
        )
      }
    }

    // Chart layouts require chart object with type and data
    if (s.layout === "chart" || s.layout === "chart-content") {
      const chart = s.chart as Record<string, unknown> | undefined
      if (!chart || typeof chart !== "object") {
        errors.push(
          `Slide ${i + 1} (${s.layout} layout) requires a \`chart\` object with type and data.`,
        )
      } else {
        const validChartTypes = ["bar", "bar-horizontal", "line", "pie", "donut"]
        if (!validChartTypes.includes(chart.type as string)) {
          errors.push(
            `Slide ${i + 1} chart has invalid type "${chart.type}". Allowed: ${validChartTypes.join(", ")}.`,
          )
        }
        const hasData = Array.isArray(chart.data) && chart.data.length > 0
        const hasSeries = Array.isArray(chart.series) && chart.series.length > 0
        if (!hasData && !hasSeries) {
          errors.push(
            `Slide ${i + 1} chart requires either \`data\` (for bar/pie/donut) or \`series\` (for line).`,
          )
        }
      }
    }

    // Hero layout requires backgroundImage
    if (s.layout === "hero") {
      if (typeof s.backgroundImage !== "string" || !s.backgroundImage.trim()) {
        errors.push(
          `Slide ${i + 1} (hero layout) requires a non-empty \`backgroundImage\` field (URL or "unsplash:keyword").`,
        )
      }
      if (typeof s.title !== "string" || !s.title.trim()) {
        errors.push(`Slide ${i + 1} (hero layout) requires a non-empty \`title\`.`)
      }
    }

    // Stats layout requires stats array with 2-4 items
    if (s.layout === "stats") {
      const stats = s.stats as Array<{ value?: string; label?: string }> | undefined
      if (!Array.isArray(stats) || stats.length === 0) {
        errors.push(
          `Slide ${i + 1} (stats layout) requires a \`stats\` array with 2-4 items.`,
        )
      } else {
        if (stats.length < 2) {
          warnings.push(
            `Slide ${i + 1} (stats layout) has only ${stats.length} stat — use at least 2 for visual balance.`,
          )
        }
        if (stats.length > 4) {
          warnings.push(
            `Slide ${i + 1} (stats layout) has ${stats.length} stats — more than 4 becomes crowded.`,
          )
        }
        for (let j = 0; j < stats.length; j++) {
          const stat = stats[j]
          if (typeof stat?.value !== "string" || !stat.value.trim()) {
            errors.push(
              `Slide ${i + 1} stat ${j + 1} is missing a \`value\` (e.g. "42%", "$1.2M").`,
            )
          }
          if (typeof stat?.label !== "string" || !stat.label.trim()) {
            errors.push(
              `Slide ${i + 1} stat ${j + 1} is missing a \`label\` (e.g. "Revenue Growth").`,
            )
          }
        }
      }
    }

    // Gallery layout requires gallery array with 4-12 items
    if (s.layout === "gallery") {
      const gallery = s.gallery as Array<{ imageUrl?: string }> | undefined
      if (!Array.isArray(gallery) || gallery.length === 0) {
        errors.push(
          `Slide ${i + 1} (gallery layout) requires a \`gallery\` array with 4-12 items.`,
        )
      } else {
        if (gallery.length < 4) {
          warnings.push(
            `Slide ${i + 1} (gallery layout) has only ${gallery.length} items — use at least 4 for a grid effect.`,
          )
        }
        if (gallery.length > 12) {
          warnings.push(
            `Slide ${i + 1} (gallery layout) has ${gallery.length} items — more than 12 becomes too crowded.`,
          )
        }
        for (let j = 0; j < gallery.length; j++) {
          const item = gallery[j]
          if (typeof item?.imageUrl !== "string" || !item.imageUrl.trim()) {
            errors.push(
              `Slide ${i + 1} gallery item ${j + 1} is missing an \`imageUrl\`.`,
            )
          }
        }
      }
    }

    // Comparison layout requires headers and rows
    if (s.layout === "comparison") {
      const headers = s.comparisonHeaders as string[] | undefined
      const rows = s.comparisonRows as Array<{ feature?: string; values?: unknown[] }> | undefined

      if (!Array.isArray(headers) || headers.length < 2) {
        errors.push(
          `Slide ${i + 1} (comparison layout) requires \`comparisonHeaders\` with at least 2 columns (feature + 1 comparison).`,
        )
      }
      if (!Array.isArray(rows) || rows.length === 0) {
        errors.push(
          `Slide ${i + 1} (comparison layout) requires \`comparisonRows\` with at least 1 row.`,
        )
      } else {
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j]
          if (typeof row?.feature !== "string" || !row.feature.trim()) {
            errors.push(
              `Slide ${i + 1} comparison row ${j + 1} is missing a \`feature\` name.`,
            )
          }
          if (!Array.isArray(row?.values)) {
            errors.push(
              `Slide ${i + 1} comparison row ${j + 1} is missing \`values\` array.`,
            )
          } else if (headers && row.values.length !== headers.length - 1) {
            warnings.push(
              `Slide ${i + 1} comparison row ${j + 1} has ${row.values.length} values but expected ${headers.length - 1} (one per column after feature).`,
            )
          }
        }
      }
    }

    // Features layout requires features array with 3-6 items
    if (s.layout === "features") {
      const features = s.features as Array<{ icon?: string; title?: string }> | undefined
      if (!Array.isArray(features) || features.length === 0) {
        errors.push(
          `Slide ${i + 1} (features layout) requires a \`features\` array with 3-6 items.`,
        )
      } else {
        if (features.length < 3) {
          warnings.push(
            `Slide ${i + 1} (features layout) has only ${features.length} items — use at least 3 for a grid effect.`,
          )
        }
        if (features.length > 6) {
          warnings.push(
            `Slide ${i + 1} (features layout) has ${features.length} items — more than 6 becomes too crowded.`,
          )
        }
        for (let j = 0; j < features.length; j++) {
          const item = features[j]
          if (typeof item?.icon !== "string" || !item.icon.trim()) {
            errors.push(
              `Slide ${i + 1} feature ${j + 1} is missing an \`icon\` (e.g. "rocket", "shield").`,
            )
          }
          if (typeof item?.title !== "string" || !item.title.trim()) {
            errors.push(
              `Slide ${i + 1} feature ${j + 1} is missing a \`title\`.`,
            )
          }
        }
      }
    }

    // Split layouts (*-content) require bullets or content
    if (s.layout === "diagram-content" || s.layout === "image-content" || s.layout === "chart-content") {
      const hasBullets = Array.isArray(s.bullets) && s.bullets.length > 0
      const hasContent = typeof s.content === "string" && s.content.trim().length > 0
      if (!hasBullets && !hasContent) {
        errors.push(
          `Slide ${i + 1} (${s.layout} layout) requires either \`bullets\` or \`content\` alongside the visual.`,
        )
      }
    }

    // Markdown syntax leakage — slide text fields should be plain text
    const textFields = ["title", "subtitle", "content", "quote", "attribution", "note"]
    for (const f of textFields) {
      const v = s[f]
      if (typeof v !== "string") continue
      if (/(\*\*|^##\s|`[^`\n]*`)/m.test(v)) {
        warnings.push(
          `Slide ${i + 1} \`${f}\` contains markdown syntax (\`**\`, \`##\`, backticks). Slide text fields are rendered as plain text.`,
        )
        break
      }
    }
  }

  // Deck size convention — outside this range and the deck reads as either
  // too thin or too long for a single sitting.
  if (slides.length < MIN_DECK_SLIDES) {
    warnings.push(
      `Deck has ${slides.length} slides — convention is ${MIN_DECK_SLIDES}–${MAX_DECK_SLIDES}. Fewer than ${MIN_DECK_SLIDES} feels thin.`,
    )
  } else if (slides.length > MAX_DECK_SLIDES) {
    warnings.push(
      `Deck has ${slides.length} slides — convention is ${MIN_DECK_SLIDES}–${MAX_DECK_SLIDES}. More than ${MAX_DECK_SLIDES} loses the audience.`,
    )
  }

  // Layout diversity — a deck of all `content` slides is boring.
  const distinctLayouts = new Set(
    slides
      .map((s) => (s as { layout?: string } | null)?.layout)
      .filter((l): l is string => typeof l === "string"),
  )
  if (slides.length >= 5 && distinctLayouts.size < 3) {
    warnings.push(
      `Deck only uses ${distinctLayouts.size} layout type(s) across ${slides.length} slides — vary the layouts (try \`section\`, \`two-column\`, or \`quote\`) to keep the deck visually engaging.`,
    )
  }

  // First slide should be a title; last slide should be a closing.
  const firstLayout = (slides[0] as { layout?: string } | null)?.layout
  if (firstLayout && firstLayout !== "title") {
    warnings.push(
      `First slide has layout "${firstLayout}" — convention is to open with a \`title\` slide.`,
    )
  }
  const lastLayout = (slides[slides.length - 1] as { layout?: string } | null)?.layout
  if (lastLayout && lastLayout !== "closing") {
    warnings.push(
      `Last slide has layout "${lastLayout}" — convention is to end with a \`closing\` slide.`,
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// 3D / R3F validation (application/3d)
// ---------------------------------------------------------------------------
//
// Mirrors `r3f-renderer.tsx` — the renderer's `sanitizeSceneCode` strips
// imports, exports, <Canvas>, <OrbitControls>, <Environment>, and <color>.
// We surface the same constraints to the LLM so it doesn't unwittingly
// produce code where critical elements get silently removed.
const R3F_ALLOWED_DEPS = new Set([
  // React
  "React",
  "useState",
  "useEffect",
  "useRef",
  "useMemo",
  "useCallback",
  "Suspense",
  "forwardRef",
  "memo",
  "createContext",
  "useContext",
  "Fragment",
  // three.js
  "THREE",
  // @react-three/fiber
  "useFrame",
  "useThree",
  // @react-three/drei
  "useGLTF",
  "useAnimations",
  "Clone",
  "Float",
  "Sparkles",
  "MeshDistortMaterial",
  "MeshWobbleMaterial",
  "Text",
  "Sphere",
  "RoundedBox",
  "MeshTransmissionMaterial",
  "Stars",
  "Trail",
  "Center",
  "Billboard",
  "Grid",
  "Html",
  "Line",
  "GradientTexture",
])

function validate3d(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("3D scene content is empty.")
    return { ok: false, errors, warnings }
  }

  // Markdown fence wrap
  if (/^\s*```/.test(content)) {
    errors.push(
      "Remove the markdown code fences (```jsx ... ```). Output the raw component code only.",
    )
    return { ok: false, errors, warnings }
  }

  // Forbidden constructs — they get silently stripped or break the wrapper
  if (/<Canvas[\s>]/.test(content)) {
    errors.push(
      "Remove <Canvas> — the wrapper provides the Canvas. Your component should render scene contents (meshes, lights, groups) directly inside a Fragment.",
    )
  }
  if (/<OrbitControls[\s>]/.test(content)) {
    errors.push(
      "Remove <OrbitControls> — the wrapper already provides camera controls.",
    )
  }
  if (/<Environment[\s>]/.test(content)) {
    errors.push(
      "Remove <Environment> — the wrapper already provides scene lighting/HDRI.",
    )
  }
  if (/\bdocument\.[A-Za-z]/.test(content)) {
    errors.push(
      "Remove `document.*` access — there is no DOM in the R3F scene. Use refs (`useRef`) and `useFrame` for per-frame logic.",
    )
  }
  if (/\brequestAnimationFrame\s*\(/.test(content)) {
    errors.push(
      "Remove `requestAnimationFrame` — use `useFrame((state, delta) => ...)` from @react-three/fiber for animation loops.",
    )
  }
  if (/new\s+THREE\.WebGLRenderer\b/.test(content)) {
    errors.push(
      "Remove `new THREE.WebGLRenderer` — the renderer is already created by the Canvas wrapper.",
    )
  }

  if (!/\bexport\s+default\b/.test(content)) {
    errors.push(
      "Missing `export default` — the renderer keys off the default export to mount the scene.",
    )
  }

  // Warn about non-whitelisted imports — they will be stripped by the
  // sanitizer, so the LLM should know they're not actually available.
  const importLines = content.match(/^\s*import\s+[\s\S]*?from\s+['"](.+?)['"]/gm) || []
  const unknownImports = new Set<string>()
  for (const line of importLines) {
    const m = line.match(/from\s+['"](.+?)['"]/)
    if (!m) continue
    const source = m[1]
    if (
      source === "react" ||
      source === "three" ||
      source === "@react-three/fiber" ||
      source === "@react-three/drei"
    ) {
      // Extract named imports and check against the allowed deps
      const namedMatch = line.match(/\{([^}]+)\}/)
      if (namedMatch) {
        const names = namedMatch[1]
          .split(",")
          .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean)
        for (const name of names) {
          if (!R3F_ALLOWED_DEPS.has(name)) {
            unknownImports.add(name)
          }
        }
      }
      continue
    }
    // Imports from other packages are not available at all
    unknownImports.add(source)
  }
  if (unknownImports.size > 0) {
    warnings.push(
      `Imports the renderer cannot provide: ${[...unknownImports]
        .slice(0, 8)
        .map((n) => `\`${n}\``)
        .join(", ")}. The sanitizer strips all imports — only react, three, @react-three/fiber, and @react-three/drei symbols listed in the prompt are exposed.`,
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// Sheet validation (CSV or JSON-array-of-objects)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const NON_ISO_DATE =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})$/
const CURRENCY_NUMBER = /^[\$€£¥]\s*-?\d/
const THOUSANDS_NUMBER = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/

function validateSheet(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("Sheet content is empty.")
    return { ok: false, errors, warnings }
  }

  const trimmed = content.trimStart()

  // ----- Spec branch -----
  const shape = detectShape(content)

  if (shape === "spec") {
    const parsed = parseSpec(content)
    if (!parsed.ok || !parsed.spec) {
      return { ok: false, errors: parsed.errors, warnings: parsed.warnings }
    }

    const values = evaluateWorkbook(parsed.spec)
    const cellErrors: string[] = []
    for (const [key, v] of values) {
      if (v.error === "CIRCULAR") {
        cellErrors.push(`Cell ${key} is part of a circular reference.`)
      } else if (v.error === "REF" || v.error === "NAME") {
        cellErrors.push(
          `Cell ${key} references an undefined cell or name (#${v.error}!).`
        )
      }
    }
    if (cellErrors.length > 0) {
      const deduped = Array.from(new Set(cellErrors))
      return { ok: false, errors: deduped, warnings: parsed.warnings }
    }

    return {
      ok: true,
      errors: [],
      warnings: parsed.warnings,
    }
  }

  // ----- JSON branch -----
  if (trimmed.startsWith("[")) {
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err) {
      errors.push(
        `JSON failed to parse: ${err instanceof Error ? err.message : String(err)}`
      )
      return { ok: false, errors, warnings }
    }
    if (!Array.isArray(parsed)) {
      errors.push("Top-level JSON must be an array of objects.")
      return { ok: false, errors, warnings }
    }
    if (parsed.length === 0) {
      errors.push("JSON array is empty — provide at least one row.")
      return { ok: false, errors, warnings }
    }
    const first = parsed[0]
    if (
      first === null ||
      typeof first !== "object" ||
      Array.isArray(first) ||
      Object.keys(first as object).length === 0
    ) {
      errors.push(
        "First JSON element must be a non-empty object whose keys become column headers."
      )
      return { ok: false, errors, warnings }
    }

    const headerKeys = Object.keys(first as object)
    const headerSet = new Set(headerKeys)
    let nestedValueSeen = false

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i]
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        errors.push(`Row ${i} is not an object — every row must be a flat object.`)
        return { ok: false, errors, warnings }
      }
      const rowKeys = Object.keys(row as object)
      if (rowKeys.length !== headerKeys.length) {
        errors.push(
          `Row ${i} has ${rowKeys.length} keys but the schema (from row 0) has ${headerKeys.length}. Every object must have the same keys.`
        )
        return { ok: false, errors, warnings }
      }
      for (const k of rowKeys) {
        if (!headerSet.has(k)) {
          errors.push(
            `Row ${i} has unexpected key "${k}" not present in row 0. Every object must have the same keys.`
          )
          return { ok: false, errors, warnings }
        }
      }
      if (!nestedValueSeen) {
        for (const k of headerKeys) {
          const v = (row as Record<string, unknown>)[k]
          if (v !== null && typeof v === "object") {
            nestedValueSeen = true
            break
          }
        }
      }
    }

    if (parsed.length > 100) {
      warnings.push(
        `JSON has ${parsed.length} rows — the renderer has no pagination, all rows render at once. Aim for ≤ 100.`
      )
    }
    if (headerKeys.length > 10) {
      warnings.push(
        `JSON has ${headerKeys.length} columns — wider than 10 becomes hard to read. Drop the least important columns.`
      )
    }
    if (nestedValueSeen) {
      warnings.push(
        "Some JSON values are nested objects or arrays — these stringify as `[object Object]` in the table. Flatten them before emitting."
      )
    }
    // All-identical column check
    for (const k of headerKeys) {
      const vals = new Set<string>()
      for (const row of parsed as Record<string, unknown>[]) {
        vals.add(String(row[k] ?? ""))
        if (vals.size > 1) break
      }
      if (vals.size === 1 && parsed.length > 1) {
        warnings.push(
          `Column "${k}" has the same value in every row — adds no sort/filter value, consider removing it.`
        )
        break
      }
    }

    return { ok: errors.length === 0, errors, warnings }
  }

  // ----- CSV branch -----
  const rows = tokenizeCsv(content)
  if (rows.length < 2) {
    errors.push(
      "CSV needs at least a header row and one data row. Found " +
        rows.length +
        "."
    )
    return { ok: false, errors, warnings }
  }
  const headers = rows[0]
  const dataRows = rows.slice(1)
  const colCount = headers.length

  // NOTE: the renderer (sheet-renderer.tsx) is more permissive than this
  // validator — it pads short rows with empty strings rather than rejecting
  // the whole sheet. We intentionally enforce the stricter contract here so
  // mismatched column counts surface to the LLM as a retry signal instead of
  // silently truncating user data at render time.
  for (let i = 0; i < dataRows.length; i++) {
    if (dataRows[i].length !== colCount) {
      errors.push(
        `CSV row ${i + 1} has ${dataRows[i].length} columns but the header has ${colCount}. Every row must have the same column count.`
      )
      return { ok: false, errors, warnings }
    }
  }

  if (dataRows.length > 100) {
    warnings.push(
      `CSV has ${dataRows.length} data rows — the renderer has no pagination, all rows render at once. Aim for ≤ 100.`
    )
  }
  if (colCount > 10) {
    warnings.push(
      `CSV has ${colCount} columns — wider than 10 becomes hard to read. Drop the least important columns.`
    )
  }

  // Per-column heuristics
  for (let c = 0; c < colCount; c++) {
    const header = headers[c]
    const values = dataRows.map((r) => r[c])

    const distinct = new Set(values)
    if (distinct.size === 1 && dataRows.length > 1) {
      warnings.push(
        `Column "${header}" has the same value in every row — adds no sort/filter value, consider removing it.`
      )
    }

    // Currency / thousands inside numeric-looking column
    let currencyHits = 0
    for (const v of values) {
      if (CURRENCY_NUMBER.test(v) || THOUSANDS_NUMBER.test(v)) currencyHits++
    }
    if (currencyHits >= 1) {
      warnings.push(
        `Column "${header}" contains currency symbols or thousand separators (e.g. \`$1,234\`). Store plain numbers (\`1234\`) — sorting is lexicographic and formatted strings sort wrong.`
      )
    }

    // Mixed date formats — only fire on date-ish headers to avoid false positives
    if (/date|day|month|time/i.test(header)) {
      let isoHits = 0
      let nonIsoHits = 0
      for (const v of values) {
        if (!v) continue
        if (ISO_DATE.test(v)) isoHits++
        else if (NON_ISO_DATE.test(v)) nonIsoHits++
      }
      if (isoHits >= 2 && nonIsoHits >= 2) {
        warnings.push(
          `Column "${header}" mixes ISO dates (\`YYYY-MM-DD\`) with other date formats. Pick one format — ISO sorts correctly as a string.`
        )
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// Markdown validation
// ---------------------------------------------------------------------------

/** Hard size cap on newly created markdown artifacts (existing ones grandfathered). */
const MARKDOWN_NEW_CAP_BYTES = 128 * 1024

function validateMarkdown(content: string, ctx?: ValidationContext): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("Markdown content is empty.")
    return { ok: false, errors, warnings }
  }

  // Per-type size cap on creates only — updates of pre-existing oversized
  // artifacts must keep working so users can still edit them down to size
  // rather than getting locked out.
  if (ctx?.isNew) {
    const bytes = Buffer.byteLength(content, "utf-8")
    if (bytes > MARKDOWN_NEW_CAP_BYTES) {
      errors.push(
        `Markdown content exceeds new-artifact size cap (${Math.round(bytes / 1024)}KB > ${MARKDOWN_NEW_CAP_BYTES / 1024}KB). Split into multiple artifacts or move long-form prose into text/document.`,
      )
      return { ok: false, errors, warnings }
    }
  }

  const lines = content.split("\n")
  const firstNonBlank = lines.find((l) => l.trim().length > 0) ?? ""

  if (!/^#\s+\S/.test(firstNonBlank)) {
    warnings.push(
      "Document does not begin with a top-level heading. Start with a single `# Title`."
    )
  }

  // Heading level skip detection: track previous heading level, warn if a
  // heading jumps more than one level deeper.
  let prevLevel = 0
  let firstHeadingSeen = false
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+\S/)
    if (!m) continue
    const level = m[1].length
    if (!firstHeadingSeen) {
      firstHeadingSeen = true
      prevLevel = level
      continue
    }
    if (level > prevLevel + 1) {
      warnings.push(
        `Heading level jumps from h${prevLevel} to h${level} — never skip levels (e.g. \`#\` directly to \`###\`).`
      )
      break
    }
    prevLevel = level
  }

  if (/<script[\s>]/i.test(content)) {
    // Strict mode (env-gated, default off) treats <script> as a hard error so
    // the LLM/user can't ship markdown that includes embedded scripts. Default
    // is a soft warning to avoid breaking legitimate stored artifacts that may
    // have <script> in code blocks for tutorial purposes.
    const strict = process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION === "true"
    const message =
      "Found a <script> tag. Markdown does not execute scripts — if you need an interactive page, use the `text/html` artifact type instead."
    if (strict) {
      errors.push(message)
    } else {
      warnings.push(message)
    }
  }

  // Raw HTML tags the prompt forbids — most renderers either drop them or
  // render them inconsistently. Restrict the check to common offenders so we
  // don't flag legitimate inline HTML like <br> or comment tags.
  const RAW_HTML_DISALLOWED = [
    "details",
    "summary",
    "kbd",
    "mark",
    "iframe",
    "video",
    "audio",
    "object",
    "embed",
    "table",
  ]
  const rawHtmlHits = RAW_HTML_DISALLOWED.filter((tag) =>
    new RegExp(`<\\s*${tag}[\\s>/]`, "i").test(content)
  )
  if (rawHtmlHits.length > 0) {
    warnings.push(
      `Raw HTML tags detected (${rawHtmlHits
        .map((t) => `<${t}>`)
        .join(", ")}). The markdown renderer either strips or mis-renders these — use markdown syntax instead, or switch to the \`text/html\` artifact type.`
    )
  }

  // Fenced code blocks must declare a language for syntax highlighting.
  // Match opening fences (``` at line start) that have NO trailing identifier.
  const fenceLines = lines.filter((l) => /^\s*```/.test(l))
  let unlabeledFences = 0
  let inFence = false
  for (const line of fenceLines) {
    if (!inFence) {
      // Opening fence — must have a non-empty language tag after the backticks
      if (!/^\s*```[A-Za-z][A-Za-z0-9+_-]*/.test(line)) {
        unlabeledFences++
      }
      inFence = true
    } else {
      inFence = false
    }
  }
  if (unlabeledFences > 0) {
    warnings.push(
      `${unlabeledFences} fenced code block${unlabeledFences === 1 ? "" : "s"} missing a language tag. Always tag fences (\`\`\`ts, \`\`\`python, \`\`\`bash, …) so syntax highlighting works.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// LaTeX validation
// ---------------------------------------------------------------------------

/**
 * KaTeX / our renderer cannot handle these commands. They almost always show
 * up when an LLM thinks it's writing for a full LaTeX engine (pdflatex etc.).
 *
 * `severity: "error"` — fundamentally cannot render in KaTeX, must be removed.
 * `severity: "warning"` — silently dropped by the renderer; LLM should know.
 */
const LATEX_UNSUPPORTED_COMMANDS: ReadonlyArray<{
  pattern: RegExp
  label: string
  severity: "error" | "warning"
}> = [
  { pattern: /\\includegraphics\b/, label: "\\includegraphics", severity: "error" },
  { pattern: /\\bibliography\b/, label: "\\bibliography", severity: "error" },
  { pattern: /\\cite\b/, label: "\\cite", severity: "error" },
  { pattern: /\\input\b/, label: "\\input", severity: "error" },
  { pattern: /\\include\b/, label: "\\include", severity: "error" },
  { pattern: /\\begin\{tikzpicture\}/, label: "\\begin{tikzpicture}", severity: "error" },
  { pattern: /\\begin\{figure\}/, label: "\\begin{figure}", severity: "error" },
  { pattern: /\\begin\{table\}/, label: "\\begin{table}", severity: "error" },
  { pattern: /\\begin\{tabular\}/, label: "\\begin{tabular}", severity: "error" },
  { pattern: /\\begin\{verbatim\}/, label: "\\begin{verbatim}", severity: "warning" },
  { pattern: /\\verb\b/, label: "\\verb", severity: "warning" },
  { pattern: /\\label\{/, label: "\\label{}", severity: "warning" },
  { pattern: /\\ref\{/, label: "\\ref{}", severity: "warning" },
  { pattern: /\\eqref\{/, label: "\\eqref{}", severity: "warning" },
]

function validateLatex(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("LaTeX content is empty.")
    return { ok: false, errors, warnings }
  }

  if (/\\documentclass\b/.test(content)) {
    errors.push(
      "Found \\documentclass — this renderer is KaTeX, not a full LaTeX engine. Remove the preamble; write the body directly with \\section, math environments, and inline math."
    )
  }
  if (/\\usepackage\b/.test(content)) {
    errors.push(
      "Found \\usepackage — KaTeX has no package system. Remove all \\usepackage lines; the supported commands are built in."
    )
  }
  if (/\\begin\{document\}/.test(content)) {
    errors.push(
      "Found \\begin{document} — KaTeX has no document environment. Remove \\begin{document} / \\end{document} and write the body directly."
    )
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings }
  }

  // Math-delimiter sniff: $...$, $$...$$, \[...\], or any supported math env.
  const hasMathDelimiter =
    /\$[^$\n]+\$/.test(content) ||
    /\$\$[\s\S]+?\$\$/.test(content) ||
    /\\\[[\s\S]+?\\\]/.test(content) ||
    /\\begin\{(equation|align|gather|multline|cases|eqnarray)\*?\}/.test(content)

  if (!hasMathDelimiter) {
    warnings.push(
      "No math delimiters detected ($, $$, \\[, or a math environment). If this document has no math, prefer the `text/markdown` artifact type."
    )
  }

  const errorHits: string[] = []
  const warningHits: string[] = []
  for (const { pattern, label, severity } of LATEX_UNSUPPORTED_COMMANDS) {
    if (!pattern.test(content)) continue
    if (severity === "error") errorHits.push(label)
    else warningHits.push(label)
  }
  if (errorHits.length > 0) {
    errors.push(
      `Found commands KaTeX/this renderer fundamentally cannot render: ${errorHits
        .slice(0, 5)
        .map((h) => `"${h}"`)
        .join(", ")}. Remove them — figures, tables, citations, and external file inclusion are not supported.`
    )
  }
  if (warningHits.length > 0) {
    warnings.push(
      `Found commands not supported by KaTeX / this renderer: ${warningHits
        .slice(0, 5)
        .map((h) => `"${h}"`)
        .join(", ")}. They will be silently dropped or render as red error fragments.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// Code validation
// ---------------------------------------------------------------------------

/**
 * Truncation / placeholder markers that indicate the LLM gave up partway.
 * Each pattern is chosen to be unlikely in real, complete code.
 */
const CODE_TRUNCATION_MARKERS: ReadonlyArray<{ marker: RegExp; label: string }> = [
  { marker: /\/\/\s*\.{3,}\s*(rest|more|etc|remaining|omitted)/i, label: "// ... rest" },
  { marker: /\/\*\s*\.{3,}\s*(rest|more|etc|remaining|omitted)[\s\S]*?\*\//i, label: "/* ... rest */" },
  { marker: /#\s*\.{3,}\s*(rest|more|etc|remaining|omitted)/i, label: "# ... rest" },
  { marker: /\/\/\s*TODO:?\s*implement/i, label: "// TODO: implement" },
  { marker: /#\s*TODO:?\s*implement/i, label: "# TODO: implement" },
  { marker: /\/\/\s*implement (this|me)/i, label: "// implement this" },
  { marker: /throw new Error\(\s*["'`]not[ _-]?implemented["'`]/i, label: 'throw new Error("not implemented")' },
  { marker: /\bunimplemented!\s*\(/i, label: "unimplemented!()" },
  { marker: /\btodo!\s*\(/i, label: "todo!()" },
  { marker: /\bpass\s*#\s*(placeholder|implement|todo)/i, label: "pass  # placeholder" },
]

function validateCode(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = content.trim()

  if (!trimmed) {
    errors.push("Code content is empty.")
    return { ok: false, errors, warnings }
  }

  // Wrong-type guard: HTML document masquerading as code.
  if (/^\s*<!doctype\s+html/i.test(content) || /^\s*<html[\s>]/i.test(content)) {
    errors.push(
      "This looks like an HTML document. Use type 'text/html' so it renders in the preview iframe, not 'application/code'."
    )
    return { ok: false, errors, warnings }
  }

  // Wrong-type guard: markdown fence wrap — LLM treated content as markdown.
  const firstLine = trimmed.split("\n")[0] ?? ""
  if (/^\s*```/.test(firstLine)) {
    errors.push(
      "Remove the markdown code fences (```lang ... ```). The artifact content is the code itself — the renderer adds highlighting."
    )
    return { ok: false, errors, warnings }
  }

  // Truncation / placeholder warnings
  const hits: string[] = []
  for (const { marker, label } of CODE_TRUNCATION_MARKERS) {
    if (marker.test(content)) hits.push(label)
  }
  if (hits.length > 0) {
    warnings.push(
      `Detected likely truncation or placeholder markers: ${hits
        .slice(0, 3)
        .map((h) => `"${h}"`)
        .join(", ")}. Output the COMPLETE code with every function implemented.`
    )
  }

  // Use byte length (not char length) so multibyte UTF-8 content is sized
  // consistently with the 512KB cap enforced by create-artifact.ts. The old
  // char-based check could let a CJK / emoji-heavy snippet pass this warning
  // and then fail the byte cap upstream.
  const bytes = Buffer.byteLength(content, "utf-8")
  if (bytes > 512 * 1024) {
    warnings.push(
      `Code content is ${Math.round(bytes / 1024)}KB — consider splitting into multiple files or trimming.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// Mermaid validation
// ---------------------------------------------------------------------------

/**
 * Recognized Mermaid diagram type declarations. Single source of truth is
 * `@/lib/rendering/mermaid-types` (imported at the top of this file as
 * `MERMAID_DIAGRAM_TYPES_SHARED`); we alias under the local name
 * `MERMAID_DIAGRAM_TYPES` so the longer-prefix-first ordering this validator
 * relies on (e.g. `stateDiagram-v2` before `stateDiagram`) stays in lockstep
 * with the slides validator.
 */
const MERMAID_DIAGRAM_TYPES: readonly string[] = MERMAID_DIAGRAM_TYPES_SHARED

function validateMermaid(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("Mermaid content is empty.")
    return { ok: false, errors, warnings }
  }

  // Find the first meaningful line: skip leading frontmatter (--- ... ---),
  // skip directives/comments (%% ...), skip blank lines.
  const rawLines = content.split("\n")
  let inFrontmatter = false
  let seenFrontmatterFence = false
  let firstLine: string | null = null

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line) continue

    // Leading frontmatter: first `---` opens, next `---` closes.
    if (line === "---") {
      if (!seenFrontmatterFence) {
        seenFrontmatterFence = true
        inFrontmatter = true
        continue
      }
      if (inFrontmatter) {
        inFrontmatter = false
        continue
      }
    }
    if (inFrontmatter) continue

    // Skip directives and comments
    if (line.startsWith("%%")) continue

    firstLine = line
    break
  }

  // Markdown fence wrap
  if (firstLine && firstLine.startsWith("```")) {
    errors.push(
      "Remove markdown code fences (```mermaid ... ```) — output raw Mermaid syntax only."
    )
    return { ok: false, errors, warnings }
  }

  // Recognized diagram type declaration
  const hasDeclaration =
    firstLine != null &&
    MERMAID_DIAGRAM_TYPES.some(
      (k) =>
        firstLine === k ||
        firstLine.startsWith(k + " ") ||
        firstLine.startsWith(k + "\t")
    )

  if (!hasDeclaration) {
    errors.push(
      "Missing or unrecognized diagram type declaration on the first non-empty line. Must start with one of: flowchart, sequenceDiagram, erDiagram, stateDiagram-v2, classDiagram, gantt, pie, mindmap, gitGraph, journey, quadrantChart, timeline, sankey-beta, xychart-beta, block-beta, kanban, C4Context, requirementDiagram, architecture-beta."
    )
    return { ok: false, errors, warnings }
  }

  // Length warning
  if (content.length > 3000) {
    warnings.push(
      `Mermaid content is ${content.length} chars — likely too complex to render readably. Aim for ≤ 3000 chars.`
    )
  }

  // Flowchart-style node count heuristic — only meaningful for graph/flowchart;
  // ER/class diagrams use brace blocks for attributes which trip the regex.
  const isFlowish =
    firstLine != null &&
    (firstLine.startsWith("flowchart") || firstLine.startsWith("graph"))
  if (isFlowish) {
    const nodeDefRegex = /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*[[({]/gm
    const nodeMatches = content.match(nodeDefRegex)
    if (nodeMatches && nodeMatches.length > 15) {
      warnings.push(
        `Detected ${nodeMatches.length} node definitions — flowcharts with more than 15 nodes become unreadable. Consider splitting into multiple diagrams.`
      )
    }
  }

  // Theme/init override — prompts forbid these because they break dark mode.
  if (/%%\{\s*init\s*:[\s\S]*?theme[\s\S]*?\}%%/.test(content)) {
    warnings.push(
      "Found a `%%{init: ... theme ...}%%` directive. Do not override Mermaid theme — the renderer manages light/dark theming based on the host app."
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// SVG validation
// ---------------------------------------------------------------------------

type SvgNode = {
  nodeName: string
  tagName?: string
  attrs?: Array<{ name: string; value: string }>
  childNodes?: SvgNode[]
  parentNode?: SvgNode
}

function validateSvg(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("SVG content is empty.")
    return { ok: false, errors, warnings }
  }

  let document
  try {
    document = parseHtml(content)
  } catch (err) {
    errors.push(
      `SVG failed to parse: ${err instanceof Error ? err.message : String(err)}`
    )
    return { ok: false, errors, warnings }
  }

  let rootSvg: SvgNode | null = null
  let scriptCount = 0
  let foreignObjectCount = 0
  let styleBlockCount = 0
  let titleAsSvgChild = 0
  const externalHrefs: string[] = []
  const eventHandlers = new Set<string>()
  const colorValues = new Set<string>()
  let highPrecisionPath = false

  const walk = (node: SvgNode) => {
    const tag = node.tagName || node.nodeName
    const tagLc = tag?.toLowerCase()
    if (tagLc === "svg" && !rootSvg) rootSvg = node
    if (tagLc === "script") scriptCount++
    if (tagLc === "foreignobject") foreignObjectCount++
    if (tagLc === "style") styleBlockCount++
    if (tagLc === "title") {
      const parentTag = (
        node.parentNode?.tagName || node.parentNode?.nodeName
      )?.toLowerCase()
      if (parentTag === "svg") titleAsSvgChild++
    }

    node.attrs?.forEach((a) => {
      if (a.name === "href" || a.name === "xlink:href") {
        if (/^(https?:|data:|\/\/)/i.test(a.value)) externalHrefs.push(a.value)
      }
      if (/^on[a-z]+$/i.test(a.name)) eventHandlers.add(a.name)
      if (
        (a.name === "fill" || a.name === "stroke") &&
        a.value &&
        a.value !== "none" &&
        a.value !== "currentColor" &&
        !a.value.startsWith("url(")
      ) {
        colorValues.add(a.value.toLowerCase())
      }
      if (a.name === "d" && /\d\.\d{3,}/.test(a.value)) highPrecisionPath = true
    })
    node.childNodes?.forEach(walk)
  }
  walk(document as unknown as SvgNode)

  if (!rootSvg) {
    errors.push("Missing root <svg> element.")
    return { ok: false, errors, warnings }
  }

  const rootAttrs = (rootSvg as SvgNode).attrs ?? []
  const hasXmlns = rootAttrs.some((a) => a.name.toLowerCase() === "xmlns")
  const hasViewBox = rootAttrs.some((a) => a.name.toLowerCase() === "viewbox")
  const hasWidth = rootAttrs.some((a) => a.name.toLowerCase() === "width")
  const hasHeight = rootAttrs.some((a) => a.name.toLowerCase() === "height")
  const ariaHidden =
    rootAttrs.find((a) => a.name === "aria-hidden")?.value === "true"

  if (!hasXmlns) {
    errors.push('Missing xmlns="http://www.w3.org/2000/svg" on root <svg>.')
  }
  if (!hasViewBox) {
    errors.push(
      "Missing viewBox attribute on root <svg>. The renderer scales by viewBox; without it the SVG cannot render responsively."
    )
  }
  if (hasWidth || hasHeight) {
    errors.push(
      "Remove hardcoded width/height attributes from the root <svg>. Use viewBox only so the SVG scales responsively to its container."
    )
  }
  if (scriptCount > 0) {
    errors.push(
      "Found <script> element(s) — these are stripped by the sanitizer. Remove them."
    )
  }
  if (foreignObjectCount > 0) {
    errors.push(
      "Found <foreignObject> element(s) — these are stripped by the sanitizer. Remove them."
    )
  }
  if (externalHrefs.length > 0) {
    errors.push(
      `Found external href/xlink:href references: ${externalHrefs
        .slice(0, 3)
        .map((h) => `"${h}"`)
        .join(", ")}. Only same-document fragment references (#id) are allowed.`
    )
  }
  if (eventHandlers.size > 0) {
    errors.push(
      `Found event handler attributes: ${[...eventHandlers].join(
        ", "
      )}. These are stripped by the sanitizer — remove them.`
    )
  }

  if (titleAsSvgChild === 0 && !ariaHidden) {
    warnings.push(
      'Missing <title> child of root <svg>. Add one for accessibility, or set aria-hidden="true" if the SVG is purely decorative.'
    )
  }
  if (styleBlockCount > 0) {
    errors.push(
      "Inline <style> block detected. Because the renderer is not iframed, CSS inside <style> leaks into the host page. Use SVG presentation attributes (fill, stroke, stroke-width, opacity) instead."
    )
  }
  if (colorValues.size > 5) {
    warnings.push(
      `SVG uses ${colorValues.size} distinct colors. Aim for ≤ 5 for visual cohesion.`
    )
  }
  if (highPrecisionPath) {
    warnings.push(
      "Some path coordinates use more than 2 decimal places. Round to 1 decimal for readability and smaller file size."
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// HTML validation
// ---------------------------------------------------------------------------

function validateHtml(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Doctype (case-insensitive, must appear early)
  if (!/^\s*<!doctype\s+html/i.test(content)) {
    errors.push(
      "Missing <!DOCTYPE html> declaration at the top of the document."
    )
  }

  // 2. Parse with parse5 — this is forgiving so a parse failure is a hard signal
  let document
  try {
    document = parseHtml(content)
  } catch (err) {
    errors.push(
      `HTML failed to parse: ${err instanceof Error ? err.message : String(err)}`
    )
    return { ok: false, errors, warnings }
  }

  // 3. Walk the tree once and collect what we need
  const found = {
    html: false,
    head: false,
    body: false,
    title: false,
    titleHasText: false,
    viewport: false,
    formWithAction: false,
    inlineStyleOverflow: false,
  }

  type Node = {
    nodeName: string
    tagName?: string
    attrs?: Array<{ name: string; value: string }>
    childNodes?: Node[]
    value?: string
    parentNode?: Node
  }

  const walk = (node: Node) => {
    const tag = node.tagName || node.nodeName
    if (tag === "html") found.html = true
    if (tag === "head") found.head = true
    if (tag === "body") found.body = true

    if (tag === "title") {
      found.title = true
      const textChild = node.childNodes?.find((c) => c.nodeName === "#text")
      if (textChild?.value && textChild.value.trim().length > 0) {
        found.titleHasText = true
      }
    }

    if (tag === "meta") {
      const nameAttr = node.attrs?.find((a) => a.name === "name")?.value
      if (nameAttr === "viewport") found.viewport = true
    }

    if (tag === "form") {
      const action = node.attrs?.find((a) => a.name === "action")?.value
      if (action) found.formWithAction = true
    }

    if (tag === "style") {
      const text =
        node.childNodes?.find((c) => c.nodeName === "#text")?.value ?? ""
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0).length
      if (lines > MAX_INLINE_STYLE_LINES) {
        found.inlineStyleOverflow = true
      }
    }

    node.childNodes?.forEach(walk)
  }
  walk(document as unknown as Node)

  if (!found.html) errors.push("Missing <html> root element.")
  if (!found.head) errors.push("Missing <head> element.")
  if (!found.body) errors.push("Missing <body> element.")
  if (!found.title || !found.titleHasText) {
    errors.push("Missing or empty <title> element inside <head>.")
  }
  if (!found.viewport) {
    errors.push(
      'Missing <meta name="viewport" content="width=device-width, initial-scale=1.0"> in <head>.'
    )
  }
  if (found.formWithAction) {
    errors.push(
      'Found <form action="..."> — the iframe sandbox blocks form submission. Use onSubmit JS handlers instead and remove the action attribute.'
    )
  }
  if (found.inlineStyleOverflow) {
    warnings.push(
      `Inline <style> block exceeds ${MAX_INLINE_STYLE_LINES} non-blank lines. Prefer Tailwind utility classes instead of custom CSS.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// React validation
// ---------------------------------------------------------------------------

/** Serif families that the renderer ships as defaults for at least one direction. */
const KNOWN_SERIF_FAMILIES = [
  "Fraunces",
  "Playfair",
  "DM Serif",
  "Cormorant",
  "Newsreader",
  "Crimson Pro",
  "Lora",
]

/** Threshold above which slate/indigo density is considered "industrial-coded". */
const PALETTE_MISMATCH_THRESHOLD = 6

function appendAestheticWarnings(
  content: string,
  aesthetic: AestheticDirection,
  fonts: string[] | null,
  warnings: string[]
): void {
  // Palette-direction mismatch: non-industrial + dense slate/indigo usage.
  if (aesthetic !== "industrial") {
    const slateIndigoCount = (
      content.match(/\b(slate|indigo)-(\d{2,3})\b/g) ?? []
    ).length
    if (slateIndigoCount >= PALETTE_MISMATCH_THRESHOLD) {
      warnings.push(
        `You declared @aesthetic: ${aesthetic} but the palette reads industrial ` +
          `(${slateIndigoCount} slate/indigo class references). Consider reviewing ` +
          `the color palette for the ${aesthetic} direction.`
      )
    }
  }

  // Font-direction mismatch: editorial or luxury without a serif.
  if (aesthetic === "editorial" || aesthetic === "luxury") {
    const fontsToCheck = fonts ?? DEFAULT_FONTS_BY_DIRECTION[aesthetic]
    const hasSerif = fontsToCheck.some((spec) =>
      KNOWN_SERIF_FAMILIES.some((family) => spec.startsWith(family))
    )
    if (!hasSerif) {
      warnings.push(
        `@aesthetic: ${aesthetic} typically pairs with a serif display face. ` +
          `No known serif detected in @fonts directive.`
      )
    }
  }

  // Motion-in-industrial: Motion library usage under industrial direction.
  if (aesthetic === "industrial") {
    if (/\bMotion\.(motion|AnimatePresence)\b/.test(content)) {
      warnings.push(
        `Industrial direction favors minimal or no motion. Consider plain CSS ` +
          `transitions instead of framer-motion.`
      )
    }
  }
}

function stripDirectiveLines(
  content: string,
  directives: { rawAestheticLine: string | null; rawFontsLine: string | null }
): string {
  const lines = content.split("\n")
  if (directives.rawFontsLine && lines[1] === directives.rawFontsLine) {
    lines[1] = ""
  }
  if (directives.rawAestheticLine && lines[0] === directives.rawAestheticLine) {
    lines[0] = ""
  }
  return lines.join("\n")
}

function validateReact(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 0. Directive enforcement — before any JS parsing, so bad directives
  //    surface a clear author-time error instead of a confusing parse fail.
  const directives = parseDirectives(content)

  const aestheticRequired =
    process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED !== "false"

  if (!directives.rawAestheticLine) {
    const message =
      '@aesthetic directive missing on line 1. Pick one of: ' +
      AESTHETIC_DIRECTIONS.join(", ") +
      ". See prompt rules for direction selection heuristic."
    if (aestheticRequired) {
      errors.push(message)
      return { ok: false, errors, warnings }
    } else {
      warnings.push(message)
      // Continue without aesthetic — soft-warns below are skipped because
      // directives.aesthetic is null.
    }
  } else if (!directives.aesthetic) {
    const badValue = directives.rawAestheticLine
      .replace(/^\s*\/\/\s*@aesthetic\s*:\s*/, "")
      .trim()
    const message =
      `Unknown aesthetic direction "${badValue}". Valid: ` +
      AESTHETIC_DIRECTIONS.join(", ") +
      "."
    if (aestheticRequired) {
      errors.push(message)
      return { ok: false, errors, warnings }
    } else {
      warnings.push(message)
    }
  }
  if (directives.fonts) {
    if (directives.fonts.length > MAX_FONT_FAMILIES) {
      errors.push(
        `Too many font families in @fonts directive (${directives.fonts.length}). Max is ${MAX_FONT_FAMILIES}.`
      )
      return { ok: false, errors, warnings }
    }
    const bad = directives.fonts.filter((s) => !validateFontSpec(s))
    if (bad.length > 0) {
      errors.push(
        `Malformed @fonts directive. Expected pipe-separated Google Fonts specs like ` +
          `"Fraunces:wght@300..900 | Inter:wght@400;500;700". Bad: ${bad
            .map((s) => `"${s}"`)
            .join(", ")}.`
      )
      return { ok: false, errors, warnings }
    }
  }

  // 1. Must parse as JSX/ES2022 — strip directive lines first so Babel
  //    doesn't see top-level comments that vary each artifact.
  const contentForParse = stripDirectiveLines(content, directives)
  let ast
  try {
    ast = parseJs(contentForParse, {
      sourceType: "module",
      allowReturnOutsideFunction: true,
      plugins: ["jsx"],
    })
  } catch (err) {
    errors.push(
      `React component failed to parse as JSX: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return { ok: false, errors, warnings }
  }

  // 2. Scan top-level statements
  let hasDefaultExport = false
  let hasClassComponent = false
  const badImports: string[] = []

  for (const node of ast.program.body) {
    if (
      node.type === "ExportDefaultDeclaration" ||
      node.type === "ExportNamedDeclaration"
    ) {
      if (node.type === "ExportDefaultDeclaration") hasDefaultExport = true
    }

    if (node.type === "ImportDeclaration") {
      const source = node.source.value
      // Allow bare imports from the whitelist plus relative side-effect strips
      if (!REACT_IMPORT_WHITELIST.has(source) && !source.startsWith(".")) {
        badImports.push(source)
      }
    }

    // class Foo extends React.Component | extends Component
    if (node.type === "ClassDeclaration" && node.superClass) {
      const sc = node.superClass
      const isReactClass =
        (sc.type === "MemberExpression" &&
          sc.object.type === "Identifier" &&
          sc.object.name === "React") ||
        (sc.type === "Identifier" &&
          (sc.name === "Component" || sc.name === "PureComponent"))
      if (isReactClass) hasClassComponent = true
    }
  }

  // 3. String-level checks for things that aren't worth a full AST walk
  if (/document\.(getElementById|querySelector|querySelectorAll)\s*\(/.test(content)) {
    errors.push(
      "Found document.getElementById / document.querySelector — direct DOM access does not work reliably inside the sandboxed iframe. Use useRef instead."
    )
  }

  if (/import\s+['"][^'"]+\.css['"]/.test(content)) {
    errors.push(
      "Found a CSS import — CSS imports are silently dropped by the renderer. Remove it; Tailwind is already loaded."
    )
  }

  // Report results
  if (!hasDefaultExport) {
    errors.push(
      "Missing `export default` declaration. The component renderer requires a default export (function or const)."
    )
  }
  if (hasClassComponent) {
    errors.push(
      "Found `class extends React.Component` — class components are not supported. Use a function component."
    )
  }
  if (badImports.length > 0) {
    errors.push(
      `Imports from non-whitelisted libraries: ${badImports
        .map((s) => `"${s}"`)
        .join(", ")}. Only react, react-dom, recharts, lucide-react, and framer-motion are available (as window globals: React, Recharts, LucideReact, Motion). Remove the imports and use the globals instead.`
    )
  }

  // 4. Soft-warn heuristics — aesthetic/style mismatches that should be
  //    surfaced to the author but not block creation. Deliberately simple:
  //    precision over recall, fewer false positives > catching every nit.
  if (directives.aesthetic) {
    appendAestheticWarnings(content, directives.aesthetic, directives.fonts, warnings)
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// Python validation
// ---------------------------------------------------------------------------

/**
 * Packages that are NOT part of the Pyodide distribution and will crash on
 * import inside the python-renderer Web Worker.
 */
const PYTHON_UNAVAILABLE_PACKAGES: ReadonlyArray<{ pkg: string; reason: string }> = [
  { pkg: "requests", reason: "no HTTP client in the Pyodide Worker" },
  { pkg: "httpx", reason: "no HTTP client in the Pyodide Worker" },
  { pkg: "urllib3", reason: "not in Pyodide" },
  { pkg: "flask", reason: "no server runtime in Pyodide" },
  { pkg: "django", reason: "no server runtime in Pyodide" },
  { pkg: "fastapi", reason: "no server runtime in Pyodide" },
  { pkg: "sqlalchemy", reason: "not in Pyodide" },
  { pkg: "selenium", reason: "no browser automation in Pyodide" },
  { pkg: "tensorflow", reason: "not in Pyodide" },
  { pkg: "torch", reason: "not in Pyodide" },
  { pkg: "keras", reason: "not in Pyodide" },
  { pkg: "transformers", reason: "not in Pyodide" },
  { pkg: "cv2", reason: "opencv-python is not in Pyodide" },
  { pkg: "pyarrow", reason: "not in Pyodide" },
  { pkg: "polars", reason: "not in Pyodide" },
]

function validatePython(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = content.trim()

  if (!trimmed) {
    errors.push("Python content is empty.")
    return { ok: false, errors, warnings }
  }

  const firstLine = trimmed.split("\n")[0] ?? ""
  if (/^\s*```/.test(firstLine)) {
    errors.push(
      "Remove the markdown code fences (```python ... ```). The artifact content is the Python source itself — the renderer handles highlighting."
    )
    return { ok: false, errors, warnings }
  }

  const stripComment = (line: string): string => {
    const hashIdx = line.indexOf("#")
    return hashIdx === -1 ? line : line.slice(0, hashIdx)
  }

  const codeNoComments = content.split("\n").map(stripComment).join("\n")

  const unavailableHits = new Set<string>()
  for (const { pkg } of PYTHON_UNAVAILABLE_PACKAGES) {
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(
      `(^|\\n)\\s*(?:import\\s+${escaped}(?:\\s|$|,)|from\\s+${escaped}(?:\\.|\\s))`,
      "m"
    )
    if (re.test(codeNoComments)) unavailableHits.add(pkg)
  }
  if (unavailableHits.size > 0) {
    const details = [...unavailableHits]
      .map((pkg) => {
        const entry = PYTHON_UNAVAILABLE_PACKAGES.find((p) => p.pkg === pkg)
        return `"${pkg}" (${entry?.reason ?? "not in Pyodide"})`
      })
      .join(", ")
    errors.push(
      `Imports unavailable packages: ${details}. These will crash the script on import. Use numpy/matplotlib/pandas/scipy or hard-code mock data instead.`
    )
  }

  if (/(^|[^.\w])input\s*\(/m.test(codeNoComments)) {
    errors.push(
      "Found input() call — there is no stdin in the Pyodide Worker, input() will hang the script. Hard-code values or generate them instead."
    )
  }

  if (/\bopen\s*\([^)]*,\s*['"][wax]b?\+?['"]/m.test(codeNoComments)) {
    errors.push(
      "Found open() with a write mode — there is no persistent filesystem in the Pyodide Worker. Remove file writes; use print() or plt.show() for output."
    )
  }

  const hasPrint = /(^|[^.\w])print\s*\(/m.test(codeNoComments)
  const hasShow = /\bplt\.show\s*\(/m.test(codeNoComments)
  if (!hasPrint && !hasShow) {
    warnings.push(
      "Script has no print() or plt.show() — it may run successfully but produce no visible output in the panel."
    )
  }

  const sleepMatch = codeNoComments.match(/\btime\.sleep\s*\(\s*([\d.]+)\s*\)/)
  if (sleepMatch && Number.parseFloat(sleepMatch[1]) > 2) {
    warnings.push(
      `Found time.sleep(${sleepMatch[1]}) — sleeps longer than ~2 seconds feel stuck to the user. Trim or remove.`
    )
  }

  if (/\bwhile\s+True\s*:/.test(codeNoComments) && !/\bbreak\b/.test(codeNoComments)) {
    warnings.push(
      "Found `while True:` with no `break` in the script — potential infinite loop. The Worker has no enforced timeout; the user will have to click Stop."
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * Format validation errors as a single string suitable for returning from a
 * tool execute() so the LLM sees a structured failure and can self-correct.
 */
export function formatValidationError(
  type: string,
  result: ArtifactValidationResult
): string {
  const bullets = result.errors.map((e) => `  - ${e}`).join("\n")
  return `Your ${type} artifact has issues that will prevent it from rendering correctly:\n${bullets}\n\nFix these and call the tool again with the corrected content. Output the COMPLETE corrected artifact — do not truncate.`
}
