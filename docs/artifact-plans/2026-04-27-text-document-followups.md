# text/document Follow-Up Roadmap

> **Status:** post-ship roadmap. Companion to:
> - `docs/superpowers/specs/2026-04-27-text-document-script-based-design.md` (the rebuild design)
> - `docs/superpowers/plans/2026-04-27-text-document-script-based-plan.md` (the rebuild plan)
> - `docs/artifact-plans/-docx.md` (Anthropic's official docx skill — reference)
>
> **Created:** 2026-04-27, after the rebuild merged.

---

## Why this doc exists

The script-based rebuild closed the major output + preview fidelity gaps vs Claude.ai. Several of the skill's nice-to-have features were intentionally deferred to keep the rebuild scoped. This roadmap captures them as **independently shippable** follow-ups, ranked by ROI.

Each section has:
- **Effort estimate** (real, accounting for testing + review)
- **Dependencies** (whether it requires earlier items)
- **Why now / why later** (justification for prioritisation)
- **Implementation outline** (tight task breakdown — not a full TDD plan)

A maintainer can pick any **High ROI** item, complete it in a single session, and ship it. **Medium / Low ROI** items get their own dedicated plan when prioritised.

---

## Priority ladder

| Item | Effort | Skill parity? | ROI | Dependencies |
|---|---|---|---|---|
| 1. Smart quotes enforcement in prompt | ~10 min | yes (skill §"smart quotes") | **High** | none |
| 2. PDF download from script artifacts | ~1 hr | yes (skill's preview pipeline) | **High** | none |
| 3. Read user-uploaded `.docx` (new ingestion path) | 2–3 days | yes (skill §"Reading Content") | **Medium** | new artifact upload UX |
| 4. Tracked changes authoring + render | 5–7 days | yes (skill §"Tracked Changes") | **Low** | item 3 (need existing-doc edit flow) |
| 5. Comments authoring + render | 3–4 days | yes (skill §"Comments") | **Low** | item 3 |
| 6. `.doc` (legacy binary) support | ~4 hr | yes (skill §"Converting .doc to .docx") | **Low** | item 3 |

Ship 1 + 2 in any free hour. Bundle 3 + 4 + 5 + 6 into a "docx-as-input" project once there's user pull.

---

## Item 1 — Smart quotes enforcement in prompt

**Effort:** ~10 min (one prompt edit + manual smoke).
**Why High ROI:** prevents low-quality output (straight quotes look amateurish in formal documents) at zero infrastructure cost.

**Implementation:**

1. In `src/lib/prompts/artifacts/document.ts` `scriptRules` body, find the **Anti-Patterns** section (around line 612 in current file).
2. Add a new bullet:

   ```
   - ❌ Straight quotes (`'` and `"`) in prose. Use smart quotes:
     - `‘` (`'`) and `’` (`'`) for single
     - `“` (`"`) and `”` (`"`) for double
     - Apostrophes in contractions: `don't`, `it's`
     - The skill's reference at `docs/artifact-plans/-docx.md` mandates this — straight ASCII quotes look amateurish in formal deliverables.
   ```

3. Optional: extend the **Hello World** example at the bottom of the prompt to use smart quotes in its sample text so the LLM sees a concrete example.
4. Manual smoke: send a chat asking for a letter or proposal; assert the rendered output uses curly quotes.

**Acceptance:** quoted prose in generated documents uses curly quotes consistently.

---

## Item 2 — PDF download from script artifacts

**Effort:** ~1 hr.
**Why High ROI:** the LibreOffice convert step already produces a PDF as part of the preview pipeline. We just don't surface it as a download. Users who want PDF currently must download `.docx` and convert manually. One route branch + one download-button entry.

**Files:**
- Modify: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts`
- Modify: `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` (download dropdown)
- Create: `tests/unit/document-ast/download-route-script-pdf.test.ts`

**Implementation:**

1. **Route — script branch, add `format=pdf`:**

   ```ts
   import { docxToPdf } from "@/lib/rendering/server/docx-to-pdf"
   // …inside the `if (result.documentFormat === "script")` block:
   if (format === "pdf") {
     const sandboxR = await runScriptInSandbox(result.content, {})
     if (!sandboxR.ok || !sandboxR.buf) {
       return NextResponse.json({ error: `script failed: ${sandboxR.error}` }, { status: 500 })
     }
     const pdf = await docxToPdf(sandboxR.buf)
     return new Response(new Uint8Array(pdf), {
       status: 200,
       headers: {
         "Content-Type": "application/pdf",
         "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
         "Cache-Control": "no-store",
       },
     })
   }
   ```

   Existing `format=docx` branch unchanged. Keep the deferral message for any other format.

2. **Panel download dropdown** — find the existing "Download as Word" item (text/document split-button), add a sibling "Download as PDF" that hits `?format=pdf`. Match the existing fetch + blob + anchor-click pattern.

3. **Test** — mirror `download-route-script.test.ts`, mock auth + service, assert 200 + `application/pdf` + `%PDF` magic bytes.

**Caching opportunity (defer):** the preview pipeline already writes PNG pages to S3 cache. The intermediate PDF could be cached too with a parallel key — saves a re-convert on download. Skip in v1 (download is rare vs preview), revisit if download latency becomes a complaint.

**Acceptance:**
- "Download as PDF" button visible on script artifacts
- Click downloads a valid PDF that opens in any viewer
- Test passes

---

## Item 3 — Read user-uploaded `.docx` (new ingestion path)

**Effort:** 2–3 days.
**Why Medium ROI:** opens a whole class of use cases (review, summarise, translate, rewrite an existing client document). Requires architectural decisions about a new artifact ingestion pattern, hence not a one-shot.

**Conceptual gap:**
- Current artifact pipeline = **LLM-authored only**: tool call → script → render
- User-uploaded path = **inverse**: user uploads bytes → server stores + extracts → exposes to LLM as readable artifact

**Open questions to resolve in a dedicated design doc:**
- Where does the upload UI live? (chat composer attachment? new artifact create button? drag-drop on the panel?)
- Is the ingested doc immediately editable, or only readable + queryable via RAG?
- If editable, do we extract → reconstruct as a script (lossy) or keep the original `.docx` bytes and edit XML (skill's unpack/repack approach)?
- How does it interact with `documentFormat`? New value `"upload"` or reuse existing types?

**Recommended path:**

1. **Phase A: read-only ingestion (1 day).**
   - User uploads `.docx` via chat attachment
   - Server: pandoc-extracts to plain text, stores bytes in S3, creates a Document row tagged `documentFormat="upload"`
   - LLM sees the extracted text in the chat context (similar to how PDF uploads work today)
   - Panel shows the same PNG carousel preview as script artifacts (LibreOffice convert + rasterize on demand)

2. **Phase B: editable upload (1–2 more days).**
   - Two sub-options for editing:
     - **Lossy "convert to script":** LLM reads the extracted text, generates a docx-js script that recreates the doc. User edits via the existing Edit modal. Fidelity loss on first conversion.
     - **Surgical XML edit:** unpack the .docx, ship XML to LLM with edit instructions, LLM emits edited XML, repack. High fidelity, but LLM has to understand `<w:p>`, `<w:r>`, `<w:rPr>` etc. — nontrivial to prompt reliably.
   - Decision likely depends on user feedback after Phase A.

**Out of scope until prioritised:** dedicated plan in `docs/superpowers/plans/`. Item 3 enables items 4, 5, 6.

---

## Item 4 — Tracked changes authoring + render

**Effort:** 5–7 days.
**Why Low ROI:** consumer surface is small (only useful to user-edit-uploaded-doc workflows in legal/contract review use cases). Authoring tracked changes from an LLM is also UX-tricky — the model would need to understand "delta" semantics rather than "rewrite".

**Depends on item 3** (no point authoring tracked changes against a doc the user can't supply).

**Implementation hints (when prioritised):**
- LLM emits `<w:ins>` / `<w:del>` blocks in the rewritten XML (skill describes this verbatim)
- Panel renderer needs to visualise insertions (green underline) + deletions (red strikethrough) on top of the PNG carousel — would require **two separate render passes**:
  - Pass 1: clean version (changes accepted)
  - Pass 2: tracked version (with markup)
- Toggle in panel header: "Show tracked changes" on/off
- Download options: accept-all → clean .docx, or keep markup → reviewable .docx

**Cost:** doubles the render pipeline cost per artifact. Caching key would need a `tracked: boolean` segment.

---

## Item 5 — Comments authoring + render

**Effort:** 3–4 days.
**Why Low ROI:** comments need a viewer UI that's essentially a sidebar threaded discussion. Without that UI, comments embedded in the .docx are invisible in our PNG carousel (LibreOffice puts them as small balloon markers that don't reproduce well at our render DPI). Most useful for collaborative review workflows we don't currently support.

**Depends on item 3** (same reason as item 4).

**Implementation hints (when prioritised):**
- LLM emits `<w:commentRangeStart>` / `<w:commentRangeEnd>` in the XML, plus a `comments.xml` part with the comment bodies
- Panel renderer either:
  - Overlays balloon icons on the PNG and opens a side panel on click (heavy frontend work), OR
  - Adds a separate "Comments" tab listing comment threads inline (lighter, lower fidelity)
- Skill provides the `comment.py` script for inserting comments — we'd want a pure-JS equivalent or shell out

**Recommendation:** ship as part of item 3's Phase B if/when reviewer workflows are validated.

---

## Item 6 — `.doc` (legacy binary) support

**Effort:** ~4 hr.
**Why Low ROI:** `.doc` files are a shrinking minority. Users with legacy files can convert manually (every Word version 2007+ does it). LibreOffice can convert via the same `soffice --convert-to docx` already in the pipeline.

**Depends on item 3** (no current upload path; would land alongside the upload feature).

**Implementation hints (when prioritised):**
- Detect `.doc` extension on upload (or magic bytes: `D0 CF 11 E0`)
- Route through `soffice --headless --convert-to docx --outdir <tmp> input.doc` before the rest of the ingestion pipeline
- Rest of the path is identical to `.docx`

Trivial to implement once item 3 lands. Skip otherwise — not worth a standalone project.

---

## What's NOT in this roadmap

These were considered and explicitly rejected:

- **Direct XML editing in the panel** — dangerous (no validation, easy to corrupt), and the prompt-based edit modal already covers the user's actual mental model ("describe what to change").
- **WYSIWYG in-browser docx editor** (TinyMCE etc.) — would replace the entire script-based pipeline with a different paradigm. Not aligned with the rebuild's design philosophy (LLM-authored, true WYSIWYG via real .docx bytes).
- **Multi-user collaborative editing** — out of scope for the platform.
- **Custom fonts beyond the system stack** — would require font embedding + LibreOffice font path setup; significant infra work for niche need.

---

## Cleanup task (separate, scheduled)

Per spec §9.4, a Phase 2 cleanup is queued:

- After 2–4 weeks of script-mode soak in production with sandbox + render failure rates within targets (sandbox <1%, LibreOffice <0.5%)
- LLM bulk-migrates remaining `documentFormat="ast"` rows to script (with validation + S3 archival)
- Code removal PR: delete `document-ast/`, `document-renderer.tsx`, AST branches in route/validator/service, drop `documentFormat` column

That's a standalone `docs/superpowers/plans/` plan, not part of this roadmap.

---

## Decision matrix for "what to ship next"

If you have…

| Time available | Pick |
|---|---|
| 10 min | Item 1 (smart quotes) |
| 1 hour | Item 2 (PDF download) |
| 1 day | Items 1 + 2 + light polish |
| 2–3 days | Item 3 Phase A (read-only upload) |
| 1 week | Item 3 Phase A + B (editable upload, choose script vs XML route) |
| 2+ weeks | Item 3 + start Phase 2 cleanup |

Items 4, 5, 6 only after item 3 ships and there's a user pull signal.
