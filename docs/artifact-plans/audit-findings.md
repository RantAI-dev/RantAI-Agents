# Artifact System Audit — Post Batch 1-9 Quality Upgrades

Audit date: 2026-04-09. Scope: current state of `src/lib/prompts/artifacts/**`, `src/features/conversations/components/chat/artifacts/**`, `src/lib/tools/builtin/{create,update,_validate}-artifact.ts`. 9 of 11 types received instruction upgrades (HTML, React, SVG, Mermaid, Code, Python, Sheet, Markdown, LaTeX). `application/slides` and `application/3d` remain stubs (treated as recommendations, not bugs).

---

## 1. Per-type quality scorecard

| Type | Rules specificity | Examples | Summary disambiguation | Failure modes addressed | Renderer truthfulness | Design quality | Truncation enforcement | Overall |
|---|---|---|---|---|---|---|---|---|
| `text/html` | 9 | 9 | 9 | 9 | 9 | 9 | 10 | **9.0** |
| `application/react` | 9 | 9 | 8 | 9 | **6** (React 19 lie) | 9 | 10 | **8.5** |
| `image/svg+xml` | 9 | 9 | 9 | 9 | 9 | 8 | 10 | **9.0** |
| `application/mermaid` | 10 | 10 | 9 | 10 | 9 | 8 | 10 | **9.5** |
| `application/code` | 9 | 9 | 10 | 9 | 10 | 9 | 10 | **9.5** |
| `application/python` | 9 | 9 | 9 | 9 | 8 | 8 | 10 | **8.5** |
| `application/sheet` | 10 | 10 | 9 | 10 | 9 | 8 | 10 | **9.5** |
| `text/markdown` | 9 | 7 (only 1 example) | 10 | 9 | 9 | 8 | 9 | **8.5** |
| `text/latex` | 9 | 9 | 10 | 9 | 8 | 8 | 10 | **9.0** |
| `application/slides` | 4 | 0 | 4 | 3 | 5 | 4 | 3 | **3.0** |
| `application/3d` | 5 | 0 | 4 | 4 | 6 | 3 | 3 | **3.5** |

Every upgraded type scores ≥ 8.5/10. Only slides and 3d fall below 7. The one quality item below 7 in an upgraded type is the React renderer-truthfulness gap (Finding 1), which is a prompt-side lie fixable with a two-character edit.

### `application/slides` — what the stub needs

- **Runtime environment section**: explain that content is parsed by `parsePresentation` (`src/features/conversations/components/chat/artifacts/renderers/slides-renderer.tsx:14`), renders through `slidesToHtml` in an iframe with `sandbox="allow-scripts"`, and exports via `@/lib/slides/generate-pptx`.
- **Complete JSON schema**: enumerate all valid `layout` values and show which fields are required per layout (current rules list the values in one line with no structural contract).
- **Examples**: currently `examples: []` (`slides.ts:10`). Needs at least two full examples — one minimal deck, one mixed-layout deck demonstrating `title`, `content`, `two-column`, `quote`, `closing`.
- **Legacy markdown fallback**: document that `parseLegacyMarkdown` exists but discourage its use; specify what triggers it (`isJsonPresentation`).
- **Validator**: add a `validateSlides` branch to `_validate-artifact.ts` — currently zero validation. Check JSON parses, `slides` is non-empty array, first layout is `title`, last is `closing`, layouts are from the allowed set, title slide has `subtitle`, per-slide bullet count ≤ 6, text fields don't contain markdown syntax (`**`, `##`, backticks).
- **Per-layout field reference**: table of which keys matter for each layout.
- **Theme guidance**: concrete palette pairs (dark base + accent) with hex values; the current one-liner is unusable at scale.
- **Summary**: current summary says "Dark-themed JSON slide decks" — doesn't mention the legacy markdown path or PPTX export.

### `application/3d` — what the stub needs

