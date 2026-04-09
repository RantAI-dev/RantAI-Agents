# Artifact System Fix Plan — Phased Rollout

Based on [audit-findings.md](./audit-findings.md). Goal: ship **all 80 findings** across 7 small, independently mergeable phases. Each phase should be one PR (or a tight cluster), runnable behind `bun lint && bun test:unit && bun check:thin-routes && bun check:domain-imports`.

Ordering principle: **prompt/validator drift first** (cheapest, highest leverage on output quality), **renderer correctness second**, **UX third**, **net-new capabilities last**. Stub types (slides, 3d) get their own phase so they can be parallelized.

Coverage map: every finding F1–F80 is assigned to exactly one phase below.

---

## Phase 0 — Prompt & validator alignment

Pure prompt + validator edits. Zero renderer or DB risk. Ship together.

| # | Finding | Change |
|---|---|---|
| 1 | F1 | `react.ts:5,15` "React 19" → "React 18" |
| 2 | F6 | `_validate-artifact.ts:1077-1082` sleep threshold 5 → 2 |
| 3 | F9 | `react.ts:15` add `useSyncExternalStore`, `useInsertionEffect`, `startTransition` to documented hooks |
| 4 | F13 | `_validate-artifact.ts:356-372,415-426` promote `\includegraphics`, `\cite`, `figure`, `tabular` to errors |
| 5 | F17 | `_validate-artifact.ts:264-273` warn on first `CURRENCY_NUMBER` hit |
| 6 | F27 | `markdown.ts:71` add second example (tutorial or comparison) |
| 7 | F28 | `latex.ts` add third example (`itemize`, `quote`, `\paragraph`) |
| 8 | F42 | `_validate-artifact.ts:616-622` skip node-count heuristic for non-flowchart |
| 9 | F43 | `_validate-artifact.ts` add `%%{init...theme...}%%` warn |
| 10 | F44 | `_validate-artifact.ts:759-763` SVG `<style>` warn → error |
| 11 | F45 | `_validate-artifact.ts` markdown raw-HTML tag warn |
| 12 | F46 | `_validate-artifact.ts` markdown unlabeled fence warn |
| 13 | F47 | `context.ts:34-35` gate `getDesignSystemContext` to visual types |
| 14 | F32 | Document or align sheet validator/renderer column-count asymmetry (`_validate-artifact.ts:232-239` vs `sheet-renderer.tsx:47-52`) |
| 15 | F63 | Add unit test asserting Python prompt's documented packages actually exist in Pyodide |

**Acceptance:** `bun test:unit` green; manual: trigger one Mermaid theme override + one SVG `<style>` block + one Python `time.sleep(3)` and confirm validator now blocks/warns correctly.

---

## Phase 1 — Tool-layer enforcement & storage safety (2-4h)

Validator hooks the tool args, not just content. Stops the silent-failure paths.

- **F23 + F26** — `create-artifact.ts`: when `type === "application/code"`, require `language` in args; return validation error if missing.
- **F24** — Pass canvas mode through to tool execute context; `create-artifact.ts` rejects type mismatch with formatted error.
- **F18** — `update-artifact.ts:100-105`: cap inline-fallback `content` (e.g. 32 KB); above that, store summary only and mark version as "S3-archive-failed".
- **F19** — Track `evictedVersionCount` in `metadata`; surface in UI later (Phase 4).

**Acceptance:** new unit tests in `tests/unit/validate-artifact.test.ts` (or sibling) covering: code-without-language rejected; canvas-mode mismatch rejected; large update with mocked S3 failure does not bloat metadata past cap.

---

## Phase 2 — Validators for stub types (4-6h)

Unblocks the existing stubs from "silent-fail" status before we even rewrite their prompts.

- **F2** — `validateSlides` branch (JSON parse, non-empty, first/last layout, allowed layouts, bullets ≤ 6, no markdown syntax).
- **F3** — `validate3d` branch (forbid `<Canvas`, `<OrbitControls`, `<Environment`, `document.`, `requestAnimationFrame`; require `export default`; warn on non-whitelisted imports vs `DEP_NAMES`).
- Wire both in `_validate-artifact.ts:42-51` switch.

**Acceptance:** unit tests for each branch covering happy path + each error class.

---

## Phase 3 — Renderer correctness (1-2 days)

Hardening pass on the renderers. No new features.

