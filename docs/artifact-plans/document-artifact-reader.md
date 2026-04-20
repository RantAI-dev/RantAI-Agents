# Document Artifact (Reader) — Implementation Plan

## Status

**C1-C4 merged** as a foundational slice: type rename (`text/markdown` → `application/document`) + data migration + unsplash resolution for document content + frontmatter parser + template registry with 4 generic templates + validation layer.

**C5-C8 pending** in a follow-up PR:
- C5 — dual-mode renderer (FlowingLayout + PagedLayout + ValidationBanner dispatcher)
- C6 — per-template chrome (LetterHeader / ReportCover / MemoHeader)
- C7 — download dropdown migration for `application/document`
- C8 — prompt rules update (frontmatter + template guide + examples)

After merge, C3+C4 are temporarily unused (parser + registry + validator have no in-tree caller). C5 activates them. The dead-code window is intentional and was discussed before the merge: each commit stays atomic and buildable, and the infrastructure-before-consumer split keeps reviews focused.

---

**Scope:** PR 1 of 2 for the Document artifact feature. Introduces `application/document` as a first-class artifact type, replacing `text/markdown`, with a template system (plain/letter/report/memo), dual-mode renderer (flowing + paged), and `.md` source download. Export to `.docx`/`.pdf` is **out of scope** — that's PR 2 (file: `document-artifact-export.md`).

**Non-goals for this PR:**
- `.docx` export pipeline (PR 2)
- `.pdf` export pipeline (PR 2)
- Branding-specific templates like NQRust-letter, RantAI-report (Fase 5, future PR — generic templates here are starting point)
- Advanced TOC generation (PagedLayout will render a placeholder; real TOC wiring happens in PR 2 export)

**Project state:** local dev, no production users. Prisma migrations free to run. Commit convention: Conventional Commits with scope, single-line bullets in message body. Package manager `bun`. Commit via `git commit-sulthan` (identity wrapper).

---

## Locked architectural decisions (not up for discussion here)

From the spec — these are treated as fixed:

1. **Hard rename**: `text/markdown` → `application/document`. DB migration rewrites all existing rows. No dual-support window.
2. **Frontmatter auto-wrap**: documents without a `---` block implicitly use template `plain`.
3. **YAML frontmatter** via `gray-matter`. Delimiter `---`.
4. **4 generic templates** (plain, letter, report, memo). Branding-specific variants deferred to Fase 5.
5. **PagedLayout** in Google Docs Pages mode style (A4 width fixed, subtle shadow, scroll with gap).
6. **UI label stays "Document"**. Icon `FileText`. Canvas badge still `Canvas: Document`.

---

## Answers to the open questions (from spec § "Yang perlu kamu pikirkan")

### Q1 — Template registry location → `src/lib/documents/templates/`

Template is a **user-facing variant** within one type, not a discriminator. Precedent: slides layouts (`SlideLayout` union in `src/lib/slides/types.ts`) live in a dedicated `lib/slides/` module, NOT nested inside `lib/prompts/artifacts/`. Prompt-layer sub-files (`lib/prompts/artifacts/<type>.ts`) stay focused on the LLM-facing definition. Templates are code/config.

```
src/lib/documents/
├── templates/
│   ├── plain.ts
│   ├── letter.ts
│   ├── report.ts
│   ├── memo.ts
│   └── index.ts        # aggregator + union type
├── frontmatter.ts      # gray-matter wrapper + auto-wrap fallback
├── validate.ts         # per-template Zod validation (thin wrapper)
└── types.ts            # shared types (DocumentTemplate, FrontmatterResult)
```

### Q2 — Schema shape → TS object literal `as const` + co-located Zod

Matches codebase convention (`lib/prompts/artifacts/*.ts`, `lib/tools/builtin/index.ts`). Each template file exports one object with:

```ts
// Sketch — final shape locked in Commit 3
export const letterTemplate = {
  name: "letter" as const,
  label: "Formal Letter",
  layoutMode: "paged" as const,
  schema: z.object({          // frontmatter validator, co-located
    template: z.literal("letter"),
    company_name: z.string(),
    company_logo: z.string().optional(),
    company_address: z.string(),
    recipient_name: z.string(),
    recipient_organization: z.string().optional(),
    recipient_address: z.string().optional(),
    date: z.string(),
    subject: z.string(),
    reference_number: z.string().optional(),
    signatory_name: z.string(),
    signatory_position: z.string(),
  }),
  render: {                    // renderer metadata
    marginMm: { top: 25, right: 20, bottom: 25, left: 25 },
    fontFamilySuggestion: "Inter, system-ui, sans-serif",
    hasCover: false,
    hasPageNumbers: false,
  },
  promptHints: {               // LLM guidance
    whenToUse: "Formal external correspondence with a recipient organization. One-to-one letters, not announcements.",
    requiredFieldsDoc: "company_name, company_address, recipient_name, date, subject, signatory_name, signatory_position",
  },
  chrome: "LetterHeader" as const,  // resolves to a component in document-chrome/
}
```

Union type derived from aggregator: `type DocumentTemplateName = typeof ALL_TEMPLATES[number]["name"]`. Matches how `ArtifactType` is derived.

