# Phase 5a — `application/slides` Quality Upgrade

Bring `application/slides` from a 3.0/10 stub instruction up to the depth of the other 9 upgraded artifact types. Phase 2 already shipped a `validateSlides` branch; this phase rewrites the prompt and tightens the validator's style guards to match.

---

## Renderer & runtime facts (verified against source)

### Schema (from `src/lib/slides/types.ts` + `slides-renderer.tsx`)

```ts
{
  theme: { primaryColor: string, secondaryColor: string, fontFamily: string },
  slides: SlideData[]
}

type SlideLayout =
  | "title" | "content" | "two-column" | "section"
  | "quote" | "image-text" | "closing"

interface SlideData {
  layout: SlideLayout
  title?: string
  subtitle?: string
  bullets?: string[]
  content?: string
  leftColumn?: string[]
  rightColumn?: string[]
  quote?: string
  attribution?: string
  note?: string
}
```

### Per-layout field usage (from `render-html.ts:26-100`)

| Layout | Fields actually rendered | Background |
|---|---|---|
| `title` | `title` (h1), `subtitle`, `note` (footer) | dark gradient |
| `section` | `title` (h1), `subtitle` | dark gradient |
| `closing` | `title` (h1), `subtitle` ?? `content` | dark gradient |
| `content` | `title` (h2 with accent bar), `bullets` (ul), `content` (p) | white |
| `image-text` | identical to `content` (no image support) | white |
| `two-column` | `title`, `leftColumn` (ul), `rightColumn` (ul), divider | white |
| `quote` | `quote` (blockquote), `attribution` (cite) | white |

**Key surprise:** `image-text` is **rendered identically to `content`** in both `render-html.ts:58` and `generate-pptx.ts:488`. There is no image rendering anywhere — it's a dead alias. Phase 5a documents it as deprecated and the validator now warns when it appears.

### Theme application

- `primaryColor` is the `body` background of dark slides AND the gradient base. The renderer auto-derives `darkenHex(primaryColor, 0.3)` for the gradient bottom (`render-html.ts:127`).
- `secondaryColor` is the accent line, the title-accent-bar, AND the PPTX bullet colour (`generate-pptx.ts:73,191`).
- `fontFamily` is consumed both in the iframe (`@import url(...Inter...)`) and in the PPTX exporter via `ff(theme)` (`generate-pptx.ts:49`).
- Bright primary colours produce washed-out title slides because the renderer overlays `#F8FAFC` text on top of them.

### Notes are visible

`note` fields render as `footer-text` in title slides AND as small italic footer text in content/two-column slides. They are also exported to PPTX (`generate-pptx.ts:133-144,217-228`). They are **not** speaker-only — guidance updated accordingly.

### Legacy markdown

`parseLegacyMarkdown` exists at `src/lib/slides/parse-legacy.ts` for backwards compatibility with old saved decks. The `validateSlides` branch already added in Phase 2 rejects non-JSON input, so the legacy path is dead for new artifacts. The instruction does not mention it — keeping the LLM on the JSON path only.

---

## Changes shipped

### `src/lib/prompts/artifacts/slides.ts` — full rewrite

Structure:

1. **Output Format — JSON ONLY** with the canonical shape skeleton
2. **Theme** table with required fields, approved primary/secondary palettes, NEVER list
3. **Layouts — Six Valid Values** — per-layout field tables. Lists six layouts only; `image-text` documented as the dead seventh that should not be used.
4. **Deck Structure Rules** — 7-12 slides, first=title, last=closing, ≥3 distinct layouts, narrative arc, section dividers for long decks
5. **Content Rules** — plain text only, ≤10 words/bullet, ≤6 bullets/slide, realistic copy, numbers anchor claims, note field is visible
6. **Tone — match the user's request** — pitch / educational / technical / status (vocabulary inspired by Presenton's `tone` API)
7. **Anti-Patterns** — 14 explicit ❌ items