- **Structured rules file** (currently a single paragraph crammed into one string at `r3f.ts:7-14`). Split into sections: Runtime, Allowed Imports, Model CDNs, Animation Pattern, Anti-Patterns.
- **Examples**: currently `examples: []` (`r3f.ts:15`). Needs at least two — one primitives-only scene, one `useGLTF` model load (with and without animations).
- **Dependency version pins**: rules must state the exact versions the renderer loads (`react 18.3.1`, `three 0.170.0`, `@react-three/fiber 8.17.10`, `@react-three/drei 9.117.0` from `r3f-renderer.tsx:97-104`). Currently the LLM is flying blind about API surface.
- **Model CDN verification**: the Supabase URL list in the rules is unverified. Needs a runtime "available models" contract, or the hallucinated-model failure mode must be called out.
- **Sanitizer contract**: document the exact transforms `sanitizeSceneCode` performs (`<Canvas>` → `<>`, `<OrbitControls/>` stripped, imports stripped). LLM must not rely on what's stripped.
- **Error UX + fallback lighting/camera**: since Canvas/OrbitControls/Environment live in the wrapper, the rules must tell the LLM it does NOT need to set up lights (or confirm that it does).
- **Validator**: add a `validate3d` branch — currently zero validation. Check that output does not include `<Canvas`, `<OrbitControls`, `<Environment`, `new THREE.WebGLRenderer`, `document.getElementById`, `requestAnimationFrame`; check `export default`; warn on imports not in the allowed list.
- **Summary**: doesn't mention model loading, Drei helpers, or that the scene runs inside a pre-existing Canvas — misleading when shown in summary mode.

---

## 2. Critical

### Finding 1
- **What:** React prompt says React 19 but renderer loads React 18 UMD.
- **Where:** `src/lib/prompts/artifacts/react.ts:5,15` claims React 19; `src/features/conversations/components/chat/artifacts/renderers/react-renderer.tsx:181-182` loads `react@18/umd/react.production.min.js`. Iframe destructures `useSyncExternalStore`, `useInsertionEffect`, `startTransition` (`react-renderer.tsx:249`) which exist in 18; actual React 19 additions (`use`, `useActionState`, `useFormStatus`) are NOT exposed.
- **Impact:** LLM may emit React 19-only APIs that crash inside the iframe with no clear error.
- **Fix:** Change "React 19" → "React 18" in `react.ts:5` and the table row at `react.ts:15`, or upgrade renderer to React 19 UMD.
- **Effort:** small

### Finding 2
- **What:** Slides artifact has zero validator branch — any malformed JSON is persisted and crashes the renderer.
- **Where:** `src/lib/tools/builtin/_validate-artifact.ts:42-51` falls through to `{ ok: true }` for `application/slides`. Renderer at `slides-renderer.tsx:14-29,95-101` silently returns "No slides found".
- **Impact:** Broken decks persist in DB, users see silent empty state, LLM gets no retry signal.
- **Fix:** Add `validateSlides` — require JSON parse success, `slides: Array` non-empty, first layout `title`, allowed layouts, no markdown syntax in slide text, bullets ≤ 6.
- **Effort:** medium

### Finding 3
- **What:** 3D artifact has zero validator branch — same failure mode as slides.
- **Where:** `_validate-artifact.ts:42-51`; `r3f-renderer.tsx:7-34` sanitizes but does not reject.
- **Impact:** LLM-generated scenes that import `Canvas`, use `document`, or reference unavailable Drei helpers get silently stripped and render as blank or broken.
- **Fix:** Add `validate3d` — forbid `<Canvas`, `<OrbitControls`, `<Environment`, `document.`, `requestAnimationFrame`, check `export default`, warn on imports outside the whitelist (`DEP_NAMES` at `r3f-renderer.tsx:49-57`).
- **Effort:** medium

### Finding 4
- **What:** R3F `sanitizeSceneCode` regex strip is fragile for multi-attribute or paired JSX.
- **Where:** `r3f-renderer.tsx:25-31` — `<Canvas[\s\S]*?>` + `<OrbitControls[\s\S]*?\/>` require self-closing; paired form `<OrbitControls makeDefault>...</OrbitControls>` is not matched, and `>` inside an attribute string can terminate early.
- **Impact:** Scene compile fails or LLM-intended content gets deleted.
- **Fix:** Use a babel visitor or explicitly match both self-closing and paired forms.
- **Effort:** medium