Validation strategy (answered by codebase audit): **permissive** — parse + return `{ ok, errors[], data }`. Missing required → error surfaced as banner in renderer + tool-call result passed back to LLM for self-correction. Missing optional → filled with sensible default, render continues. Mirrors `_validate-artifact.ts` pattern.

### Q3 — Download UI → DropdownMenu (not new single button)

Current state (`artifact-panel.tsx:450-460`): single `<Button>` with tooltip "Download". PR 2 will add 2+ more formats (.docx, .pdf). Migrating to a dropdown in PR 1 avoids UI churn in PR 2. DropdownMenu primitive is already imported and used in the panel (for the "More" menu, line ~465-480) — zero new dependencies.

New shape (Commit 7):
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button><Download /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    {/* Single item in PR 1; PR 2 adds .docx + .pdf */}
    <DropdownMenuItem onClick={handleDownloadMdSource}>.md source</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

For artifact types that still want single-click download (slides, etc.), the dropdown degrades to a single item — same UX cost as a button (one click to trigger download, but with a label showing the format). To minimize UX regression for non-document types, keep single-button behavior for them and only switch to dropdown for `application/document`.

### Q4 — Renderer dispatch → two components + dispatcher

```
src/features/conversations/components/chat/artifacts/renderers/
├── document-renderer.tsx              # entry, dispatches by template.layoutMode
├── document-flowing-layout.tsx        # scroll-continuous wrapper around StreamdownContent
├── document-paged-layout.tsx          # CSS A4 pages + scroll-snap
└── document-chrome/                   # per-template header/cover components
    ├── letter-header.tsx
    ├── report-cover.tsx
    └── memo-header.tsx
```

Two components more testable than conditional-in-one; each layout has distinct CSS + DOM structure, forcing the same component to handle both would bloat it. Chrome components are thin and compose inside PagedLayout.

### Q5 — PagedLayout approach → CSS-only (no new dep)

Audit confirmed zero pre-existing paged-layout libraries in `package.json`. Approach:

```tsx
// document-paged-layout.tsx (sketch)
<div className="flex flex-col items-center gap-4 py-6 bg-slate-50 dark:bg-slate-900 min-h-full">
  {pages.map((pageContent, i) => (
    <div
      key={i}
      className="w-[210mm] min-h-[297mm] bg-white shadow-md rounded-sm p-[25mm] prose prose-slate max-w-none"
    >
      {pageContent}
    </div>
  ))}
</div>
```

Page boundaries are **content-addressed for PR 1**: we don't actually split content into pages algorithmically. The first page renders template chrome (letter header / report cover / memo header) + body, the body flows naturally inside one or more page-sized divs using `column-count`-style pagination via CSS `break-inside: avoid` hints. For PR 1 MVP, we render a **single A4-sized page** with `min-height: 297mm` that grows if body exceeds — the visual paging is suggestive, not pixel-accurate. Pixel-accurate pagination is a PR 2 concern (needed for PDF export).

This is an explicit simplification. The plan notes it as such. User gets the Google-Docs-Pages visual aesthetic without the complexity of real pagination.

### Q6 — MermaidRender cache integration → transparent benefit, no wiring

Confirmed: `StreamdownContent` handles inline mermaid via its own client-side mermaid renderer (`controls={{ mermaid: true }}`). That render path is **independent** of the foundation-PR's `MermaidRender` cache, which only serves `renderMermaidToPng` callers (PPTX export today, PDF export in PR 2).

For PR 1 reader, we use `StreamdownContent` directly — zero integration with the DB cache. Cache benefit only shows up in PR 2 when we re-rasterize for export.

### Q7 — Backward compat grep → 16 files need rename

Full list (from audit, split by category):

**Artifact-discriminator references (RENAME all):**
- `src/lib/prompts/artifacts/markdown.ts` (entire file, rename to `document.ts`)
- `src/lib/tools/builtin/create-artifact.ts` (Zod enum, description)
- `src/lib/tools/builtin/_validate-artifact.ts` (type guard + error message)
- `src/features/conversations/components/chat/artifacts/constants.ts` (TYPE_ICONS, TYPE_COLORS keys)
- `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` (switch case)
- `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` (getExtension, getCodeLanguage)
- `src/features/knowledge/components/file-type-utils.ts` (ARTIFACT_TYPE_MAP, ARTIFACT_EXTENSION_MAP keys)
- `src/lib/s3/index.ts` (getArtifactExtension map)
- `src/features/conversations/components/chat/chat-workspace.tsx` (EXT_MAP, attachment type check)
- Cross-references in `src/lib/prompts/artifacts/latex.ts`, `sheet.ts` (guidance text)
- `tests/unit/validate-artifact.test.ts` (8 test cases)

**File-MIME `text/markdown` references (KEEP):** file uploads, Blob download types, mime-types lib, knowledge doc viewer default. These refer to actual Markdown file format, not artifact discriminator.

### Q8 — Prompt rules update → rename + substantive content update

`src/lib/prompts/artifacts/markdown.ts` → `src/lib/prompts/artifacts/document.ts`. Beyond `type` field rename, rules content updated to:
- Describe frontmatter syntax (YAML delimited by `---`)
- Document the 4 template names + when to pick each
- New examples that include frontmatter for letter/report/memo templates
- Preserve existing guidance for flowing markdown content (table/math/mermaid/code tagging)

Done as **last commit** (Commit 8) so the rules can reference actual template names that exist in `src/lib/documents/templates/`.

