# Artifact System — Deepscan Rescan Findings

> **Date:** 2026-04-25 (post-Priority-C, pinned to merge `f0264f8`)
> **Method:** 5 parallel `feature-dev:code-explorer` agents read every byte of
> the relevant source files with explicit instructions to surface
> **inconsistencies, hidden contracts, prompt-vs-validator drift, dead code,
> and possible bugs**.
>
> **Purpose:** distinguish genuinely new issues from items already in the
> 2026-04-25 audit. The original audit (and the Priority-A/B/C fixes that
> shipped from it) was hypothesis-driven. This rescan was open-ended and
> produced a different category of findings: things that pass review casually
> but are wrong on close reading.
>
> **Status:** none of the items below are shipped — this is a backlog, not a
> changelog. Companion docs (deepscan / architecture-reference / capabilities)
> describe the system as it is; this file describes what should still change.

---

## TL;DR — what's new since the audit

The audit found 31 issues in the artifact system itself. This rescan adds
~50 more, in five categories that the original audit did not really probe:

1. **Cross-tool / API consistency** — `update_artifact` vs `create_artifact`,
   service-path vs LLM-tool path, manual-edit vs LLM RAG indexing.
2. **Prompt-vs-validator drift** — places where the LLM is told one rule and
   the validator enforces a different one.
3. **Schema-vs-renderer drift** — DocumentAst fields the schema accepts that
   `to-docx.ts` silently ignores.
4. **Sandbox / postMessage hardening** — uneven iframe sandbox flags and one
   missing origin guard.
5. **Streaming UX edge cases** — what happens to a partially-streamed
   artifact when the validator rejects the final tool output.

Top items to consider shipping (high confidence, low scope):

- **N-2** Streaming `update_artifact` placeholder is left dirty on validation
  failure (`chat-workspace.tsx`). Real bug, observable user impact.
- **N-3** Manual artifact edit (HTTP PUT) does not re-index RAG. Stale
  search results after panel edits.
- **N-4** Versioned S3 keys leak on **session** delete (single-artifact
  delete cleans them; session delete misses them).
- **N-5** `createDashboardMessages` upsert can silently steal a message from
  another session by id (no cross-session ownership check).
- **N-6** R3F renderer postMessage handler missing origin guard (only
  renderer without it).
- **N-7** `update_artifact.canvas-mode` lock silently bypassed when
  `existing.artifactType` is null.
- **N-9** Slides keyboard handler is **global at `window` level** with
  `preventDefault` — arrow keys in unrelated text inputs trigger slide nav.

---

## A. Cross-path / cross-tool inconsistencies

### N-1. Manual-edit (service path) does NOT re-index RAG

**Where:** `src/features/conversations/sessions/service.ts:431-567`
(`updateDashboardChatSessionArtifact`)

**Observed:** `update-artifact.ts` (LLM tool) calls
`indexArtifactContent(id, ..., { isUpdate: true })` after every successful
write. The HTTP PUT path (`updateDashboardChatSessionArtifact`) does not.

**Impact:** when a user manually edits an artifact in the panel,
`knowledge_search` continues to return the old content until the next
LLM-driven update of the same artifact. RAG drift is silent.

**Fix sketch:** mirror the `indexArtifactContent(...).catch(...)`
fire-and-forget call in the service path immediately after the locked update
succeeds.

---

### N-2. Streaming `update_artifact` leaves a dirty artifact on validation failure

**Where:** `src/features/conversations/components/chat/chat-workspace.tsx`
~lines 2144-2234

**Observed:** the `tool-input-available` handler calls `addOrUpdateArtifact`
with `id = out.id` (the real artifact id) using the partial streamed
content. If the subsequent `tool-output-available` carries an error
(validation failure, missing artifact, concurrent-update), the code only
emits `console.warn` — it never reverts the artifact's in-memory content
back to the pre-stream state.

**Impact:** the user sees a partially-streamed (and invalid) artifact locked
in place with no UI signal. The "Generating..." title may even persist.

**Fix sketch:** snapshot the pre-stream artifact state on `tool-input-available`,
restore it on error in `tool-output-available`. Or refuse to apply
`tool-input-available` for `update_artifact` (only stream `create_artifact`).

---

### N-3. `out.updated` gate silently drops legitimate updates when the artifact isn't in the local map

**Where:** `chat-workspace.tsx:2210-2220`

