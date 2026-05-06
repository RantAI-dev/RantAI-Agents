# `application/code` toolbar redesign — Z (status bar + VS Code search popup)

**Date:** 2026-05-06
**Type:** Spec / design (UX revision of the v1 toolbar)
**Status:** Draft, approved verbally
**Author:** kleopasevan (with Claude)
**Supersedes the toolbar in:** `docs/superpowers/specs/2026-05-06-code-artifact-redesign-design.md` §4.2 — the dedicated toolbar strip described there is removed; controls relocate per this spec.

## 1. Why

The v1 implementation landed a dedicated toolbar strip (language pill + wrap/search/diff buttons) above the code body. User feedback after seeing it live:

> "I dont like how you make the UI now it looks dull, for the toolbar (that has search code), i dont think that good for the UI."

Specifically, the structure is wrong (b in the brainstorm options): a separate chrome row above the body adds visual weight without earning it, and the search-bar slide-out makes the panel three rows of chrome (header → toolbar → search → body). Even with polish, three rows is too much.

This redesign removes the toolbar strip entirely and relocates each control where it serves the user best:
- **Diff toggle** moves into the panel header as a coloured pill (state-revealing, always-visible).
- **Wrap toggle + search hint** move to a thin bottom status bar (IDE-native pattern).
- **Search itself** becomes a VS Code-style floating popup at the body's top-right corner.
- **Streaming pulse** moves to a small animated dot next to the language pill in the header.
- **Language pill** stays in the panel header (already there in v1).

## 2. Decisions (locked)

| # | Question | Decision |
|---|---|---|
| Q1 | Toolbar strip | **Removed.** No third chrome row. |
| Q2 | Where do wrap/diff/search live? | Diff → header. Wrap → status bar. Search → floating popup + status-bar hint. |
| Q3 | Search discoverability for mouse users | **(b)** subtle `🔍 Ctrl+F` hint in the status bar (clickable). Discovery problem solved without adding a button to the body. |
| Q4 | Search popup style | **VS Code style** — absolutely-positioned floating card at the body's top-right, ~280px wide, `border + shadow + backdrop-blur + rounded`. Closes on Escape or `×`. |
| Q5 | Where does `mode` (source/diff) state live? | **Moves from `CodeRenderer` to `ArtifactPanel`** so the panel-header diff pill can drive it. Renderer accepts `mode` + `onModeChange` as props. |
| Q6 | Streaming pulse | Small animated dot next to the language pill in the panel header. No dedicated streaming pill. |
| Q7 | Diff pill visual | Active+enabled: `bg-purple-500/15 text-purple-500`. Disabled (v1): `bg-muted text-muted-foreground` opacity-50. Pressed (in diff mode): `bg-purple-500/25` filled. |
| Q8 | Status bar visual | `border-t bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground font-mono` — IDE-native subtle grey strip, ~22px tall. Tabular-nums on the line count. |
| Q9 | Search popup entry animation | Translate-Y + opacity fade-in (~150ms). Skip if the codebase doesn't already use Framer Motion (use plain CSS transitions). |

## 3. File map

```
renderers/code/
├── index.ts                  unchanged — barrel re-export
├── code-renderer.tsx         REFACTOR: drop toolbar + search-strip mount; add status-bar + floating-search mount; mode moves to props
├── code-toolbar.tsx          DELETE (and its colocated test)
├── code-toolbar.test.tsx     DELETE
├── code-status-bar.tsx       NEW — bottom strip (line count, encoding, search hint, wrap toggle)
├── code-status-bar.test.tsx  NEW — colocated tests
├── code-search-bar.tsx       REFACTOR — now a floating popup with absolute positioning + entry animation; keep keyboard logic, restyle
├── code-search-bar.test.tsx  UPDATE — adjust assertions for the new container styling, behaviour unchanged
├── code-source-view.tsx      unchanged
├── code-source-view.test.tsx unchanged
├── code-diff-view.tsx        unchanged
├── code-diff-view.test.tsx   unchanged
└── lib/                      unchanged (filename, diff, search)
```

`artifact-panel.tsx` gets:
- A new diff-pill rendered conditionally for `application/code` artifacts in the header — placement detailed in §4.4.
- New panel state: `codeArtifactMode: "source" | "diff"`. Resets to `"source"` when `displayArtifact.id` or `currentViewVersion` changes.
- Forward `mode` + `onModeChange` to `<ArtifactRenderer>` (which forwards to `<CodeRenderer>` for the code branch only).