| # | Finding | Change |
|---|---|---|
| 1 | F4 | R3F: replace regex sanitizer with explicit self-closing + paired matches (or babel visitor) |
| 2 | F7 | React: inject `ErrorBoundary` in iframe template; postMessage error+stack to parent |
| 3 | F8 | React preprocessor: append `const {X} = React;` for any dropped named import not in destructure list |
| 4 | F10 | HTML loader: dismiss spinner on `onLoad`, keep 3s as warning fallback |
| 5 | F11 | HTML `injectDefaults`: tighten `<head>` regex or DOMParser |
| 6 | F12 | Mermaid: hoist `mermaid.initialize` to module scope, re-init on theme change only |
| 7 | F14 + F15 | LaTeX: balanced-brace scanner for section + inline command args |
| 8 | F16 | SVG: `DOMParser` parse, render error card on `<parsererror>` |
| 9 | F22 | Extract shared `NAV_BLOCKER_SCRIPT` constant used by HTML + React |
| 10 | F25 | Slides postMessage: standardize `{ type: "navigate", index }` |
| 11 | F31 | Python: reset `__plot_images__ = []` per run |
| 12 | F48 | Python: move matplotlib capture setup into `initPyodide` |
| 13 | F49 | R3F: keep `<color>` (or document the strip) |
| 14 | F53 | `application/code` artifact-renderer dispatch: dynamic fence length when re-wrapping (use `~~~` longer than any inside) |
| 15 | F54 | HTML `injectDefaults`: auto-inject Inter font link alongside Tailwind |
| 16 | F55 | Mermaid: memoize parsed-content hash so theme toggle doesn't re-parse identical source |
| 17 | F56 | LaTeX renderer: preserve paragraph breaks in `latex-renderer.tsx:326-334` |
| 18 | F57 | HTML partial-wrap: add `lang="en"` |
| 19 | F64 | HTML + React nav-blockers: `window.open` returns no-op stub instead of `null` |
| 20 | F29 | Python: pre-load `sklearn` in `initPyodide` (or warn-and-micropip) |
| 21 | F72 | Python output panel: responsive max-height instead of hard `max-h-[300px]` |

**Acceptance:** existing renderers continue to work for known-good content from each prompt's examples; one new test triggering each broken case (malformed SVG, post-mount React throw, paired `<OrbitControls>...</OrbitControls>`).

---

## Phase 4 — Frontend UX & version history (1-2 days)

User-facing polish. Each item is independent and can be split across PRs if Phase 4 grows.

- **F5** — RAG indexed status: write `metadata.ragIndexed: boolean | "failed"` from `indexArtifactContent`; show "Not searchable" badge in panel header.
- **F19 (UI)** — Show "+N earlier versions evicted" pill from Phase 1 counter.
- **F20** — Persist `activeArtifactId` in `sessionStorage`; restore in `loadFromPersisted`.
- **F33** — Sheet export: export all rows or relabel button to "CSV (filtered)".
- **F34** — `onFixWithAI`: either wire to every renderer's error card, or remove the prop. Decide; recommend wire (small win for the React error boundary from Phase 3).
- **F35** — Confirm fullscreen always uses portal branch.
- **F38** — Edit textarea: surface server validation errors from PUT response inline.
- **F39** — Version viewer: "Restore this version" button → triggers `update_artifact` with old content.
- **F50 + F59** — Code download: central Shiki language → extension map.
- **F51** — LaTeX download: wrap in `\documentclass{article}\begin{document}…\end{document}`.
- **F52** — Sheet download: slugified artifact title filename.
- **F62** — CSV parser/validator: don't trim; trim only on display.
- **F78** — Audit PATCH route handler enforces session ownership (security review).
- **F61** — Artifact indicator: tiny preview thumbnail per type in `artifact-indicator.tsx:25-47`.

**Acceptance:** manual smoke test of each touched flow; no regressions in existing artifact panel tests.

---

## Phase 5 — Slides + 3D prompt rewrites (2-3 days, parallelizable)

These are the only sub-7/10 types left. Each is one focused PR.

### 5a. `application/slides`
Per audit §1 stub recommendations:
- Restructured `rules` (Runtime, JSON schema, Per-layout reference, Theme palette, Anti-patterns).
- Two examples (minimal deck + mixed-layout deck).
- Document `parseLegacyMarkdown` fallback as discouraged.
- Updated `summary` to mention legacy markdown + PPTX export.
- Concrete dark palette pairs with hex.
- Validator already shipped in Phase 2 — verify still aligned.

