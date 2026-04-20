# Artifact Naming Audit — `text/markdown`

Audit on UI vs internal type system for the `text/markdown` artifact.

## 1. `src/lib/prompts/artifacts/markdown.ts`

- **`type`**: `"text/markdown"` (L2)
- **`label`**: `"Document"` (L3)
- **`summary`** (L4-5):
  > "Documents, reports, READMEs, articles, tutorials — rendered Markdown with GFM tables, Shiki-highlighted code blocks, KaTeX math, and mermaid diagrams."
- **`rules`** heading (L6): `**text/markdown — Documents**` — body consistently frames it as a "Document" (reading, not interacting). Includes an explicit Markdown-vs-HTML-vs-LaTeX boundary table.

## 2. `CANVAS_TYPE_LABELS` (`src/lib/prompts/artifacts/index.ts:27-29`)

Built via `Object.fromEntries(ALL_ARTIFACTS.map(a => [a.type, a.label]))`. Concrete mapping:

| type | label |
|---|---|
| `text/html` | HTML Page |
| `application/react` | React Component |
| `image/svg+xml` | SVG Graphic |
| `application/mermaid` | Mermaid Diagram |
| `application/slides` | Slides |
| `application/code` | Code |
| `application/python` | Python Script |
| `application/sheet` | Spreadsheet |
| **`text/markdown`** | **Document** |
| `text/latex` | LaTeX / Math |
| `application/3d` | 3D Scene |

Used only in `src/lib/prompts/instructions.ts` for **system-prompt** text sent to the LLM.

## 3. Grep — "Document" / "Markdown" in target dirs

`src/lib/prompts/artifacts/`:
- `markdown.ts:3` — `label: "Document"`
- `markdown.ts:6` — `**text/markdown — Documents**`
- `markdown.ts:4` — summary opens with "Documents, reports..."

`src/features/conversations/components/chat/artifacts/`:
- `artifact-panel.tsx:56` — **`"text/markdown": "Markdown"`** (local `TYPE_LABELS`)
- `constants.ts:35` — **`"text/markdown": "Document"`** (exported `TYPE_LABELS`)
- `constants.ts:21` — icon = `FileText`
- `types.ts:3,17` — union member `"text/markdown"`
- `artifact-renderer.tsx:121` — dispatch `case "text/markdown"`

## 4. Conditional rendering in panel / indicator

**`artifact-panel.tsx`** — local, duplicated map at L54-66:

```tsx
const TYPE_LABELS: Record<string, string> = {
  "text/html": "HTML",
  "text/markdown": "Markdown",   // ← diverges from constants.ts
  "image/svg+xml": "SVG",
  "application/react": "React",
  "application/mermaid": "Mermaid",
  "application/code": "Code",
  "application/sheet": "Spreadsheet",
  "text/latex": "LaTeX",
  "application/slides": "Slides",
  "application/python": "Python",
  "application/3d": "R3F Scene",
}
```

Rendered in the header pill at L363-366:

```tsx
<span className="... rounded-full ...">
  {TYPE_LABELS[artifact.type] || artifact.type}
  {artifact.language ? ` · ${artifact.language}` : ""}
</span>
```

**`artifact-indicator.tsx`** imports the shared map from `./constants` (L7) and renders at L43:

```tsx
<span className="text-[11px] opacity-70">{TYPE_LABELS[type] || "Artifact"}</span>
```

→ resolves to **"Document"**.

No `if (type === "text/markdown")` branches override labels anywhere — just the two diverging lookup tables.

## 5. Consistency across surfaces (for `text/markdown`)

| Surface | Source | Label shown | Icon |
|---|---|---|---|
| **Artifact panel header pill** | `artifact-panel.tsx` local `TYPE_LABELS` | **"Markdown"** ⚠️ | n/a |
| Chat `ArtifactIndicator` (in-message card) | `constants.ts` `TYPE_LABELS` | "Document" | `FileText` |
| Chat-input toolbar — **Canvas mode badge** (`chat-input-toolbar.tsx:158`) | `constants.ts` | "Canvas: Document" | `FileText` |
| Chat-input toolbar — **Create-artifact dropdown item** (`chat-input-toolbar.tsx:702`) | `constants.ts` | "Document" | `FileText` |
| Workspace **history list** (`chat-workspace.tsx:3607`) | `constants.ts` | "Document" | `FileText` |
| **System prompt to the LLM** (`CANVAS_TYPE_LABELS`) | `prompts/artifacts` | "Document" | — |

## Verdict

**NOT consistent.** Everywhere except the panel header shows "Document". The panel header shows "Markdown" because `artifact-panel.tsx:54-66` redeclares its own local `TYPE_LABELS` instead of importing from `./constants`.

Same local map also diverges for other types:

| Type | Panel local | `constants.ts` |
|---|---|---|
| `text/html` | "HTML" | "HTML Page" |
| `application/react` | "React" | "React Component" |
| `image/svg+xml` | "SVG" | "SVG Graphic" |
| `application/mermaid` | "Mermaid" | "Mermaid Diagram" |
| `application/python` | "Python" | "Python Script" |
| `application/3d` | "R3F Scene" | "3D Scene" |
| `text/markdown` | "Markdown" | "Document" |

## Recommended Fix

Delete the local `TYPE_LABELS` in `artifact-panel.tsx` (L54-66) and replace with:

```tsx
import { TYPE_LABELS } from "./constants"
```

Single source of truth → panel header aligns with indicator, toolbar, history list, and LLM system prompt. Consider also importing `CANVAS_TYPE_LABELS` from `prompts/artifacts` **or** making `constants.ts` the single source that prompts import from, so prompt-side and UI-side can never drift.