`artifact-renderer.tsx` `ArtifactRendererProps` gains two optional fields: `codeMode?: "source" | "diff"` and `onCodeModeChange?: (mode: "source" | "diff") => void`. Forwarded only to `<CodeRenderer>`.

## 4. Component design

### 4.1 `CodeStatusBar` (new)

```tsx
interface CodeStatusBarProps {
  lineCount: number
  language: string | undefined          // for the encoding line description
  wrap: boolean
  onWrapToggle: () => void
  onSearchOpen: () => void              // clicked from the Ctrl+F hint
}
```

Layout (single flex row, 22px tall):

```
┌─ {lineCount} lines · UTF-8 · LF ────────── 🔍 Ctrl+F · ↵ wrap: off ─┐
```

- Both right-side items are clickable. Hover: `text-foreground`. Idle: `text-muted-foreground`.
- The `↵ wrap: off / on` text label flips with the toggle (saves an icon-only state mystery).
- The line-count is computed from `artifact.content.split('\n').length`. Encoding/EOL strings are static (`UTF-8 · LF`) for v1 — we don't actually detect them, but they sell the IDE-native feel and cost nothing.

### 4.2 `CodeSearchBar` (refactored — floating popup)

Same props as v1, but the container changes:

```tsx
<div
  role="dialog"
  aria-label="Search in code"
  className={cn(
    "absolute top-3 right-3 z-10",
    "flex items-center gap-1 px-2 py-1.5",
    "min-w-[260px] max-w-[320px]",
    "bg-background border border-border rounded-md shadow-md backdrop-blur-md",
    "transition-[opacity,transform] duration-150",
    "data-[state=entering]:opacity-0 data-[state=entering]:-translate-y-1",
    "data-[state=open]:opacity-100 data-[state=open]:translate-y-0",
  )}
>
  ...same internal layout: search icon, input, count, prev, next, close
</div>
```

Click-outside-to-close: out of scope for v1. Escape and the `×` button are sufficient.

### 4.3 `CodeRenderer` (refactored)

State that **stays** in the renderer:
- `wrap`, `searchOpen`, `searchQuery`, `matchIndex`, `diffLayout`, `prevVersionState`.

State that **moves out** to `ArtifactPanel`:
- `mode` — passed as a controlled prop.

New props:
- `mode: "source" | "diff"` (was internal state).
- `onModeChange: (mode: "source" | "diff") => void` (lifts the toggle handler to the panel).

The renderer's main JSX shape:

```tsx
<div className="flex flex-col h-full" tabIndex={-1} onKeyDown={handleKeyDown}>
  {/* No toolbar. */}

  <div className="relative flex-1 overflow-auto">
    {searchOpen && <CodeSearchBar ... />}        {/* floating popup */}
    {mode === "source" ? <CodeSourceView ... /> : <CodeDiffView ... />}
  </div>

  <CodeStatusBar
    lineCount={lineCountOf(artifact.content)}
    language={artifact.language}
    wrap={wrap}
    onWrapToggle={() => setWrap(w => !w)}
    onSearchOpen={() => setSearchOpen(true)}
  />
</div>
```

Note the `relative` wrapper around the body: needed for the floating search popup's `absolute` positioning.

### 4.4 `artifact-panel.tsx` panel-header diff pill

In the type-badge area (already shows the artifact type label, around L460), insert a new pill ONLY for `application/code`:

```tsx
{artifact.type === "application/code" && (
  <button
    type="button"
    onClick={() => setCodeArtifactMode((m) => (m === "diff" ? "source" : "diff"))}
    disabled={!hasPreviousVersion || isStreaming}
    aria-pressed={codeArtifactMode === "diff"}
    aria-label={codeArtifactMode === "diff" ? "Hide diff" : "Show diff vs previous version"}
    className={cn(
      "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      codeArtifactMode === "diff"
        ? "bg-purple-500/25 text-purple-600 dark:text-purple-400"
        : hasPreviousVersion && !isStreaming
        ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25"
        : "bg-muted text-muted-foreground",
    )}
  >
    <GitCompareArrows className="h-3 w-3" />
    diff
  </button>
)}
```

Position the pill **after the language pill, before the version pill** so the natural reading order is filename → language → diff state → version navigator.

### 4.5 Streaming pulse

The animated dot:

```tsx
{isStreaming && (
  <span
    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse ml-1"
    aria-label="Artifact is being written"
    title="Artifact is being written"
  />
)}
```

Renders inside the language pill `<span>` (immediately after the language text), only when `artifact.id` starts with `streaming-`.

## 5. Data flow

```
ArtifactPanel
├── owns codeArtifactMode (resets on artifact.id or currentViewVersion change)
├── derives lineCount from displayArtifact.content (only for code artifacts)
├── header JSX gains the diff pill for application/code (uses panel state directly)
├── ArtifactRenderer (dispatch)
│   └── case "application/code":
│       └── <CodeRenderer
│             artifact, hasPreviousVersion, previousVersionNum, fetchPreviousVersion, onRestoreVersion
│             mode={codeArtifactMode}
│             onModeChange={setCodeArtifactMode}
│           />
│           ├── (no toolbar)
│           ├── relative body wrapper
│           │   ├── CodeSearchBar (floating, when searchOpen)
│           │   └── CodeSourceView OR CodeDiffView (based on mode)
│           └── CodeStatusBar (always-visible)
```

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Diff pill in panel header makes the header overflow on narrow widths | Medium | Low | Pill is small (~50px); acceptable. Worst case: header truncates the filename further, which is fine. |
| Status bar feels too "info-display" and users miss the wrap toggle | Low | Low | Wrap label flips between `wrap: off` / `wrap: on` so the interactive state is visible. Cursor turns into a pointer on hover. |
| Search popup positioning collides with long content on the first line | Low | Low | Popup is `top-3 right-3` with ~12px padding; a real first line up to ~280-310 chars would visually clash but Streamdown wraps long lines. Acceptable. |
| Lifting `mode` to `ArtifactPanel` complicates state when artifact.id changes | Medium | Medium | useEffect resets `codeArtifactMode` to `"source"` on every artifact-id or currentViewVersion change. Test it explicitly. |
| Click-outside-to-close on the search popup feels missing | Medium | Low | Out of scope for this revision. Escape + × already cover most use cases. Defer until users complain. |
| Removing `code-toolbar.tsx` breaks any external import | Low | Low | The barrel never exported it; only `CodeRenderer` is the public surface. Grep confirms no external consumers. |

## 7. Test plan

- **`code-status-bar.test.tsx`** (new): line count rendering, wrap label flip, click handlers fire, ARIA labels, encoding/EOL static text.
- **`code-search-bar.test.tsx`** (updated): same behavioural assertions as v1 (input, count, prev/next, Escape, Enter/Shift+Enter), plus a check that the container has `position: absolute` (verify via class assertion `top-3 right-3 absolute z-10`).
- **`code-renderer.test.tsx`** (updated): drop the toolbar-targeted assertions; add status-bar mount; add controlled-mode assertion (passing `mode="diff"` props in directly renders the diff view); add Ctrl+F-still-opens-search assertion.
- **`code-toolbar.test.tsx`**: deleted.
- **`artifact-panel.test.tsx`** (new minimal test, file doesn't exist yet): renders the diff pill only for `application/code`; pill is disabled when viewing artifact version 1; pill is disabled while streaming; clicking toggles `codeArtifactMode`; resets to `"source"` on artifact-id change.

## 8. Out of scope (explicitly deferred)

- Click-outside-to-close on search popup.
- Real encoding/EOL detection (we hard-code `UTF-8 · LF`).
- Status bar showing the current Ln/Col cursor position (not meaningful for read-only view).
- Status bar exposing the language picker (still read-only display in v1).
- Mobile / narrow-width responsiveness for the diff pill (acceptable to truncate filename).

## 9. Acceptance criteria

After this revision ships:
1. The dedicated toolbar strip is gone — header → body → status bar.
2. The diff pill lives in the panel header, coloured purple when applicable, disabled-grey on v1.
3. Pressing Ctrl+F (or clicking `🔍 Ctrl+F` in the status bar) opens the floating search popup at the body's top-right.
4. The search popup has a subtle shadow + border + backdrop-blur — it visibly floats above the code, doesn't push it down.
5. Wrap toggle in the status bar reads `↵ wrap: off` / `↵ wrap: on` and the label flips on click.
6. Streaming pulse appears next to the language pill (no dedicated row).
7. All component tests for `code-status-bar`, refactored `code-search-bar`, and refactored `code-renderer` pass green.
8. The deleted `code-toolbar.tsx` and its test file are gone, and no import resolves to them.