### Finding 5
- **What:** RAG indexing failures are fire-and-forget, silently invisible even on update.
- **Where:** `create-artifact.ts` (~line 142) and `update-artifact.ts` (~line 148) both call `indexArtifactContent(...)` without await; errors only log.
- **Impact:** Artifacts show in the panel but are missing from RAG search with no user-visible signal. Stale chunks may remain on update failure.
- **Fix:** Track indexing status in `Document.metadata.ragIndexed`; surface "not searchable" badge; add retry job.
- **Effort:** medium

---

## 3. High Priority

### Finding 6
- **What:** Python prompt says "keep runtime under ~10s, no sleeps >1–2s" but validator only warns at `time.sleep(>5)`.
- **Where:** `python.ts:16` vs `_validate-artifact.ts:1077-1082`.
- **Impact:** LLM can ship a 4-second sleep that passes validation but contradicts the rules.
- **Fix:** Align threshold to 2s in the validator, or weaken the prompt to "under 5s".
- **Effort:** small

### Finding 7
- **What:** React renderer has no runtime error boundary — errors after initial mount blank the iframe.
- **Where:** `react-renderer.tsx:246-266` wraps `createRoot(...).render(...)` in a `try/catch` that only fires synchronously. Post-mount errors escape to `window.onerror` as a bare string.
- **Impact:** User sees "Render error" with zero stack/component trace; no recovery path.
- **Fix:** Inject a React `ErrorBoundary` around the component in the template; post full error+stack to parent.
- **Effort:** small

### Finding 8
- **What:** React preprocessor silently drops `react`/`react-dom` imports, including named imports not pre-destructured.
- **Where:** `react-renderer.tsx:63-64` returns empty for any `react` import. Iframe template hardcodes the destructure list at `react-renderer.tsx:249`.
- **Impact:** If LLM uses a React API not in the destructure list (e.g. `useFormStatus`), it's `undefined` at runtime with no warning.
- **Fix:** Scan dropped named imports and append `const {X} = React;` preamble for unknown ones.
- **Effort:** small

### Finding 9
- **What:** React prompt hook list omits APIs the iframe actually exposes.
- **Where:** `react.ts:15` lists hooks; `react-renderer.tsx:249` additionally exposes `useSyncExternalStore`, `useInsertionEffect`, `startTransition`, `createElement`, `isValidElement`.
- **Impact:** Under-documented capabilities.
- **Fix:** Sync the list in both directions.
- **Effort:** small

### Finding 10
- **What:** HTML renderer timeout-based loader dismissal masks real load failures.
- **Where:** `html-renderer.tsx:76-81` dismisses spinner after 3s unconditionally.
- **Impact:** If Tailwind/fonts CDN is blocked, user sees content flash then hang silently.
- **Fix:** Dismiss only on `onLoad`; keep 3s as a safety net that also shows a warning if it fires first.
- **Effort:** small

### Finding 11
- **What:** `injectDefaults` regex `<head([^>]*)>` fails on heads with `>` inside attributes.
- **Where:** `html-renderer.tsx:38-40`.
- **Impact:** Silent injection failure → no nav blocker, no Tailwind.
- **Fix:** Parse with DOMParser or tighten regex to `<head(\s[^>]*)?>`.
- **Effort:** small

### Finding 12
- **What:** Mermaid `mermaid.initialize` is called on every render.
- **Where:** `mermaid-renderer.tsx:34-39` inside the `useEffect` body.
- **Impact:** Theme flicker / state leakage across multiple Mermaid artifacts; minor perf cost.
- **Fix:** Initialize once at module level; re-initialize only on `resolvedTheme` change.
- **Effort:** small

### Finding 13
- **What:** LaTeX validator treats fundamentally-unsupported commands as warnings only.
- **Where:** `_validate-artifact.ts:356-372,415-426` — `\includegraphics`, `\cite`, `\begin{figure}`, `\begin{tabular}` are warnings.
- **Impact:** Renderer silently drops them; LLM never self-corrects.
- **Fix:** Promote to errors — they fundamentally cannot work.
- **Effort:** small

### Finding 14
- **What:** LaTeX renderer section regex `\\section\*?\{([^}]*)\}` breaks on nested braces.
- **Where:** `latex-renderer.tsx:144,156,168`.
- **Impact:** Headings with math (`\section{$f(x)$}`) render broken.
- **Fix:** Balanced-brace scanner for command arguments.
- **Effort:** medium