**Observed:** the gate is `if (out.id && out.content && out.updated) { const existing = artifacts.get(out.id); if (existing) addOrUpdateArtifact(...) }`.
If `existing` is undefined (race: hard refresh while a tool call is in
flight, or `loadFromPersisted` hasn't resolved), the update is silently
discarded. The LLM and DB believe the update succeeded; the client never
applies it.

**Impact:** rare but real divergence between server and client state. No
toast, no console warning.

**Fix sketch:** when `existing` is missing, call `addOrUpdateArtifact` with
the full new shape (treat it as a refresh). Or fetch the artifact and then
apply.

---

### N-4. Streaming abort leaves the placeholder forever

**Where:** `chat-workspace.tsx` `handleStop()` ~line 2567-2570 and the
catch block at ~2411-2451

**Observed:** if the user aborts after `tool-input-available` fires but
before `tool-output-available`, the `streaming-${toolCallId}` placeholder
stays in the `artifacts` map forever (the catch block removes the assistant
message but does NOT call `removeArtifact("streaming-${toolCallId}")`).

**Impact:** user sees a persistent "Generating..." card that will never
resolve. Only a session reload clears it.

**Fix sketch:** in the abort path, scan the `artifacts` map for ids that
start with `streaming-` and remove them.

---

### N-5. `createDashboardMessages` upsert can steal a message between sessions

**Where:** `src/features/conversations/sessions/repository.ts:71-105`

**Observed:** the upsert keys on `id` only. If a client posts a `message.id`
that already exists in a *different* session, the update branch overwrites
that message's `sessionId` with the current session, effectively moving it.

**Impact:** with a guessable message id (or a client bug) one user could
move messages out of another user's session. The session-ownership check is
applied to the destination session, not the source.

**Fix sketch:** in the update branch of the upsert, add `where: { id, sessionId }`
or do an explicit `findFirst` and refuse if a message with that id exists in
another session.

---

### N-6. `createDashboardChatSession` doesn't verify `assistantId` org membership

**Where:** `service.ts:185-212`

**Observed:** the request takes `assistantId` from the body and never
validates that the caller has access to the assistant. The session list
scopes by `userId`, so cross-org sessions are invisible to the legitimate
owner of the assistant — but the assistantId reference itself is unbounded.

**Impact:** a curious user could create sessions bound to assistants from
arbitrary other orgs (knowing the cuid). They couldn't read the assistant's
tools/knowledge — that's gated elsewhere — but they could populate `messages`
on the session.

**Fix sketch:** validate `assistantId` belongs to the caller's org membership
before creating the session.

---

### N-7. `update-artifact` canvas-mode check skipped when stored `artifactType` is null

**Where:** `src/lib/tools/builtin/update-artifact.ts:89-107`

**Observed:** the guard is
```ts
if (canvasMode && canvasMode !== "auto" && existing.artifactType && canvasMode !== existing.artifactType) { ... }
```
The `existing.artifactType &&` short-circuit means: if the stored artifact
has `artifactType === null` (legacy or accidental), any canvas-mode passes
unchecked.

**Impact:** an LLM in canvas-mode could update a non-typed Document via
`update_artifact` regardless of mode. Edge case, but defeats the gate.

**Fix sketch:** treat null `artifactType` as "any canvas mode mismatches" —
or refuse to update untyped documents through this tool.

---

### N-8. `update_artifact` returns `title: undefined` when `title` not provided

**Where:** `update-artifact.ts:247-255`

**Observed:** the success path returns `{ id, title: newTitle, content, updated, persisted }`.
When the LLM omits `title`, `newTitle` is `undefined`, so the field
serializes to JSON-absent. Downstream consumers (the LLM itself, the chat
workspace handler at `chat-workspace.tsx:2218`) cannot read the artifact's
actual current title from the tool result.

**Impact:** the LLM may believe the title was cleared. Chat-workspace's
`addOrUpdateArtifact` call uses `title: out.title || existing.title` style
guards — but the propagated value across the wire is structurally wrong.

**Fix sketch:** populate `title: newTitle ?? existing.title` in every return
path in `update-artifact.ts`.

---

### N-9. `update_artifact` persistence error returns `updated: true, persisted: false`

**Where:** `update-artifact.ts:242-255`

**Observed:** the catch block sets `persisted = false` then **falls through
to the success return** which says `updated: true`. The LLM (and any chat
UI) sees `updated: true` even though Prisma + S3 didn't write.

**Impact:** misleading tool result. The LLM won't retry; the chat UI's
`out.updated` gate fires and applies in-memory state that diverges from
storage.

**Fix sketch:** in the catch, return `{ updated: false, persisted: false, error }`
explicitly.

---

### N-10. `validationWarnings` stored at different metadata levels by create vs update

**Where:** `create-artifact.ts:159-164` vs `update-artifact.ts:212-218`

**Observed:** create stores warnings as a sibling of `artifactLanguage`;
update stores them as a sibling of `versions`. Same key name, different
parent path within `metadata`.

**Impact:** any future code that reads `metadata.validationWarnings` works
on both shapes by accident, but the inconsistency is fragile and any
schema-aware reader (TypeScript Prisma types, JSON schema) would break.

**Fix sketch:** standardize on one location (top-level
`metadata.validationWarnings`).

---

### N-11. Canvas-mode error shape diverges between create and update tools

**Where:** `create-artifact.ts:81` vs `update-artifact.ts:103`

**Observed:** both return `validationErrors: [...]` but the wording is
different — `"Wrong artifact type: expected X, got Y"` vs
`"Canvas-mode mismatch: expected X, artifact is Y"`. The retry-loop signal
the LLM keys off would benefit from a shared formatter.

---

### N-12. `update-artifact` lacks `language` and `type` parameters

**Where:** `update-artifact.ts:33-44`

**Observed:** `update_artifact` cannot change a code artifact's `language`
(rendering language switches Shiki highlighting + download extension), and
cannot promote a `text/markdown` to `text/document`.

**Impact:** to change either, the LLM has to delete and re-create. Not a
bug, but a documented behavioral gap that LLM authors don't know.

**Fix sketch:** add optional `language` and `type` parameters; if changed,
re-validate against the new type and rewrite the metadata.

---

## B. Prompt-vs-validator drift

### N-13. HTML inline `<style>` cap drift

**Prompt** (`prompts/artifacts/html.ts:78`): "≤ 10 lines"
**Validator** (`_validate-artifact.ts:51`): `MAX_INLINE_STYLE_LINES = 10`,
but the test at `validate-artifact.test.ts:87-96` triggers the warning at
**15** lines.

The prompt forbids more than 10 lines; the validator only warns when the
count crosses some higher threshold. So 11–14 lines satisfy the validator
but violate the prompt rule.

**Fix sketch:** either tighten the validator threshold to 10 or relax the
prompt to "≤ 15 lines."

---

### N-14. Mermaid theme-override directive: prompt forbids, validator allows

**Prompt** (`prompts/artifacts/mermaid.ts`): "Do NOT override theme with
`%%{init: {'theme':'...'}}%%` — breaks dark-mode toggle."
**Validator** (`_validate-artifact.ts:1490` warning) — actually emits a
warning, but a test at `validate-artifact.test.ts:347-350` shows
`%%{init: {'theme':'default'}}%%` is accepted with `r.ok === true`. The
warning fires only when the regex `/%%\{\s*init\s*:[\s\S]*?theme[\s\S]*?\}%%/`
matches; a slightly different syntax would skip the warning.

**Impact:** silent dark-mode breakage on certain init directive shapes.

**Fix sketch:** broaden the regex to match any `%%{init:...}%%` block, or
upgrade to a hard error.

---

### N-15. Slides' inline `validMermaidStarts` list is a strict subset of the global one — and missing `stateDiagram-v2`

**Where:** `_validate-artifact.ts:364` (slides) vs `_validate-artifact.ts:1372`
(`MERMAID_DIAGRAM_TYPES`)

**Observed:** the slides validator's inline list of valid diagram-start
keywords lacks `stateDiagram-v2`. The mermaid validator accepts it. So a
slide that uses `stateDiagram-v2` syntax in its `diagram` field gets a
"diagram may be invalid" warning even though the renderer would handle it.

**Fix sketch:** extract a shared `MERMAID_DIAGRAM_TYPES` constant and import
into both places.

---

### N-16. Mermaid validator whitelist misses Mermaid v10/v11 diagram types

**Where:** `_validate-artifact.ts:1372` `MERMAID_DIAGRAM_TYPES` and
`src/lib/document-ast/validate.ts:19-24`

**Observed:** `xychart-beta`, `block-beta`, `packet-beta`, `kanban` (added in
recent Mermaid releases) are not in the whitelist. A document/diagram using
them fails validation even though the underlying renderer handles them.

**Fix sketch:** add the missing types and audit on next Mermaid upgrade.

---

### N-17. `text/markdown` and `text/document` share the label "Document"

**Where:** `prompts/artifacts/markdown.ts` and `prompts/artifacts/document.ts`

**Observed:** both prompt summary modules set `label: "Document"`. The UI
canvas-mode menu and the panel chrome show the same label twice. The user
has to read the longer description to differentiate.

**Fix sketch:** change `text/markdown` label to "Markdown" — there's a
`shortLabel: "Markdown"` already in the registry, but the prompt module's
`label` is what the prompt-context dispatcher emits. Two different labels
for two display surfaces.

---

## C. Schema-vs-implementation drift (DocumentAst)

### N-18. `tab.leader: "dot"` silently dropped in DOCX export

**Where:** `src/lib/document-ast/to-docx.ts:121` (`renderInline` tab branch)

**Observed:** the schema (`schema.ts`) defines `tab.leader: "none" | "dot"`.
The example `letter.ts:143` uses `leader: "dot"` to produce a dot leader
between label and value (a standard formal-letter formatting device). The
exporter renders all tabs as `new TextRun({ text: "\t" })` regardless of
the `leader` value.

**Impact:** generated `.docx` letters lose dot-leader formatting that the
preview would suggest is supported.

**Fix sketch:** map `leader: "dot"` to a `TextRun` with the `text: "\t"`
plus a leading-dot tab stop in the paragraph's tab definitions.

---

### N-19. `list.startAt` ignored

**Where:** `to-docx.ts:396-398` (comment confirms)

**Observed:** the schema accepts `startAt` on ordered lists. The DOCX
exporter always starts at 1, with a comment "DOCX v1 always begins ordered
lists at 1."

**Fix sketch:** either remove `startAt` from the schema (breaking change)
or thread it through to the docx numbering config.

---

### N-20. `table.shading: "striped" | "none"` accepted but not applied

**Where:** `to-docx.ts:445-477` (`renderTable`)

**Observed:** schema permits a table-level `shading` (striped vs none).
`renderTable` reads `cell.shading` (a hex string) but never reads the
table-level `node.shading`.

**Fix sketch:** either use `node.shading === "striped"` to apply
alternating row fill, or drop the field from the schema.

---

### N-21. TOC title rendered twice when `node.title` is set

**Where:** `to-docx.ts:372-385`

**Observed:** when a `toc` block carries a `title`, the exporter emits a
heading paragraph with that text **and** passes the same text as the first
argument to `TableOfContents(node.title, ...)`. Word renders both — the
title appears twice.

**Fix sketch:** either skip the heading paragraph when `node.title` is set
(let `TableOfContents` handle it) or pass an empty string to
`TableOfContents`.

---

### N-22. Bookmark IDs not unique-checked

**Where:** `src/lib/document-ast/validate.ts:114-118`

**Observed:** the validator collects heading `bookmarkId` values into a
`Set` to verify anchors point at known bookmarks, but never checks that no
two headings share the same id.

**Impact:** in DOCX an anchor with duplicate targets resolves to whichever
heading Word picks first. Silent.

**Fix sketch:** when a duplicate is detected, fail validation with the
duplicate id and the line context.

---

### N-23. Footnote nesting unbounded

**Where:** `schema.ts` (no depth guard); `to-docx.ts` and `document-renderer.tsx`
both recurse blindly.

**Observed:** a `footnote` can contain `paragraph`, which can contain
`footnote`, which can contain `paragraph`, etc. Schema allows infinite
depth. The DOCX exporter would either crash or produce malformed output;
the preview would render but may explode in size.

**Fix sketch:** schema-level depth guard (e.g. cap at 1 — no nested
footnotes), or a render-time `maxDepth` parameter.

---

### N-24. `renderChart` has no error guard

**Where:** `to-docx.ts:238-271`

**Observed:** unlike `renderMermaid` (which wraps `mermaidToSvg + svgToPng`
in `try/catch` and emits a placeholder paragraph on failure), `renderChart`
calls `chartToSvg` (synchronous, safe) followed by `svgToPng` (sharp,
throws on malformed SVG / OOM) **with no error handler**. A bad chart input
propagates the rejection out of `astToDocx` and surfaces as a 500 in the
download endpoint.

**Fix sketch:** wrap the `svgToPng(...)` call in `try/catch` and emit the
same italic-grey "[chart failed to render]" placeholder.

---

### N-25. Mermaid validator (document path) drops async-resolver warnings

**Where:** `_validate-artifact.ts:175` (`validateDocument`)

**Observed:** the function returns `{ ok: true, errors: [], warnings: [] }`
on success, hardcoding `warnings: []`. Any advisory output from
`validateDocumentAst` is silently discarded before the LLM sees it.

**Fix sketch:** plumb `v.warnings` into the returned result.

---

### N-26. `validateDocument` doesn't accept `ctx`

**Where:** `_validate-artifact.ts:151` (signature is `(content)` — no `ctx`)

**Observed:** every other validator can take a `ValidationContext`; this
one cannot. There's no path to add `isNew` semantics for documents (e.g.
size cap on creates) without changing the signature.