---

## Commit breakdown (8 commits)

One more than the sketch because **Commit 2 (unsplash resolution) is its own atomic change** — rename (Commit 1) is mechanical, while adding unsplash support for document content requires writing a markdown-regex extract/rewrite pair using `resolveContentImages` from the foundation PR. Folding it into Commit 1 would conflate concerns.

### Commit 1 — Hard rename `text/markdown` → `application/document`

**Why atomic:** purely mechanical identifier swap + DB migration. No behavior change in what gets rendered or how.

**Files:**
- `src/lib/prompts/artifacts/markdown.ts` → rename to `src/lib/prompts/artifacts/document.ts`; update `type: "application/document" as const`, `rules` heading `**application/document — Documents**` (substantive content update deferred to Commit 8)
- `src/lib/prompts/artifacts/index.ts` → import `documentArtifact` instead of `markdownArtifact` (variable rename)
- `src/lib/tools/builtin/create-artifact.ts` → update Zod enum + description mention
- `src/lib/tools/builtin/update-artifact.ts` → same if applicable
- `src/lib/tools/builtin/_validate-artifact.ts` → rename branch + error message
- `src/features/conversations/components/chat/artifacts/constants.ts` → rename TYPE_ICONS + TYPE_COLORS keys
- `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` → switch case
- `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` → `getExtension`, `getCodeLanguage` switch cases
- `src/features/knowledge/components/file-type-utils.ts` → ARTIFACT_TYPE_MAP, ARTIFACT_EXTENSION_MAP keys
- `src/lib/s3/index.ts` → getArtifactExtension map
- `src/features/conversations/components/chat/chat-workspace.tsx` → EXT_MAP, attachment type check
- `src/lib/prompts/artifacts/latex.ts`, `sheet.ts` → cross-reference text updates
- `tests/unit/validate-artifact.test.ts` → rename 8 test cases
- `prisma/schema.prisma` → no schema change (field stays `artifactType String?`)
- **Migration**: because `artifactType` is just a `String?` with no constraint, we need a **data migration** (not schema). Plan:
  - Generate empty migration via `bun prisma migrate dev --create-only --name rename_markdown_to_document` (or hand-create the migration directory if `migrate dev --create-only` is also blocked by the shadow DB issue)
  - Fill `migration.sql` with the idempotent UPDATE:
    ```sql
    -- Rename artifact discriminator: text/markdown -> application/document.
    -- Idempotent: re-running this migration is safe (no rows match the WHERE
    -- clause after the first successful run).
    UPDATE "Document" SET "artifactType" = 'application/document'
    WHERE "artifactType" = 'text/markdown';
    ```
  - Apply against dev DB via `bun prisma db execute --file prisma/migrations/<ts>_rename_markdown_to_document/migration.sql --schema prisma/schema.prisma`
  - Or fall back to `bun prisma db push` if the migration-file workflow also trips on the shadow DB (same fallback we used in the foundation PR per CLAUDE.md memory)

**Test gates:**
- `bun run typecheck` → 0 errors in changed files
- `bun run test tests/unit/validate-artifact.test.ts` → all pass with renamed cases
- Manual: open an existing markdown artifact in the UI → confirm header still shows "Document", renders via existing pipeline (no visual regression before further commits land)

**Commit message** (single-line bullets):
```
refactor(artifacts): rename text/markdown -> application/document

- rename discriminator across prompt sub-file, tools, renderers, panel, S3 extension map, knowledge file-type utils, chat-workspace ext map, validate-artifact test cases, and prompt cross-references (16 files)
- rename src/lib/prompts/artifacts/markdown.ts -> document.ts; export documentArtifact from index.ts
- data migration: UPDATE Document SET artifactType = 'application/document' WHERE artifactType = 'text/markdown' (applied via prisma db execute since legacy shadow DB blocks migrate dev)
- keep file-MIME text/markdown strings unchanged (Blob types, upload MIME accept, knowledge doc default) — those refer to .md file format, not artifact discriminator
- rules content in document.ts retained verbatim; frontmatter + template guidance added in a later commit once the template registry exists
```

### Commit 2 — Unsplash `unsplash:` resolution for document content

**Why atomic:** document content uses markdown `![alt](unsplash:keyword)` syntax, not HTML `src="..."`. Needs its own extract/rewrite pair plugged into `resolveContentImages` from the foundation PR.

**Files:**
- `src/lib/unsplash/resolver.ts` → add `resolveDocumentImages(content: string): Promise<string>` that uses `resolveContentImages({ content, extract, rewrite })` with markdown-image regex `/!\[([^\]]*)\]\(unsplash:([^)]+)\)/g`
- `src/lib/unsplash/index.ts` → export `resolveDocumentImages` (safe-wrapper pattern matching existing `resolveImages` / `resolveSlideImages`)
- `src/lib/tools/builtin/create-artifact.ts` → add branch `} else if (type === "application/document") { finalContent = await resolveDocumentImages(content) }` alongside existing html/slides branches
- `src/lib/tools/builtin/update-artifact.ts` → same branch addition
- **Unit test**: `src/lib/unsplash/resolver.test.ts` (new) — vitest cases covering: `unsplash:coffee` in `![alt](...)` gets rewritten to real URL (mock `resolveUnsplashQueries`), plain markdown with no `unsplash:` returns unchanged, mixed content