### Finding 15
- **What:** `processInlineLatex` brace regex mangles nested text+math commands.
- **Where:** `latex-renderer.tsx:40-59`.
- **Impact:** `\textbf{$x^2$}` breaks.
- **Fix:** Balanced-brace parse.
- **Effort:** medium

### Finding 16
- **What:** SVG renderer has no error state — malformed SVG renders as empty `<div>`.
- **Where:** `svg-renderer.tsx:10-24`.
- **Impact:** Silent blank panel for broken SVG.
- **Fix:** Parse with `DOMParser`, catch `<parsererror>`, show source+retry like other renderers.
- **Effort:** small

### Finding 17
- **What:** Sheet validator requires two `CURRENCY_NUMBER` hits to warn.
- **Where:** `_validate-artifact.ts:264-273`.
- **Impact:** Single formatted cell in a small column passes through.
- **Fix:** Warn on any hit.
- **Effort:** small

### Finding 18
- **What:** `update_artifact` S3 fallback inlines previous content into `metadata.versions[*].content`.
- **Where:** `update-artifact.ts:100-105`.
- **Impact:** Repeated edits on 512 KB artifacts with flaky S3 balloon the Postgres row.
- **Fix:** Cap inline fallback content length; otherwise drop to summary-only or hard-fail.
- **Effort:** small

### Finding 19
- **What:** 20-version FIFO eviction is silent.
- **Where:** `update-artifact.ts:108-110`; `artifact-panel.tsx:285-308` version pill.
- **Impact:** Users expect full history; oldest versions disappear without notice.
- **Fix:** Track eviction count in metadata; show "+N earlier versions evicted" in UI.
- **Effort:** small

### Finding 20
- **What:** `loadFromPersisted` always sets `activeArtifactId = null`.
- **Where:** `use-artifacts.ts:86`.
- **Impact:** Refreshing mid-session closes the active artifact panel.
- **Fix:** Persist last active ID in `sessionStorage`, restore on load.
- **Effort:** small

### Finding 21
- **What:** No streaming/progressive rendering during artifact generation.
- **Where:** `use-artifacts.ts:15-46` — artifacts only added on final tool result.
- **Impact:** Long generations feel frozen; no partial preview.
- **Fix:** Emit partial artifact events during tool-call streaming; render as draft.
- **Effort:** large

### Finding 22
- **What:** HTML and React iframe nav-blockers duplicate a ~20-line script verbatim with drift.
- **Where:** `html-renderer.tsx:13-25` vs `react-renderer.tsx:201-244` (React version has extra comments, indicating divergence).
- **Impact:** Drift risk — fixes to one don't propagate.
- **Fix:** Extract to shared `NAV_BLOCKER_SCRIPT` constant.
- **Effort:** small

### Finding 23
- **What:** `application/code` validator doesn't verify `language` parameter is set (it lives on tool args, not content).
- **Where:** `_validate-artifact.ts:452-501` only sees content.
- **Impact:** LLM can omit `language`; wrong extension on download, plain-text rendering.
- **Fix:** Check `language` in `create-artifact.ts` when `type === "application/code"`, return validation error.
- **Effort:** small

### Finding 24
- **What:** Canvas-mode type mismatch is not enforced — LLM can ship wrong type with no warning.
- **Where:** Tool does not receive canvas mode; `chat-workspace.tsx:~2044` per ARTIFACTS.md.
- **Impact:** User asks for React, gets HTML.
- **Fix:** Pass canvas mode to tool execute context; reject mismatch with formatted error.
- **Effort:** medium

### Finding 25
- **What:** Slides iframe navigation contract is inconsistent: dot clicks post `{ direction: <number> }` while next/prev post `{ direction: "next"|"prev" }`.
- **Where:** `slides-renderer.tsx:145-152` vs `52-60`.
- **Impact:** Dot pagination may be silently broken depending on `slidesToHtml` contract.
- **Fix:** Standardize on `{ type: "navigate", index: n }` for jumps, document contract.
- **Effort:** small

---