**Examples:** two complete decks
- **Pitch deck (PayFlow)** — 8 slides, mixed layouts (title, content, two-column, quote, closing), dark navy + cyan
- **Technical overview (microservice migration)** — 9 slides, includes section dividers, dark slate + emerald

Both examples were verified to JSON.parse successfully and pass `validateArtifactContent("application/slides", ...)` with **zero errors and zero warnings**.

### `src/lib/tools/builtin/_validate-artifact.ts` — tighten style guards

New constants:
- `MAX_BULLET_WORDS = 10`
- `MIN_DECK_SLIDES = 7`
- `MAX_DECK_SLIDES = 12`

New warnings (no new errors — these are style nags, not silent-fail risks):

- Bullet > 10 words — "use `content` instead"
- `image-text` layout used — "renders identically to content, use content instead"
- Closing slide missing title — "should carry the CTA or final takeaway"
- Deck shorter than 7 slides
- Deck longer than 12 slides
- Deck of ≥5 slides using fewer than 3 distinct layouts

### Tests

6 new vitest cases in `tests/unit/validate-artifact.test.ts`:
- bullet word-count warning
- image-text layout warning
- short-deck warning
- long-deck warning
- low-diversity warning
- closing-slide-missing-title warning

All 135 cases pass.

---

## Validator ↔ instruction alignment

| Instruction rule | Validator | Notes |
|---|---|---|
| Top-level JSON only | error | aligned |
| `slides` non-empty array | error | aligned |
| Layout enum | error | aligned (still accepts `image-text` for backwards compat, but warns) |
| First slide title | warning | aligned |
| Last slide closing | warning | aligned |
| Title slide needs `title` (req) + `subtitle` (rec) | error / warning | aligned |
| Content slide needs `bullets` OR `content` | error | aligned |
| Two-column needs both columns | error | aligned |
| Quote needs `quote` | error | aligned |
| ≤ 6 bullets | warning | aligned |
| ≤ 10 words / bullet | warning | **new** |
| 7–12 slides | warning | **new** |
| ≥ 3 distinct layouts | warning (decks ≥ 5) | **new** |
| `image-text` deprecated | warning | **new** |
| Closing slide title | warning | **new** |
| No markdown syntax | warning | aligned |

**Intentional gaps** (not validated):
- `theme` object presence + shape — the validator skips theme validation entirely. The renderer falls back to `DEFAULT_THEME` if missing, so this is not a breakage. Adding it later is cheap.
- Approved palette enforcement — colour choice is style guidance, not safety.
- Tone matching — un-checkable.

---

## Token budget

`rules` string is ≈ 2,150 tokens (target was ≤ 2,200), inline with `html.ts` (~2,000) and `mermaid.ts` (~2,300).

---

## Top 3 improvements vs prior stub

1. **Per-layout field reference** — the LLM now knows exactly which fields each of the six valid layouts uses, plus which are required vs optional. The old stub crammed every field into a single sentence with no per-layout context.
2. **Concrete examples** — two full pitch decks demonstrate mixed layouts, section dividers, narrative flow, realistic numbers, and the plain-text content rule. Previous version had `examples: []`.
3. **`image-text` deprecation** — the renderer treats it as a content alias with no image support; the prompt and validator now both steer the LLM away from it explicitly instead of letting it ship broken expectations.

## Surprises uncovered during investigation

- **`image-text` is dead code** — listed in the schema but rendered identically to `content`. Should be removed in a future cleanup.
- **`note` field renders publicly**, not in speaker-notes. The old stub was silent about this; LLMs were occasionally writing stage directions in `note`.
- **Theme shape is not validated** — a deck with no `theme` key works because the renderer falls back to `DEFAULT_THEME`. Worth tightening if we ever want guaranteed brand consistency.
- **`closing` slide reads `subtitle ?? content`** — the renderer prefers `subtitle`. The old stub didn't say this.