**Test gates:**
- New vitest file passes
- `bun run typecheck` → 0 errors

**Commit message:**
```
feat(artifacts): resolve unsplash: URLs in document content at save time

- add resolveDocumentImages(content) in lib/unsplash that plugs a markdown-image regex into the generic resolveContentImages walker from the foundation PR
- wire the resolver into create-artifact.ts and update-artifact.ts branches alongside existing html + slides paths
- export safe wrapper from lib/unsplash index (never throws, falls back to original content on any error)
- unit test covering markdown ![alt](unsplash:X) rewrite, empty-content passthrough, and mixed markdown+unsplash input
```

### Commit 3 — Frontmatter parser + auto-wrap fallback

**Why atomic:** pure library wiring — add `gray-matter` dep, build one function, test it. No other code depends on it yet.

**Files:**
- `package.json` → add `gray-matter` dep (`bun add gray-matter`)
- Create `src/lib/documents/types.ts` — shared types
  ```ts
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
     */
    parseError?: string
  }
  ```
- Create `src/lib/documents/frontmatter.ts`:
  ```ts
  import matter from "gray-matter"
  import type { FrontmatterResult } from "./types"

  /**
   * Parse a document's content into (template, metadata, body).
   * Content without a `---` block is auto-wrapped as `plain` — the reader
   * gets default metadata and the raw content as `body`.
   */
  export function parseDocumentFrontmatter(content: string): FrontmatterResult {
    // gray-matter tolerates absent frontmatter — returns empty data
    const parsed = matter(content)
    const hasBlock = /^---\s*\n/.test(content)
    const template =
      typeof parsed.data.template === "string" && parsed.data.template.trim().length > 0
        ? parsed.data.template.trim()
        : "plain"
    return {
      template,
      metadata: parsed.data,
      body: parsed.content,
      implicit: !hasBlock,
    }
  }
  ```
- Create `src/lib/documents/frontmatter.test.ts` (vitest):
  - No frontmatter → `{ template: "plain", metadata: {}, body: <whole content>, implicit: true }`
  - Empty frontmatter block → `{ template: "plain", ..., implicit: false }`
  - Explicit `template: letter` with body → correct split
  - Malformed YAML → parser falls back (gray-matter throws; wrapper catches and returns `{ template: "plain", metadata: {}, body: content, implicit: true, parseError?: string }`) — OR let it throw and renderer displays an error banner; decision below
  - Frontmatter with nested YAML (arrays, objects)

**Confirmed by user:** surface parse errors via banner (user-friendly messages, e.g. `Line 3: expected string for "recipient_name"` — NOT raw YAML exception text). `parseError` field on `FrontmatterResult` carries the formatted message; renderer's `ValidationBanner` (Commit 5) displays it.

**Out of scope in this commit:** the "View source → scroll to code tab" button is skipped; would require cross-component coordination between panel tabs.

**Test gates:**
- `bun run test src/lib/documents/frontmatter.test.ts` → all pass
- Typecheck clean

**Commit message:**
```
feat(documents): add frontmatter parser with auto-wrap

- add gray-matter dep for YAML frontmatter parsing
- new src/lib/documents/frontmatter.ts with parseDocumentFrontmatter(content) returning { template, metadata, body, implicit }
- auto-wrap: content without a leading --- block returns template="plain" with empty metadata, preserving the whole content as body (zero-migration fallback for pre-PR markdown artifacts)
- malformed YAML surfaces as a parseError field so the renderer can show a banner instead of silently rendering raw content (preferred over silent fallback so typos are visible)
- unit test covers no-block, empty-block, explicit letter template, malformed YAML, and nested YAML shapes
```

### Commit 4 — Template registry (4 generic templates + Zod schemas)

**Why atomic:** pure data + co-located validation. Adding renderers in later commits consumes this registry without modifying it.

**Files:**
- Create `src/lib/documents/templates/plain.ts`, `letter.ts`, `report.ts`, `memo.ts` — each exports a `<Name>Template` object matching the shape in Q2 answer above
- Create `src/lib/documents/templates/index.ts`:
  ```ts
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

  export type DocumentTemplateName = (typeof ALL_DOCUMENT_TEMPLATES)[number]["name"]
  export type DocumentTemplate = (typeof ALL_DOCUMENT_TEMPLATES)[number]

  const TEMPLATE_MAP = new Map<string, DocumentTemplate>(
    ALL_DOCUMENT_TEMPLATES.map((t) => [t.name, t as DocumentTemplate]),
  )

  /** Look up a template by name; returns plain as a safe fallback. */
  export function getDocumentTemplate(name: string): DocumentTemplate {
    return TEMPLATE_MAP.get(name) ?? plainTemplate
  }

  export { plainTemplate, letterTemplate, reportTemplate, memoTemplate }
  ```