## 4. Medium Priority

### Finding 26
- **What:** Code prompt demands `language` but validator can't enforce.
- **Where:** `code.ts:12`; paired with Finding 23.
- **Impact:** Instruction is advisory only.
- **Fix:** Pair with Finding 23; also add explicit tool-call shape example.
- **Effort:** small

### Finding 27
- **What:** Markdown prompt ships only one example; `context.ts:37` requests two.
- **Where:** `markdown.ts:71`.
- **Impact:** Under-covered — no comparison/tutorial example.
- **Fix:** Add a second example.
- **Effort:** small

### Finding 28
- **What:** LaTeX prompt examples don't cover lists, quotes, or `\paragraph`.
- **Where:** `latex.ts:87-165`.
- **Impact:** Under-covered features.
- **Fix:** Add a third example using `itemize`, `quote`, `\paragraph`.
- **Effort:** small

### Finding 29
- **What:** Python prompt promises `sklearn` is available on import; Pyodide auto-load is not reliable for large packages on first run.
- **Where:** `python.ts:13`.
- **Impact:** First `import sklearn` may hang.
- **Fix:** Either pre-load in `python-renderer.tsx:43` or require `micropip` with a warning.
- **Effort:** small

### Finding 30
- **What:** Python Stop terminates worker, losing warm Pyodide state.
- **Where:** `python-renderer.tsx:172-179`.
- **Impact:** Stop→Run costs a full ~10s cold start.
- **Fix:** Interrupt via `pyodide._api.interruptBuffer` or raise; keep worker alive.
- **Effort:** medium

### Finding 31
- **What:** Python `__plot_images__` global accumulates across runs.
- **Where:** `python-renderer.tsx:65-95` — setup runs per Run but global is not reset.
- **Impact:** Second run shows first run's plots.
- **Fix:** Reset `__plot_images__ = []` at top of capture block.
- **Effort:** small

### Finding 32
- **What:** Sheet renderer and validator differ on column-count mismatch handling.
- **Where:** `_validate-artifact.ts:232-239` (reject) vs `sheet-renderer.tsx:47-52` (pad with `""`).
- **Impact:** Validation stricter than renderer; OK but undocumented.
- **Fix:** Document asymmetry or align.
- **Effort:** small

### Finding 33
- **What:** Sheet CSV download exports only filtered rows without labeling.
- **Where:** `sheet-renderer.tsx:85-105` uses `table.getRowModel().rows`.
- **Impact:** User thinks they got all rows.
- **Fix:** Export all rows or label button.
- **Effort:** small

### Finding 34
- **What:** `onFixWithAI` prop is only wired for R3F; dead prop for 10/11 types.
- **Where:** `artifact-renderer.tsx:86-119`, `artifact-panel.tsx:46`.
- **Impact:** Half-built feature.
- **Fix:** Wire to every renderer's error card, or remove.
- **Effort:** medium

### Finding 35
- **What:** Non-portal fullscreen path has no backdrop.
- **Where:** `artifact-panel.tsx:265-270` vs portal branch `526-536`.
- **Impact:** Minor visual inconsistency — code path at `268` only runs when NOT fullscreen so this is actually OK; verify.
- **Fix:** Ensure `isFullscreen` always takes the portal branch.
- **Effort:** small

### Finding 36
- **What:** No mobile layout — panel is right-side fixed width.
- **Where:** `artifact-panel.tsx:265-270`.
- **Impact:** Unusable on phones.
- **Fix:** Media query → bottom sheet or full-page.
- **Effort:** medium

### Finding 37
- **What:** Edit textarea has no syntax highlighting.
- **Where:** `artifact-panel.tsx:455-463`.
- **Impact:** Painful to edit HTML/React/Python.
- **Fix:** Lazy-load CodeMirror 6.
- **Effort:** medium

### Finding 38
- **What:** Edit mode doesn't run client-side validation; errors surface only after save.
- **Where:** `artifact-panel.tsx:198-238`.
- **Impact:** Frustrating edit loop.
- **Fix:** Run same validator client-side, or display server validation errors from PUT response.
- **Effort:** medium