### 5b. `application/3d`
Per audit §1 stub recommendations:
- Restructured `rules` (Runtime, Allowed Imports, Model CDNs, Animation Pattern, Anti-Patterns).
- Two examples (primitives-only, `useGLTF` with animations).
- Pin exact dep versions from `r3f-renderer.tsx:97-104`.
- Document `sanitizeSceneCode` contract: what is stripped, what survives.
- Confirm Canvas/OrbitControls/Environment provided by wrapper, no lights needed (or correct accordingly).
- Updated `summary`.
- Validator already shipped in Phase 2 — verify still aligned.

**Acceptance:** target both stubs to ≥ 8/10 on the scorecard. Manual: 3 prompts each producing rendered output cleanly.

---

## Phase 6 — Medium-effort UX & perf (1 week)

Costs more dev time, lower per-item leverage. Prioritize when Phase 0-5 ship.

- **F21** — Streaming partial artifact rendering during tool-call streaming. **Large** but high user-perceived impact.
- **F30** — Python: `interruptBuffer`-based stop, keep worker warm.
- **F36** — Mobile layout (panel → bottom sheet on small screens).
- **F37** — CodeMirror 6 in edit textarea.
- **F40** — Diff view between versions (`jsdiff`).
- **F41** — Lazy-inject artifact summaries only on artifact-likely turns.
- **F58** — React preprocessor: proper template-literal tokenizer.
- **F60** — Per-type editor (data-grid for sheet, JSON tree for slides) replacing the raw textarea path in `artifact-panel.tsx:504-518`. Large.

**Acceptance:** F21 should land alone in its own PR.

---

## Phase 7 — Missing capabilities (continuous, not blocking)

Pull from §6 of audit on a per-quarter basis. Ranked roughly by impact/effort:

| Rank | Finding | Effort | Notes |
|---|---|---|---|
| 1 | F66 Fork artifact | small | Lowest cost, immediate value |
| 2 | F67 Multi-artifact tabs | medium | Compare two outputs |
| 3 | F73 Resize handle | small | Trivial, high comfort |
| 4 | F74 Session artifact search | small | Helps long sessions |
| 5 | F69 Dark theme injection | small | Visual consistency |
| 6 | F79 "Ask about this artifact" | small | Closes a real friction loop |
| 7 | F70 Console panel | medium | Devx win |
| 8 | F65 Public share URL | large | Needs auth + visibility model |
| 9 | F75 ZIP bundle export | medium | |
| 10 | F76 PDF export for slides | medium | After Phase 5a |
| 11 | F77 Publish HTML to web | medium | Needs S3 policy work |
| 12 | F68 Cross-artifact refs | large | Effectively a virtual FS |
| 13 | F71 Real-time collab | large | Reuse Socket.io infra |
| 14 | F80 Templates library | medium | |

---

## Cross-cutting work

Things that don't belong to one phase but should be tracked:

- **Test coverage**: every new validator branch (Phase 0/1/2) needs unit tests in `tests/unit/`. Run `bun check:domain-imports` after every renderer touch.
- **Compliance scripts**: `bun check:thin-routes` after Phase 1 (canvas mode passthrough may touch route handlers); `bun check:frontend-compliance` after Phase 4.
- **`docs/ARTIFACTS.md`** must be updated alongside Phase 0 (React version), Phase 2/5 (slides + 3d sections), Phase 3 (renderer behavior changes), Phase 4 (storage/UX behavior).
- **Decommission audit-findings as items ship**: keep a `[done] FN` marker so the audit doc stays the source of truth.

---

## Suggested rollout order

1. **Day 1** — Phase 0 (one PR, all 13 quick wins).
2. **Day 1-2** — Phase 1 (storage + tool args).
3. **Day 2-3** — Phase 2 (stub validators) + start Phase 5 prompt drafts in parallel.
4. **Day 3-5** — Phase 3 (renderer hardening).
5. **Day 5-7** — Phase 4 (UX) + finish Phase 5 (slides + 3d).
6. **Week 2+** — Phase 6, then Phase 7 backlog grooming.

End state after Phase 5: every type ≥ 8/10, every type has a validator branch, no silent failure paths in tool execution, version history is restorable, and known prompt/validator/renderer drifts are eliminated.