- Create `src/lib/documents/validate.ts`:
  ```ts
  import { getDocumentTemplate, type DocumentTemplate } from "./templates"

  export interface FrontmatterValidationResult {
    ok: boolean
    /** Parsed & coerced metadata (for the caller to render). */
    data: Record<string, unknown>
    /** Human-readable error strings (one per missing/invalid required field). */
    errors: string[]
    /** Same, but less critical (optional fields with warnings). */
    warnings: string[]
    template: DocumentTemplate
  }

  export function validateDocumentFrontmatter(
    templateName: string,
    metadata: Record<string, unknown>,
  ): FrontmatterValidationResult {
    const template = getDocumentTemplate(templateName)
    const parsed = template.schema.safeParse(metadata)
    if (parsed.success) {
      return { ok: true, data: parsed.data, errors: [], warnings: [], template }
    }
    const errors = parsed.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    )
    return { ok: false, data: metadata, errors, warnings: [], template }
  }
  ```
- Create `src/lib/documents/validate.test.ts` — vitest covering: all 4 templates accept valid minimal fixture, each template rejects with specific missing-required error, unknown template falls back to plain

**Template field specs** (for the TS/Zod object bodies — matches spec § "TEMPLATE SCHEMA"):

| Template | layoutMode | Required fields | Optional fields | `hasCover` | `chrome` |
|---|---|---|---|---|---|
| plain | flowing | — | — | false | none |
| letter | paged | company_name, company_address, recipient_name, date, subject, signatory_name, signatory_position | company_logo, recipient_organization, recipient_address, reference_number | false | LetterHeader |
| report | paged | title, author, date | subtitle, organization, organization_logo, version, confidentiality | **true** | ReportCover |
| memo | paged | from, to, date, subject | cc, priority | false | MemoHeader |

**Test gates:** `bun run test src/lib/documents/` → all pass. Typecheck clean.

**Commit message:**
```
feat(documents): add template registry with 4 generic templates

- new src/lib/documents/templates/{plain,letter,report,memo}.ts — each exports a typed object with name, label, layoutMode, schema (Zod), render metadata (margin/font/cover flags), and prompt hints
- aggregate via ALL_DOCUMENT_TEMPLATES + derived DocumentTemplateName union; getDocumentTemplate(name) falls back to plain for unknown names
- new src/lib/documents/validate.ts — validateDocumentFrontmatter(name, metadata) returns { ok, data, errors, warnings, template } — permissive strategy (errors surface as renderer banners, not thrown)
- unit test: valid fixture per template, missing-required-field rejection per template, unknown template falls back to plain
- templates are generic (no RantAI/NQRust branding); branding-specific wrappers deferred to a future phase
```

### Commit 5 — Dual-mode renderer scaffolding (Flowing + Paged + dispatcher)

**Why atomic:** new renderer entry point + wiring into `artifact-renderer.tsx`. Chrome components still stubbed out (Commit 6 adds them).

**Pre-work gates (blockers — stop and discuss if either fails):**

1. **Verify current wrapping for `text/markdown`** in `artifact-renderer.tsx:121` (the case renaming happens in Commit 1). Inspect the exact JSX: is the body wrapped in `<div className="p-4">`? Different padding? Prose classes? Whatever the CURRENT wrapping is, `DocumentFlowingLayout` must reproduce it byte-for-byte — zero visual regression for plain-template documents. Document the observed wrapping in the Commit 5 message so reviewers can verify.

2. **Verify `StreamdownContent` feature coverage** against document requirements. Read `src/features/conversations/components/chat/streamdown-content.tsx` top-to-bottom and confirm it handles: (a) GFM tables, (b) code blocks with Shiki, (c) KaTeX math (`$...$`, `$$...$$`), (d) mermaid fenced blocks rendered as live diagrams, (e) task lists, (f) GFM strikethrough. If any of these is missing, **stop and escalate** — the plan assumes feature parity with the old markdown renderer. Don't silently skip.

**Files:**
- Create `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`:
  ```tsx
  "use client"
  import { parseDocumentFrontmatter } from "@/lib/documents/frontmatter"
  import { validateDocumentFrontmatter } from "@/lib/documents/validate"
  import { DocumentFlowingLayout } from "./document-flowing-layout"
  import { DocumentPagedLayout } from "./document-paged-layout"

  export function DocumentRenderer({ content }: { content: string }) {
    const parsed = parseDocumentFrontmatter(content)
    const validation = validateDocumentFrontmatter(parsed.template, parsed.metadata)

    if (validation.template.layoutMode === "flowing") {
      return <DocumentFlowingLayout body={parsed.body} validation={validation} />
    }
    return (
      <DocumentPagedLayout
        body={parsed.body}
        validation={validation}
      />
    )
  }
  ```
- Create `src/features/conversations/components/chat/artifacts/renderers/document-flowing-layout.tsx`:
  ```tsx
  "use client"
  import { StreamdownContent } from "../../streamdown-content"
  import { ValidationBanner } from "./document-validation-banner"
  import type { FrontmatterValidationResult } from "@/lib/documents/validate"

  export function DocumentFlowingLayout({
    body,
    validation,
  }: {
    body: string
    validation: FrontmatterValidationResult
  }) {
    // Wrapping MUST match what the old text/markdown case in
    // artifact-renderer.tsx used, verified in the pre-work gate above.
    // The className below is a PLACEHOLDER — replace it with the observed
    // current wrapping (could be `p-4`, could be nothing, could be prose
    // classes). Document the choice in the commit message.
    return (
      <div className="p-4">
        {validation.errors.length > 0 && <ValidationBanner errors={validation.errors} />}
        <StreamdownContent content={body} />
      </div>
    )
  }
  ```