### Finding 39
- **What:** Version viewer is read-only — no restore/fork of a prior version.
- **Where:** `artifact-panel.tsx:180-196`.
- **Impact:** Half the feature.
- **Fix:** Add "Restore this version" that triggers an update.
- **Effort:** small

### Finding 40
- **What:** No diff view between versions.
- **Where:** `artifact-panel.tsx` version pill.
- **Impact:** Hard to see what changed.
- **Fix:** Add `jsdiff` side-by-side or inline diff mode.
- **Effort:** medium

### Finding 41
- **What:** All 11 summaries are shipped on every no-canvas request — ~500 tokens/req waste.
- **Where:** `src/lib/prompts/instructions.ts` + `context.ts:25-30`.
- **Impact:** Persistent token overhead on chats that never use artifacts.
- **Fix:** Inject summaries only on artifact-likely turns (keyword heuristic or prior-turn signal).
- **Effort:** medium

### Finding 42
- **What:** Mermaid node-count heuristic over-counts in ER/class diagrams.
- **Where:** `_validate-artifact.ts:616-622` — generic identifier+`[({` regex matches ER attribute blocks.
- **Impact:** False-positive >15-node warnings.
- **Fix:** Skip heuristic unless diagram is `flowchart`/`graph`.
- **Effort:** small

### Finding 43
- **What:** Mermaid validator doesn't detect `%%{init: ...theme...}%%` overrides even though the prompt forbids them.
- **Where:** `_validate-artifact.ts:541-625`; rule at `mermaid.ts:12`.
- **Impact:** LLM can ship overrides that break dark mode.
- **Fix:** Add regex check, warn.
- **Effort:** small

### Finding 44
- **What:** SVG validator emits only a warning for `<style>` blocks despite the prompt forbidding them.
- **Where:** `_validate-artifact.ts:759-763`; rule at `svg.ts:15`.
- **Impact:** Host-page CSS leak is a real bug, not a style nit.
- **Fix:** Promote to error.
- **Effort:** small

### Finding 45
- **What:** Markdown validator doesn't detect forbidden raw HTML tags.
- **Where:** `markdown.ts:19` forbids `<details>`, `<kbd>`, etc.; `_validate-artifact.ts:299-346` only catches `<script>`.
- **Impact:** LLM ships raw HTML that renders wrong or vanishes.
- **Fix:** Warn on common unsupported tags.
- **Effort:** small

### Finding 46
- **What:** Markdown validator doesn't enforce language tag on fenced code blocks.
- **Where:** `markdown.ts:12` demands it; `_validate-artifact.ts:299-346` has no check.
- **Impact:** Untagged fences render unstyled.
- **Fix:** Scan for ` ``` ` without trailing language identifier.
- **Effort:** small

### Finding 47
- **What:** `assembleArtifactContext` injects design tokens even for non-visual types.
- **Where:** `context.ts:34-35` calls `getDesignSystemContext(type)` unconditionally.
- **Impact:** Python script request ships Tailwind color tokens — wasted tokens and confusion.
- **Fix:** Gate to HTML/React/SVG/slides.
- **Effort:** small

### Finding 48
- **What:** Python matplotlib capture setup runs per Run instead of per init.
- **Where:** `python-renderer.tsx:65-83`.
- **Impact:** Minor wasted work.
- **Fix:** Move into `initPyodide`.
- **Effort:** small

### Finding 49
- **What:** R3F sanitizer strips `<color attach="background">` — removes user-requested scene background.
- **Where:** `r3f-renderer.tsx:31`.
- **Impact:** Silent loss of backgrounds.
- **Fix:** Keep `<color>` or document clearly and let prompt warn.
- **Effort:** small

### Finding 50
- **What:** Code download uses `.${language}` giving extensions like `.typescript`, `.csharp`.
- **Where:** `artifact-panel.tsx:555`.
- **Impact:** Non-idiomatic filenames.
- **Fix:** Map Shiki language → conventional extension.
- **Effort:** small

### Finding 51
- **What:** LaTeX download is `.tex` but lacks preamble; won't compile in pdflatex.
- **Where:** `artifact-panel.tsx:558`.
- **Impact:** User expects compilable file, gets a fragment.
- **Fix:** Wrap in `\documentclass{article}\begin{document}...\end{document}` on download, or rename extension and warn.
- **Effort:** small

### Finding 52
- **What:** Sheet download always writes `export.csv`, ignoring artifact title.
- **Where:** `sheet-renderer.tsx:102`.
- **Impact:** Multiple downloads collide.
- **Fix:** Use slugified artifact title.
- **Effort:** small

---

## 5. Low Priority

### Finding 53
- **What:** `application/code` path rewraps content in ``` fence; content containing triple-backticks breaks highlighting.
- **Where:** `artifact-renderer.tsx:107-112`.
- **Impact:** Broken highlighting for code embedding triple-backticks.
- **Fix:** Dynamic fence length (use `~~~` longer than any inside).
- **Effort:** small