**Fix sketch:** add the parameter even if unused, for parity with the
other validators.

---

## D. Sandbox / postMessage hardening

### N-27. R3F renderer is the only iframe missing a postMessage origin guard

**Where:** `src/features/conversations/components/chat/artifacts/renderers/r3f-renderer.tsx:531-551`

**Observed:** every other iframe renderer (react, slides, html) checks
`e.source === iframeRef.current?.contentWindow` before trusting the
postMessage. R3F doesn't. Any frame on the page can spoof `r3f-error` /
`r3f-ready` events.

**Fix sketch:** add the same origin guard.

---

### N-28. Slides renderer uses `sandbox="allow-scripts allow-same-origin"`

**Where:** `slides-renderer.tsx`

**Observed:** `allow-same-origin` combined with `allow-scripts` removes
most sandboxing protection (the iframe gets parent origin's cookies and
can talk to the parent's localStorage). Slides content is LLM-generated,
so this is a meaningful gap vs the html-renderer (`allow-scripts allow-modals`)
and react-renderer (`allow-scripts` only).

**Fix sketch:** drop `allow-same-origin` and verify the slides
postMessage protocol still works through the bridge.

---

### N-29. R3F renderer has NO sandbox attribute

**Where:** `r3f-renderer.tsx:567` with comment `"WebGL requires full GPU access which sandboxed iframes block in some browsers"`

**Observed:** documented intentional choice. Worth flagging in the
deepscan as a known weakness; LLM-generated R3F code runs unsandboxed.

**Fix sketch:** investigate `allow-scripts` only — recent Chromium permits
WebGL with that flag in most contexts.

---

### N-30. LaTeX renderer sets `trust: true` in KaTeX

**Where:** `latex-renderer.tsx`

**Observed:** combined with `dangerouslySetInnerHTML`, this enables
`\href{javascript:...}` payloads from LLM output to land as live links.

**Fix sketch:** pass a `trust` callback that whitelists `https?://`
schemes only.

---

### N-31. All iframe→parent postMessages target `'*'` origin

**Where:** the iframe templates inside `react-renderer.tsx`, `slides-renderer.tsx`
(via the slides HTML builder), `r3f-renderer.tsx`

**Observed:** every iframe sends with `parent.postMessage(payload, '*')`.
The parent has guards on `e.source` (most renderers), so spoofing into the
parent is blocked, but if an embed pulls in another iframe that proxies
events, the contents would be readable.

**Fix sketch:** use `window.location.origin` as the target origin in iframe
templates.

---

## E. Streaming UX / state-machine edges

### N-32. Edits silently discarded when LLM updates artifact mid-edit

**Where:** `artifact-panel.tsx:121-124, 113-119`

**Observed:** if the user is editing the code tab and the LLM produces a
new version of the same artifact, `artifact.version` increments,
`viewingVersionIdx` resets to null, the edit-content effect reinitializes
`editContent` to the new content. The orange "dirty" dot disappears
without saving. No confirmation prompt.

**Fix sketch:** when entering the edit-content reinit and `isDirty` is
true, prompt the user (or queue the new content separately).

---

### N-33. `handleRestoreVersion` is optimistic, `handleSave` is not

**Where:** `artifact-panel.tsx`

**Observed:** the two mutation paths have opposite ordering. Restore
updates memory first, then `await fetch(...)`; on rejection only
`console.error` fires. Save waits for API confirmation before updating
memory. Failed restore leaves the panel showing content the server rejected.

**Fix sketch:** make both pessimistic (await first), and surface restore
errors via the same `saveError` banner.

---

### N-34. `handleDelete` ignores API response status

**Where:** `artifact-panel.tsx:452-463`

**Observed:** `await fetch(...)` is called but the response status is never
checked. If the server returns 404 or 500, the artifact is still removed
from the UI (`onDeleteArtifact` + `onClose` are called unconditionally
after the fetch).

**Fix sketch:** branch on `response.ok`.

---

### N-35. Sheet renderer state not reset on content update

**Where:** `sheet-renderer.tsx`

**Observed:** `sorting`, `globalFilter`, `activeSheet`, `selectedRef` all
persist across `content` prop changes. If an LLM revises a spreadsheet
(reducing sheet count, changing columns), stale sort state on dead column
keys silently no-ops; `activeSheet` may point at an undefined sheet.

**Fix sketch:** `useEffect([content])` to reset table state.

---

### N-36. Slides keyboard handler is global at `window` level

**Where:** `slides-renderer.tsx:66-78`

**Observed:** `window.addEventListener("keydown", ...)` captures arrow
keys regardless of focus and calls `e.preventDefault()`. Arrow keys in an
unrelated text input (e.g. the chat composer) would navigate slides AND
fail to move the input cursor.

**Fix sketch:** scope the listener to the iframe / panel root, or guard on
`document.activeElement`.

---

### N-37. R3F 20-second timeout race on rapid content change

**Where:** `r3f-renderer.tsx:530`

**Observed:** the timeout effect has `[content]` deps. On content change,
the old `r3f-ready` event could land in the new closure where `didReady`
is `false`; a false-positive timeout error appears.

**Fix sketch:** track `didReady` in a `useRef` rather than a `let` inside
the effect closure.

---

### N-38. `application/code` downloads as `.txt` if `language` not set

**Where:** registry default + `getExtension` in `artifact-panel.tsx`

**Observed:** the registry's `extension: ".txt"` for `application/code`
applies when `artifact.language` is missing. An `application/code` artifact
without a language downloads as `.txt`.

**Fix sketch:** treat missing language as a hard fallback to a more
specific extension (e.g. fall back to nothing, force the user to set
language).

---

## F. Miscellaneous

### N-39. `updateDashboardArtifactById` (unlocked variant) is dead code

**Where:** `repository.ts:152-168`

**Observed:** exported but no caller in the service or anywhere else.
Pre-Priority-A code presumably used it; now everyone goes through the
locked variant.

**Fix sketch:** delete the export.

---

### N-40. `mimeType` selected by repository but dropped by `formatArtifact`

**Where:** `repository.ts:46` selects it; `service.ts:156-170` drops it.

**Observed:** `DashboardChatSessionArtifact` has no `mimeType` field. Every
session load fetches the column and discards the value.

**Fix sketch:** stop selecting it (or expose it on the wire shape if a UI
consumer wants it).

---

### N-41. POST/PATCH `/sessions` silently pass `undefined` to service on Zod failure

**Where:** `app/api/dashboard/chat/sessions/route.ts:35`,
`app/api/dashboard/chat/sessions/[id]/route.ts:61`

**Observed:** `parsedBody.success === false` is ignored; `parsedBody.data`
(which is `undefined`) is passed to the service. The service recovers via
internal checks but the actual Zod errors never reach the caller.

**Fix sketch:** return 400 with `parsedBody.error.format()` when
`!parsedBody.success`.

---

### N-42. Download route returns `409` for "Invalid document AST"

**Where:** `app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts`

**Observed:** the docx download path JSON-parses content as
`DocumentAstSchema` and returns 409 on parse failure. 409 is "conflict";
422 ("unprocessable entity") would be semantically correct.

**Fix sketch:** change to 422.

---

### N-43. `application/slides` saves as `.pptx` though content is JSON

**Where:** registry `extension: ".pptx"`

**Observed:** the canonical S3 key ends in `.pptx` (and the `mimeType`
recorded is `text/plain`). Anyone browsing the bucket sees a misleading
extension.

**Fix sketch:** save as `.json` and reserve `.pptx` for the on-the-fly
export path.

---

### N-44. `DashboardSession.userId` has no FK to User

**Where:** `prisma/schema.prisma`

**Observed:** loose-reference column. User deletion does not cascade.

**Fix sketch:** add the relation; backfill orphaned rows; add cascade.

---

### N-45. `uploadFile` always generates a presigned URL that's never used

**Where:** `lib/s3/index.ts:151`

**Observed:** every `uploadFile` call also produces a presigned URL via
`getPresignedDownloadUrl` and packages it in the return value. None of the
artifact paths use it. One unnecessary S3 round-trip per write.

**Fix sketch:** make `getPresignedDownloadUrl` opt-in via a parameter.

---

### N-46. `deleteFiles` ignores per-object `Errors[]` from S3 response

**Where:** `lib/s3/index.ts:286-293`

**Observed:** `DeleteObjectsCommand` returns per-object errors in the
response body. The implementation only throws on transport/SDK errors and
silently discards per-object failures.

**Fix sketch:** inspect `response.Errors` and log/aggregate them.

---

### N-47. Versioned S3 keys leak on **session** delete

**Where:** `service.ts:273-291` (session delete) calls
`findArtifactsBySessionId` which selects only `{ id, s3Key }` — not
`metadata.versions[].s3Key`.

**Observed:** the single-artifact delete path correctly cleans versioned
keys (`service.ts:619-634`), but session delete does not. Every artifact
that was ever updated leaks up to 20 versioned S3 objects when its session
is deleted.

**Fix sketch:** include `metadata` in the select; flatten `metadata.versions[].s3Key`
into the bulk-delete batch.

---

### N-48. Session delete is not atomic

**Where:** `service.ts:273-291`

**Observed:** the sequence is fetch artifacts → delete S3 → delete RAG →
`deleteArtifactsBySessionId` → `deleteDashboardSessionById`. No transaction
wraps steps 4 and 5. A partial failure leaves Document rows deleted but
the session row alive.

**Fix sketch:** wrap steps 4+5 in `prisma.$transaction`.

---

### N-49. `storeChunks` does N sequential SurrealDB inserts

**Where:** `lib/rag/vector-store.ts:504-541`

**Observed:** `for (const chunk of chunks) { await db.create(...) }`. For a
128 KiB artifact, ~140 chunks → ~140 sequential round-trips. Noticeable
indexing latency.

**Fix sketch:** batch inserts (SurrealDB supports `INSERT INTO ... VALUES (...), (...)`),
or use `Promise.all` with bounded concurrency.

---

### N-50. Topological sort is O(n²) in formula count

**Where:** `lib/spreadsheet/formulas.ts:147-168`

**Observed:** capped at 200 formulas → ~40k iterations (negligible in
practice). But the cap is in `parseSpec`, not `evaluateWorkbook` —
synthetic specs that bypass the parser would hit the quadratic.

**Fix sketch:** Kahn's algorithm with an in-degree map (linear).

---

### N-51. `onCell` collapses upstream errors to `FormulaError.REF`

**Where:** `lib/spreadsheet/formulas.ts:183-188`

**Observed:** if a dependency cell has any error type (`#VALUE!`, `#NAME?`,
`#DIV/0!`), the dependent throws `FormulaError.REF`. Dependents see
`#REF!` even when the root cause was different.

**Fix sketch:** preserve the original error type through the chain.

---

### N-52. `client/svg-to-png.ts:75` uses deprecated `source.unsplash.com`

**Where:** `lib/rendering/client/svg-to-png.ts:75`
(`fetchImageAsBase64`)

**Observed:** the function constructs `https://source.unsplash.com/1600x900/?${keyword}`.
Unsplash retired this redirect API. PPTX exports that hit this path for
`unsplash:` URLs silently return null.

**Fix sketch:** route through the same `resolveQueries` resolver as HTML
and slides.

---

### N-53. Client mermaid → PNG path always uses light theme

**Where:** `lib/rendering/client/mermaid-to-png.ts`

**Observed:** imports `MERMAID_INIT_OPTIONS` directly (always light theme).
`getMermaidInitOptions(theme)` factory exists but is never called on this
path. Dark-mode users get light-theme mermaid in their PPTX exports.

**Fix sketch:** import the factory and pass the resolved theme.

---

### N-54. Two separate mermaid init paths share the global singleton

**Where:** `mermaid-renderer.tsx` (uses `getMermaidConfig()` from
`renderers/mermaid-config.ts`) vs `document-renderer.tsx` MermaidPreviewBlock
(uses `getMermaidInitOptions()` from `lib/rendering/mermaid-theme`)

**Observed:** mermaid is a global singleton; whichever file calls
`mermaid.initialize` last wins for the next render. Race conditions are
possible when a document preview re-renders during a standalone diagram
render or vice versa.

**Fix sketch:** consolidate to one init path with the shared config.

---

### N-55. `VALIDATE_TIMEOUT_MS` is `export let` mutable global

**Where:** `_validate-artifact.ts:103, 106`

**Observed:** the variable is mutable and the test hook
`__setValidateTimeoutMsForTesting(ms)` writes to it. In a server with
shared module state, accidentally calling the hook (from a leaked test
import or runtime) shifts the budget for all in-flight validations.

**Fix sketch:** keep the test hook but freeze the value otherwise; or
thread the budget through the `ctx` instead of via module global.

---

### N-56. `fixtures.test.ts` may be testing a Promise instead of resolved values

**Where:** `tests/unit/react-artifact/fixtures.test.ts:29`

**Observed:** `const result = validateArtifactContent("application/react", content)`
without `await`. The function is async (returns `Promise<ArtifactValidationResult>`).
`result.errors` is `undefined`, `result.ok` is `undefined`. Any truthy
assertion on the Promise object passes vacuously.

**Fix sketch:** add `await`. This explains some/most of the 7 pre-existing
failures in this file — they may be testing different behavior than
expected.

---

### N-57. Code validator size warning uses `.length` (chars), not `Buffer.byteLength` (bytes)

**Where:** `_validate-artifact.ts:1353`

**Observed:** the warning fires when `content.length > 512 * 1024`. The
hard size cap in `create-artifact.ts:49` correctly uses `Buffer.byteLength`.
For UTF-8 multibyte content (CJK, emoji), `.length` underestimates byte
size — an artifact may pass the warning check but fail the byte cap.

**Fix sketch:** use `Buffer.byteLength` here too.

---

### N-58. `ENABLED = true` hardcoded constant in `unsplash/index.ts:11`

**Where:** `lib/unsplash/index.ts:11`

**Observed:** appears to be a kill-switch but isn't bound to any env var.
Toggling requires editing source.

**Fix sketch:** delete it (always-true) or bind to `process.env.UNSPLASH_DISABLED`.

---

## G. Test coverage gaps

The current test suite covers about 70% of the validator surface and 30%
of the cross-tool / chat-workspace integration surface. Concrete missing
tests:

1. **N-32 streaming dirty state** — `update_artifact` validates AFTER
   streaming partial → revert behavior.
2. **N-3 gate when artifact not in map** — silent discard.
3. **N-4 abort during streaming leaves placeholder** — no cleanup test.
4. **canvasMode sessionStorage roundtrip** — hydration isn't tested.
5. **N-14 mermaid theme-override** — current tests assert it's *accepted*;
   should assert a warning fires.
6. **Slides visual layouts** — `comparison`, `features`, `stats`, `gallery`,
   `diagram`, `image`, `chart` (and the `*-content` split variants) have no
   dedicated validation tests.
7. **HTML `unsplash:` in CSS / JS** — prompt forbids; no validator test.
8. **N-7 canvas-mode bypass with null artifactType** — no test.
9. **Document mermaid/chart blocks** — `text/document` AST validator only
   smoke-tested.
10. **N-56 fixtures.test.ts await fix** — once awaited, the 7 pre-existing
    failures may need actual fixing.

---

## Prioritization sketch (suggestion, not a plan)

If we revisit any of these in a Priority E batch, the rough ranking would be:

**Tier 1 — confirmed bugs with user-visible impact, low scope (≤ 30 LoC):**
- N-2, N-3, N-4, N-7, N-21, N-24, N-27, N-32, N-33, N-34, N-42, N-47

**Tier 2 — drift / hygiene / hidden contracts, medium scope (~50–100 LoC):**
- N-1, N-5, N-9, N-10, N-13, N-14, N-15, N-16, N-17, N-25, N-28, N-30,
  N-35, N-36, N-37, N-38, N-48, N-52, N-53, N-54, N-55, N-56, N-57

**Tier 3 — deletes / cosmetic / API hygiene:**
- N-6, N-8, N-11, N-12, N-18, N-19, N-20, N-22, N-23, N-26, N-29, N-31,
  N-39, N-40, N-41, N-43, N-44, N-45, N-46, N-49, N-50, N-51, N-58

**Tier 4 — behavior tests to add:**
- All entries in Section G.

This is a backlog. Nothing is committed. The user / team picks what to
ship.