- Create `src/features/conversations/components/chat/artifacts/renderers/document-paged-layout.tsx`:
  ```tsx
  "use client"
  import { StreamdownContent } from "../../streamdown-content"
  import { ValidationBanner } from "./document-validation-banner"
  import type { FrontmatterValidationResult } from "@/lib/documents/validate"

  // TODO(mobile): A4 width (210mm) exceeds typical mobile viewport width.
  // Today the page overflows-scrolls horizontally — known gap for enterprise
  // users reviewing via tablet/phone in meetings. Follow-up: fit-to-width
  // scaling (CSS transform scale) on narrow viewports, or a "read as flowing"
  // mobile fallback. Tracked in the PR description's Follow-ups section.
  export function DocumentPagedLayout({
    body,
    validation,
  }: {
    body: string
    validation: FrontmatterValidationResult
  }) {
    const { template } = validation
    const m = template.render.marginMm
    return (
      <div className="flex flex-col items-center gap-4 py-6 bg-slate-50 dark:bg-slate-900 min-h-full overflow-auto">
        {validation.errors.length > 0 && <ValidationBanner errors={validation.errors} />}
        <article
          className="w-[210mm] min-h-[297mm] bg-white dark:bg-slate-800 shadow-md rounded-sm prose prose-slate dark:prose-invert max-w-none"
          style={{
            padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`,
          }}
        >
          {/* Chrome placeholder — Commit 6 fills this */}
          <StreamdownContent content={body} />
        </article>
      </div>
    )
  }
  ```
- Create `src/features/conversations/components/chat/artifacts/renderers/document-validation-banner.tsx` — small component with yellow/red warning styling, list of errors
- Modify `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx` — replace `case "application/document"` branch (formerly `text/markdown`) to use `<DocumentRenderer>` instead of direct `<StreamdownContent>`

**Test gates:**
- `bun run typecheck` → 0 errors in renderer dir
- Manual: open a plain markdown artifact → flowing layout, body renders via StreamdownContent, no regression
- Manual: create a new artifact with `---\ntemplate: letter\n...\n---\nbody` frontmatter → paged layout renders with A4 shadow, body shown (chrome still blank — Commit 6 adds)

**Commit message:**
```
feat(documents): dual-mode renderer (flowing + paged) scaffolding