### Finding 54
- **What:** HTML prompt demands Inter font link but renderer doesn't auto-inject it.
- **Where:** `html.ts:12` rule; `html-renderer.tsx:31-60` only injects Tailwind.
- **Impact:** Ugly default if LLM forgets.
- **Fix:** Auto-inject Inter link alongside Tailwind.
- **Effort:** small

### Finding 55
- **What:** Mermaid renderer re-parses on every theme toggle even if content didn't change.
- **Where:** `mermaid-renderer.tsx:21-77`.
- **Impact:** Minor latency.
- **Fix:** Memoize parsed content hash.
- **Effort:** small

### Finding 56
- **What:** LaTeX paragraph collection collapses multi-line text into single-space joined paragraphs.
- **Where:** `latex-renderer.tsx:326-334`.
- **Impact:** Minor formatting loss.
- **Fix:** Preserve paragraph breaks.
- **Effort:** small

### Finding 57
- **What:** HTML partial-wrap injection lacks `lang="en"`.
- **Where:** `html-renderer.tsx:46-59`.
- **Impact:** A11y lint warning.
- **Fix:** Add `lang="en"`.
- **Effort:** small

### Finding 58
- **What:** React preprocessor template-literal masking regex fails on nested/escaped backticks.
- **Where:** `react-renderer.tsx:39-42`.
- **Impact:** Rare code mangling.
- **Fix:** Proper tokenizer or rely on babel.
- **Effort:** medium

### Finding 59
- **What:** Code prompt insists on Shiki canonical lowercase names but doesn't map to extensions (paired with Finding 50).
- **Where:** `code.ts:12`.
- **Impact:** Paired with Finding 50.
- **Fix:** Central mapping.
- **Effort:** small

### Finding 60
- **What:** Edit mode button always shown for sheet artifacts — raw CSV editing in a textarea is hostile.
- **Where:** `artifact-panel.tsx:504-518`.
- **Impact:** Bad UX for sheets.
- **Fix:** Per-type editor (grid for sheet, JSON tree for slides).
- **Effort:** large

### Finding 61
- **What:** Artifact indicator has no preview thumbnail.
- **Where:** `artifact-indicator.tsx:25-47`.
- **Impact:** Hard to disambiguate artifacts in long chats.
- **Fix:** Tiny preview.
- **Effort:** medium

### Finding 62
- **What:** CSV parser trims every field, losing leading/trailing whitespace intentionally present.
- **Where:** `sheet-renderer.tsx:221,225,235` and validator `_validate-artifact.ts:80,84,94`.
- **Impact:** Minor data-fidelity loss.
- **Fix:** Don't trim; trim only on display.
- **Effort:** small

### Finding 63
- **What:** Python prompt's available-packages list is not kept in sync with Pyodide.
- **Where:** `python.ts:13`.
- **Impact:** Drift as Pyodide evolves.
- **Fix:** Test that asserts documented packages exist.
- **Effort:** small

### Finding 64
- **What:** HTML and React nav blockers both allow `window.open` to silently return `null`, which some SPAs interpret as success and fail later.
- **Where:** `html-renderer.tsx:24` and `react-renderer.tsx:244`.
- **Impact:** Subtle bugs when LLM code does `window.open(...).focus()`.
- **Fix:** Return a stub window object with no-op methods instead of `null`.
- **Effort:** small

---

## 6. Missing Capabilities

