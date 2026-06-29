# Artifact Design System — "RantAI Warm Paper"

**Date:** 2026-06-29
**Status:** Implemented (branch: cloud `feat/artifact-design-system` → submodule `feat/plan-aware-models`)

## Problem

Generated artifacts (HTML/React/etc.) and the artifact side-panel looked pale
and generic — the default-AI "slate-50 + indigo-600 + Inter" aesthetic. We
wanted output and chrome that feel premium and on-brand, "close to Claude's
design," after evaluating open-design.ai as a reference.

## Decision

Open-design.ai is a standalone Electron+daemon app (a competitor), not a
library — its runtime can't be ported into our Next.js multi-tenant web app.
What's portable is the **format** (`DESIGN.md` + `tokens.css` + component
manifest) and the **prompt-composition pattern** (inject the design system as
authoritative prose + a verbatim CSS token contract, before the per-type rules).
We adopt those into our existing pipeline.

House style = **Direction C, "Warm Paper + RantAI Blue"**: warm parchment
surfaces, editorial serif headlines, the RantAI blue accent (`#3b6ddb`), and
depth from 1px rings rather than heavy borders. Keeps the RantAI brand while
borrowing Claude's editorial craft.

Scope (chosen with the user): **engine upgrade, no new user-facing UI**, but
built multi-system under the hood so a future "Design" page only needs to set a
`designSystemId` + add a picker.

## Architecture

Two workstreams sharing one concept: a **design system** =
`{ designMd, tokensCss, tailwindGuide, componentManifest }`.

### W1 — Generation steering
- `src/lib/design-systems/` — `types.ts`, `rantai.ts` (the house style),
  `registry.ts`, `loader.ts` (`loadDesignSystem`, `listDesignSystems`,
  `isKnownDesignSystem`; always falls back to the default).
- `src/lib/prompts/design-system.ts` — `getDesignSystemContext(type, id, depth)`
  emits: `## Active design system` (authoritative-but-defers-to-explicit-request)
  → prose (`full`) or essence (`compact`) → verbatim `:root` tokens → Tailwind
  guide → component manifest (`full`). Returns `""` for non-styled types.
  **Scoped to `text/html` + `application/react`** (SVG renderer rejects
  `<style>`; slides enforce their own theme palette; 3D has no DOM).
- `assembleArtifactContext(type, mode, designSystemId)` — design system now
  comes **after** the few-shot examples so it's the last word the model sees.
- `buildToolInstruction(..., { designSystemId })` — injects the block in auto,
  opt-in, and specific-canvas modes.
- Threading: request `body.designSystemId` → else `assistant.chatConfig.designSystemId`
  → else house default. (`schema.ts`, `repository.ts` select, `service.ts`,
  `types/assistant.ts ChatConfig`.)
- Renderers auto-inject the house `tokens.css` into the HTML/React iframes so
  `var(--ds-*)` always resolves regardless of model output.
- `html.ts` / `react.ts` defer to the house style by default, still honoring
  explicit user aesthetic requests (e.g. "make it brutalist").

### W2 — Panel chrome
- `--artifact-*` token set (light + dark) in app globals.
- Restyled `artifact-panel.tsx`, `artifact-indicator.tsx`,
  `renderers/code/code-status-bar.tsx`, `slides-renderer.tsx` nav: warm paper
  surfaces, ring depth, serif titles, RantAI-blue accent, designed empty state.

## Testing
`tests/unit/design-systems.test.ts` — loader fallback/listing, prompt-block
depth + type scoping, example-ordering, tool-instruction threading (17 tests).

## Out of scope / future
- The user-facing **Design page** (system picker + catalog browser) — the
  `designSystemId` seam is the bridge; the page just sets it.
- Importing open-design's Apache-2.0 `DESIGN.md` library (claude, linear,
  vercel, stripe…) as additional registry entries.
- Per-org custom design systems (DB/S3-backed) behind the same loader interface.