- new DocumentRenderer entry point at features/.../renderers/document-renderer.tsx — parses frontmatter, validates, dispatches to DocumentFlowingLayout or DocumentPagedLayout based on template.layoutMode
- DocumentFlowingLayout: scroll-continuous wrapper around existing StreamdownContent (plain template default)
- DocumentPagedLayout: CSS-only A4 page (210mm wide, 297mm min-height, box-shadow, rounded corners) with template-driven margins — pixel-accurate pagination deferred to PR 2 (export)
- DocumentValidationBanner shown above the rendered body when frontmatter validation fails (permissive strategy: render continues with partial data, user sees what's missing)
- artifact-renderer.tsx dispatches the application/document case to DocumentRenderer instead of directly to StreamdownContent
- chrome components (letter header, report cover, memo header) stubbed — filled in next commit
```

### Commit 6 — Per-template chrome components + integration

**Why atomic:** three new small components, all rendering at the top of the paged layout. Pure composition — no renderer dispatch changes.

**Files:**
- Create `src/features/conversations/components/chat/artifacts/renderers/document-chrome/letter-header.tsx`:
  - Right-aligned company block (optional logo via `<img src={company_logo}>` — already real URL thanks to Commit 2), company name bold, address small
  - Left block: reference_number (optional), date
  - "Kepada Yth." block: recipient_name bold, recipient_organization, recipient_address
  - Subject bold, single line above body
- Create `document-chrome/report-cover.tsx`:
  - Full-page cover — title huge centered, subtitle below, author/organization + date/version at bottom
  - Optional organization_logo top
  - Confidentiality stamp (top-right, red border) when field is set
  - Followed by an explicit page break (new `<article>` for body inside PagedLayout)
  - TOC placeholder rendered immediately after cover, before body:
    ```tsx
    <nav className="text-sm text-slate-500 italic">
      <h2 className="not-italic font-semibold text-slate-700">Table of Contents</h2>
      <p>(will be auto-generated when exporting to .docx or .pdf)</p>
    </nav>
    ```
    Explicit about when it fills so users aren't confused by an empty-looking TOC in the reader view.
- Create `document-chrome/memo-header.tsx`:
  - Table-style header: From | Body, To | Body, Date | Body, Subject | Body (and cc / priority if present)
  - Horizontal rule below
- Modify `document-paged-layout.tsx`:
  - Before rendering body, look up `template.chrome` and render the matching component with `metadata` as props
  - For `report` template with `hasCover: true`, render the cover as its own full-page `<article>` then start a new `<article>` for body

**Test gates:**
- Typecheck clean
- Manual smoke: create one artifact per template (letter, report, memo) with sample frontmatter → confirm correct chrome renders above body
- Confirm `company_logo: unsplash:office` in letter frontmatter renders as real Unsplash URL (server resolver from Commit 2 kicked in at save)

**Commit message:**
```
feat(documents): per-template chrome (letter header, report cover, memo header)

- LetterHeader renders right-aligned company block (logo + name + address), left-aligned ref/date, "Kepada Yth." recipient block, and subject line
- ReportCover renders a full-page cover (title + subtitle + author + date + version + confidentiality stamp) with optional organization logo; body flows in a subsequent page article
- MemoHeader renders an email-style header table (From/To/Date/Subject plus optional cc/priority) with horizontal rule separator
- DocumentPagedLayout dispatches chrome by template.chrome name; plain template renders no chrome
- images in chrome (company_logo, organization_logo) work transparently with the unsplash resolver from Commit 2 — metadata already contains real URLs by the time renderer sees it
```

### Commit 7 — Download dropdown migration (artifact-panel)

**Why atomic:** UI surgery on one file. Creates the dropdown scaffold PR 2 will extend with .docx + .pdf items.

**Files:**
- Modify `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`:
  - Replace the current single-`<Button>` download trigger (line ~450-460) with a conditional:
    - If `artifact.type === "application/document"`: render a `<DropdownMenu>` with trigger and one item `.md source`
    - Else: keep the existing single-button behavior (slides, latex, etc. users still get one-click)
  - Extract a `handleDownloadMdSource` callback — simple Blob(`text/markdown`) + anchor click using `getExtension(artifact)` (which returns `.md`)
  - The existing `handleDownload` stays for non-document types
- **No new import** — `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` are already imported in the file

**Test gates:**
- Typecheck clean
- Manual: open a document artifact → click Download icon → dropdown appears with ".md source" → click → file downloads as `<title>.md` with content including frontmatter
- Manual: open a slides artifact → Download button is still single-click (PPTX generation path unchanged)
- Confirm downloaded `.md` round-trips: re-upload via knowledge tab → parseable as document → renders identically

**Commit message:**
```
feat(documents): download .md source via dropdown menu

- convert artifact-panel Download button to a DropdownMenu for application/document artifacts; single ".md source" item in PR 1, room for .docx + .pdf in PR 2 without UI rearrangement
- non-document artifact types keep their existing single-click download behavior (slides PPTX generation, latex source wrap, etc.) — zero UX regression for those
- new handleDownloadMdSource callback: Blob with text/markdown MIME + anchor click using getExtension(artifact) which returns .md
- download payload is the raw content string (frontmatter + body) so the file round-trips: re-uploading to knowledge parses the same frontmatter and renders identically
```

### Commit 8 — Prompt rules update (frontmatter + template guide + examples)

**Why atomic:** substantive content change to `src/lib/prompts/artifacts/document.ts` that teaches the LLM about frontmatter and the 4 templates. Depends on Commit 4 having locked the template names.

**Files:**
- Modify `src/lib/prompts/artifacts/document.ts`:
  - Add a new `## Frontmatter` section explaining YAML delimited by `---`, optional, defaults to `plain` template when absent
  - Add a `## Templates` section enumerating the 4 templates with "when to use" per spec hints from Commit 4's `promptHints.whenToUse`
  - Add new examples array entries:
    - Plain (existing "Technical README" — keep, renamed as example for plain template)
    - Letter (new example — generic formal letter with all required fields filled)
    - Report (new example — generic company report with cover fields)
    - Memo (new example — internal memo with header block)
  - Keep existing guidance on GFM tables, code fences with language tags, KaTeX math, mermaid fenced blocks, and anti-patterns (those remain valid)

**Test gates:**
- Typecheck clean
- Manual LLM regression check: trigger `/create-artifact` with canvas-mode `application/document` in a chat, confirm system prompt includes the new Frontmatter + Templates sections (inspect via network tab or add a quick `console.log` in `buildToolInstruction` — debug-only, NOT committed)

**Commit message:**
```
docs(documents): add frontmatter + templates guidance to LLM prompt rules

- src/lib/prompts/artifacts/document.ts: new ## Frontmatter section describing YAML delimited by --- (optional, defaults to plain template when absent)
- new ## Templates section enumerating plain/letter/report/memo with when-to-use guidance pulled from each template's promptHints in the registry
- new few-shot examples per template (plain README kept, generic letter/report/memo added with complete required-field frontmatter blocks) so the LLM can imitate shape
- existing guidance on GFM tables, code fences with language tags, KaTeX math, mermaid blocks, and anti-patterns preserved
```

---

## Open questions / confirmations needed BEFORE starting

1. **Malformed YAML behavior** (Commit 3): surface error via renderer banner (proposed) vs silent fallback to plain template. I prefer surfacing; confirm or override.
2. **Download dropdown scope** (Commit 7): I propose dropdown ONLY for `application/document`, other types keep single button. Alternative: migrate all types to dropdown uniformly. Latter is more consistent but touches more surface area; former is minimal-risk for this PR. Confirm preference.
3. **Report template TOC**: spec says "TOC placeholder (filled saat export di PR 2)". In PR 1 reader, I'll render the placeholder as an explicit `<nav>` block with text "Table of Contents — generated on export" — no algorithmic TOC built. Confirm that's OK for the reader view.
4. **Plain template "empty chrome"**: when the template is `plain`, `DocumentRenderer` routes to `FlowingLayout` (no chrome, no paged frame). Confirm the flowing layout should be **visually identical to today's markdown rendering** — same padding, same StreamdownContent, zero new wrapping. (My plan assumes yes.)
5. **Prisma data migration mechanics**: I proposed `bun prisma migrate dev --create-only` then apply via `db execute`. If there's a preferred internal script pattern for data migrations in this repo, tell me and I'll follow it.

---

## Execution order (post-approval)

```
C1 rename + migration       → typecheck + test + manual smoke → commit-sulthan
C2 unsplash resolver        → unit test + typecheck → commit-sulthan
C3 frontmatter parser       → unit test + typecheck → commit-sulthan
C4 template registry        → unit test + typecheck → commit-sulthan
C5 renderer scaffolding     → typecheck + manual smoke → commit-sulthan
C6 chrome components        → typecheck + manual smoke → commit-sulthan
C7 download dropdown        → typecheck + manual smoke → commit-sulthan
C8 prompt rules update      → typecheck + LLM-prompt sanity check → commit-sulthan
```

Each commit produces a working tree that passes typecheck and renders existing documents without regression. Explicit `git add <path>` on every commit — never `git add .`. Commit messages use single-line bullets (no mid-bullet line wrapping), per repo convention.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Legacy documents break after rename | Low | High | Data migration rewrites all `text/markdown` → `application/document` in Commit 1 |
| Frontmatter with typos silently renders as plain | Med | Med | Commit 3 detects `template:` field presence; unknown names fall back to plain but with a console warning surfaced via banner (Commit 5) |
| StreamdownContent behavior changes between PRs (mermaid/math) | Low | Med | Wrapped in DocumentFlowingLayout/DocumentPagedLayout so upgrade path is isolated |
| Paged layout looks broken on small screens | High | **Med** | A4 width 210mm fixed; on narrow screens it overflows-scrolls horizontally. Enterprise reviewers frequently open artifacts on tablet/phone during meetings — impact elevated from Low → Med. PR 1 ships with a `TODO(mobile)` comment in DocumentPagedLayout and an explicit follow-up item in the PR description. Mitigation options for follow-up: CSS `transform: scale()` fit-to-width, or flowing-fallback on narrow viewports. |
| Download dropdown breaks muscle memory for slides users | Low | Low | Dropdown scope limited to `application/document`; other types keep single button |
| Unsplash resolver regex over-matches (e.g. matches `unsplash:` inside code blocks) | Med | Low | Markdown image regex `/!\[([^\]]*)\]\(unsplash:([^)]+)\)/g` only matches `![alt](unsplash:...)` shape; code-block content escapes from image syntax anyway |
| `gray-matter` dep adds bundle weight | Low | Low | ~13 KB minified, server-side only (used in create-artifact/update-artifact tool handlers + frontmatter parser imported in DocumentRenderer which is client-side too). Acceptable. Alternative: hand-rolled YAML parser; overkill for gains. |

---

## PR description skeleton (drafted at PR creation time, after all 8 commits land)

```markdown
# Document Artifact (Reader) — Foundation for .docx/.pdf Export

## Summary
Adds `application/document` as a first-class artifact type with a template system (plain/letter/report/memo), frontmatter-driven metadata, and a dual-mode renderer (flowing for plain, paged for formal templates). Renames `text/markdown` → `application/document` as a hard breaking change. Sets up the .md source download via a dropdown menu that PR 2 will extend with .docx and .pdf.

## Breaking change
- Prisma data migration: all existing Document rows with `artifactType = "text/markdown"` rewritten to `"application/document"`. LLM tool schemas, type guards, switch cases, extension maps, and UI constants updated in-place. No dual-support window.
- File-MIME `text/markdown` strings preserved where they refer to the actual .md file format (uploads, Blob MIME, knowledge doc default).

## Approach per commit
[8 bullets summarizing each commit]

## Testing
- Typecheck: 0 errors after each commit
- Unit tests: `src/lib/unsplash/resolver.test.ts`, `src/lib/documents/frontmatter.test.ts`, `src/lib/documents/validate.test.ts`, updated `tests/unit/validate-artifact.test.ts`
- Manual: rename regression check, template-per-template smoke test (letter/report/memo), .md download round-trip, unsplash resolution in document content

## Follow-ups
- **PR 2 — Document Export** (`docs/artifact-plans/document-artifact-export.md`): .docx via `docx` lib client-side, .pdf via puppeteer server-side, re-rasterize mermaid via MermaidRender cache
- **Fase 5 — Branding templates**: NQRust-letter, RantAI-report as thin wrappers over the generic registry
- **Paged layout true pagination**: today's PagedLayout is single-page visually-suggestive; real page-break detection comes with PR 2 export work
- **Mobile viewport for PagedLayout**: A4 fixed-width overflows on narrow viewports. Marked with `TODO(mobile)` in the component — needs fit-to-width scaling or flowing-fallback on small screens
- **Unit tests for renderer components**: DocumentFlowingLayout, DocumentPagedLayout, ValidationBanner, chrome components — not required for PR 1 MVP but recommended for maintainability. Would assert: validation banner shows on errors, paged layout applies correct margins, chrome renders all required fields from metadata
- **"View source" button in validation banner**: scroll the panel to the code tab with the frontmatter offending line highlighted. Skipped in PR 1 (cross-component coordination across tabs)

## Noted for follow-up (out of scope here)
- Knowledge doc uploader accepts `.md` files and could auto-promote them to `application/document` artifacts — not implemented, deferred
- Reader-side TOC generation for report template (Commit 6 renders placeholder only)
```