### Finding 65
- **What:** No shareable public artifact URL.
- **Where:** No `/artifacts/<id>` public route.
- **Impact:** Can't share work outside tenant; Claude.ai has this.
- **Fix:** Signed-URL public view with per-artifact visibility flag on `Document`.
- **Effort:** large

### Finding 66
- **What:** No fork/clone of an existing artifact.
- **Where:** `artifact-panel.tsx` copy copies content, not the row.
- **Impact:** Can't branch versions.
- **Fix:** "Fork" action calling `create_artifact` with same content, new ID.
- **Effort:** small

### Finding 67
- **What:** No multi-artifact side-by-side view.
- **Where:** `chat-workspace.tsx` — single panel.
- **Impact:** Can't compare two components.
- **Fix:** Tab bar of open artifacts inside the panel.
- **Effort:** medium

### Finding 68
- **What:** No cross-artifact references (A imports B).
- **Where:** n/a.
- **Impact:** Multi-file projects impossible.
- **Fix:** Virtual filesystem in iframe; resolve `@/` to other artifacts.
- **Effort:** large

### Finding 69
- **What:** No dark-mode theme for HTML/React artifacts.
- **Where:** iframe templates hardcode light.
- **Impact:** Dark app + light artifact looks janky.
- **Fix:** Inject `class="dark"` when app theme is dark; document in prompts.
- **Effort:** small

### Finding 70
- **What:** No devtools/console panel.
- **Where:** Renderers capture errors but not `console.log`.
- **Impact:** Debugging LLM code requires browser devtools.
- **Fix:** Override `console.*` in iframe, stream to a dev drawer.
- **Effort:** medium

### Finding 71
- **What:** No real-time collaboration / presence on artifacts.
- **Where:** n/a.
- **Impact:** Claude.ai projects have cursor presence.
- **Fix:** Use existing Socket.io infra; per-artifact room.
- **Effort:** large

### Finding 72
- **What:** Python output panel has `max-h-[300px]` — no fullscreen expansion.
- **Where:** `python-renderer.tsx:243`.
- **Impact:** Long output cut off even in fullscreen.
- **Fix:** Responsive max-height.
- **Effort:** small

### Finding 73
- **What:** No resize handle between chat and artifact panel.
- **Where:** Likely `chat-workspace.tsx`.
- **Impact:** Fixed width frustrates wide/narrow screens.
- **Fix:** `react-resizable-panels`.
- **Effort:** small

### Finding 74
- **What:** No artifact search across a session.
- **Where:** n/a.
- **Impact:** Long sessions accumulate untrackable artifacts.
- **Fix:** Searchable dropdown in chat header.
- **Effort:** small

### Finding 75
- **What:** No multi-artifact bundle export (ZIP).
- **Where:** n/a.
- **Impact:** Hand-assembling projects from chat output is tedious.
- **Fix:** `GET /api/.../artifacts/bundle.zip`.
- **Effort:** medium

### Finding 76
- **What:** No PDF export for slides (only PPTX).
- **Where:** `slides-renderer.tsx:77-93`.
- **Impact:** PDF is more universal.
- **Fix:** `generatePdf` alongside `generatePptx`.
- **Effort:** medium

### Finding 77
- **What:** No "publish to web" for HTML artifacts.
- **Where:** n/a.
- **Impact:** Build-a-site workflow ends at preview.
- **Fix:** Opt-in public S3 policy per artifact.
- **Effort:** medium

### Finding 78
- **What:** No ownership/visibility check audit on artifact PATCH endpoint.
- **Where:** `artifact-panel.tsx:213-221` calls PATCH scoped only by session.
- **Impact:** Potential cross-user clobbering if route doesn't verify membership.
- **Fix:** Audit and enforce session ownership in the thin route handler.
- **Effort:** small

### Finding 79
- **What:** No "ask about this artifact" chat shortcut.
- **Where:** n/a.
- **Impact:** Users copy-paste to ask questions about a specific artifact.
- **Fix:** Button that seeds chat with artifact reference.
- **Effort:** small

### Finding 80
- **What:** No artifact templates / starters library.
- **Where:** n/a.
- **Impact:** Every artifact starts from scratch via prompt.
- **Fix:** Starter templates picker that seeds `create_artifact` with known-good content.
- **Effort:** medium
