# Code Artifact UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `application/code` artifact panel with a dedicated subsystem providing a toolbar (filename-as-title, language pill, wrap toggle, in-panel search, version-diff), while keeping Streamdown as the syntax-highlighting engine. Inline chat code rendering and the validator are unchanged.

**Architecture:** New subsystem under `src/features/conversations/components/chat/artifacts/renderers/code/` mirroring the LaTeX subsystem pattern (commit `72e11cdf`). The artifact panel keeps owning Copy/Download/version-pill chrome and provides a lazy fetcher to the renderer that hits a small new server endpoint (`/api/.../artifacts/[id]/versions/[N]`) for previous-version content when the user enters diff mode. Results are panel-side cached per `(artifactId, versionNum)`.

**Tech Stack:** React 19 + Next.js (App Router), Streamdown (existing), Shiki (existing), `diff` (jsdiff, new), CSS Custom Highlight API with DOM-wrapping fallback, Vitest 4 + @testing-library/react for tests.

**Spec:** `docs/superpowers/specs/2026-05-06-code-artifact-redesign-design.md`

**Important conventions:**
- Package manager: **bun** (never npm).
- Commits: **`git commit-sulthan`** (alias enforces `Sulthan Nauval Abdillah <sulthannauval2@gmail.com>` authorship). Never plain `git commit`. Never `--no-verify`. Never `Co-Authored-By` trailers.
- Commit messages: bullet body, no mid-bullet wrapping (newline only between bullets, not within a single bullet).
- Tests: vitest with `// @vitest-environment jsdom` per file when DOM is needed. Lib tests under `tests/unit/code/`. Component tests colocated as `*.test.tsx`.

---

## Task 0: Install jsdiff dependency

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Install runtime + types**

Run:
```bash
bun add diff@7
bun add -D @types/diff@7
```

Expected: `package.json` gains `"diff": "^7..."` under `dependencies` and `"@types/diff": "^7..."` under `devDependencies`. `bun.lock` updates.

- [ ] **Step 2: Verify the import resolves**

Run:
```bash
bun -e 'import("diff").then(m => console.log(typeof m.diffLines, typeof m.diffWordsWithSpace))'
```

Expected: prints `function function` (both functions resolved). If `undefined` appears, the version doesn't match the spec API; fall back to `diff@5` and re-test.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit-sulthan -m "$(cat <<'EOF'
deps: add diff (jsdiff) for code artifact version diffing

- runtime dep for renderers/code/lib/diff.ts (computeUnifiedDiff, computeSplitDiff)
- includes @types/diff for TS strict mode
EOF
)"
```

---

## Task 1: Create `lib/filename.ts` with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/lib/filename.ts`
- Create: `tests/unit/code/filename.test.ts`

This task lifts `CODE_LANGUAGE_EXTENSIONS` and `codeExtension` out of `artifact-panel.tsx` (where they currently live at L801-L843 and L845-L850) and adds a new `deriveFilename` helper. The panel will switch to importing from this module in a later task.

- [ ] **Step 1: Create the test file**

Path: `tests/unit/code/filename.test.ts`

```ts
import { describe, it, expect } from "vitest"
import {
  CODE_LANGUAGE_EXTENSIONS,
  codeExtension,
  deriveFilename,
} from "@/features/conversations/components/chat/artifacts/renderers/code/lib/filename"

describe("CODE_LANGUAGE_EXTENSIONS", () => {
  it("contains the canonical Shiki language map", () => {
    expect(CODE_LANGUAGE_EXTENSIONS.typescript).toBe("ts")
    expect(CODE_LANGUAGE_EXTENSIONS.python).toBe("py")
    expect(CODE_LANGUAGE_EXTENSIONS.rust).toBe("rs")
    expect(CODE_LANGUAGE_EXTENSIONS.csharp).toBe("cs")
    expect(CODE_LANGUAGE_EXTENSIONS.bash).toBe("sh")
  })
})

describe("codeExtension", () => {
  it("returns .txt for missing language", () => {
    expect(codeExtension(undefined)).toBe(".txt")
    expect(codeExtension("")).toBe(".txt")
  })

  it("returns mapped extension for known languages", () => {
    expect(codeExtension("typescript")).toBe(".ts")
    expect(codeExtension("python")).toBe(".py")
    expect(codeExtension("javascript")).toBe(".js")
  })

  it("normalizes case and whitespace", () => {
    expect(codeExtension("  TypeScript  ")).toBe(".ts")
    expect(codeExtension("PYTHON")).toBe(".py")
  })

  it("falls back to the language string itself for unknown languages", () => {
    expect(codeExtension("nim")).toBe(".nim")
    expect(codeExtension("zig")).toBe(".zig")
  })
})

describe("deriveFilename", () => {
  it("returns filename-shaped titles unchanged", () => {
    expect(deriveFilename({ title: "debounce.ts", language: "typescript" })).toBe("debounce.ts")
    expect(deriveFilename({ title: "index.tsx", language: "tsx" })).toBe("index.tsx")
    expect(deriveFilename({ title: "config.json", language: "json" })).toBe("config.json")
  })

  it("preserves path-style titles", () => {
    expect(
      deriveFilename({ title: "migrations/0042_users.sql", language: "sql" })
    ).toBe("migrations/0042_users.sql")
    expect(
      deriveFilename({ title: "src/lib/foo.ts", language: "typescript" })
    ).toBe("src/lib/foo.ts")
  })

  it("preserves special filenames without an extension", () => {
    expect(deriveFilename({ title: "Dockerfile", language: "dockerfile" })).toBe("Dockerfile")
    expect(deriveFilename({ title: "Makefile", language: "makefile" })).toBe("Makefile")
    expect(deriveFilename({ title: "Procfile", language: undefined })).toBe("Procfile")
    expect(deriveFilename({ title: "Rakefile", language: "ruby" })).toBe("Rakefile")
    expect(deriveFilename({ title: "Gemfile", language: "ruby" })).toBe("Gemfile")
  })

  it("slugifies sentence-style titles and appends the extension", () => {
    expect(
      deriveFilename({ title: "Debounce and throttle utilities", language: "typescript" })
    ).toBe("debounce-and-throttle-utilities.ts")
    expect(
      deriveFilename({ title: "Read CSV stats", language: "python" })
    ).toBe("read-csv-stats.py")
  })

  it("collapses runs of separators in slugified output", () => {
    expect(
      deriveFilename({ title: "Hello   World!!!", language: "typescript" })
    ).toBe("hello-world.ts")
    expect(
      deriveFilename({ title: "  Trim    me  ", language: "typescript" })
    ).toBe("trim-me.ts")
  })

  it("handles an empty or whitespace-only title", () => {
    expect(deriveFilename({ title: "", language: "typescript" })).toBe("untitled.ts")
    expect(deriveFilename({ title: "   ", language: "python" })).toBe("untitled.py")
    expect(deriveFilename({ title: "", language: undefined })).toBe("untitled.txt")
  })

  it("handles unicode by stripping it from the slug", () => {
    expect(
      deriveFilename({ title: "Hello — world ✨", language: "typescript" })
    ).toBe("hello-world.ts")
  })

  it("uses .txt extension when language is missing and title is not filename-shaped", () => {
    expect(deriveFilename({ title: "Notes about thing", language: undefined })).toBe("notes-about-thing.txt")
  })
})
```

- [ ] **Step 2: Run tests; expect failure (module not found)**

Run:
```bash
bun run vitest run tests/unit/code/filename.test.ts
```

Expected: FAIL with module-resolution error pointing at `renderers/code/lib/filename`.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/lib/filename.ts`

```ts
/**
 * Filename derivation for `application/code` artifacts.
 *
 * The download path and the renderer toolbar both need a stable filename
 * derived from the artifact's title + language. This module is the single
 * source of truth — `artifact-panel.tsx` and the `code` renderer subsystem
 * both import from here.
 *
 * Title-as-filename: post-2026-05 prompt change asks the LLM to set
 * `artifact.title` to the actual filename (`debounce.ts`, `Dockerfile`,
 * `migrations/0042_users.sql`). For older artifacts with descriptive
 * sentence titles ("Debounce and throttle utilities") we slugify and
 * append the language extension as a fallback.
 */

/**
 * Maps the canonical Shiki language names the prompt advertises to their
 * conventional file extensions. Keys are lowercase. Mirrors the prompt
 * list in `src/lib/prompts/artifacts/code.ts`.
 */
export const CODE_LANGUAGE_EXTENSIONS: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  ruby: "rb",
  rust: "rs",
  go: "go",
  java: "java",
  kotlin: "kt",
  swift: "swift",
  csharp: "cs",
  cpp: "cpp",
  c: "c",
  php: "php",
  shell: "sh",
  bash: "sh",
  zsh: "sh",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yml",
  yml: "yml",
  toml: "toml",
  xml: "xml",
  markdown: "md",
  dockerfile: "dockerfile",
  makefile: "mk",
  perl: "pl",
  lua: "lua",
  r: "r",
  julia: "jl",
  haskell: "hs",
  elixir: "ex",
  erlang: "erl",
  scala: "scala",
  dart: "dart",
  graphql: "graphql",
  prisma: "prisma",
}

/**
 * Resolve the file extension (with leading dot) for a given language. Falls
 * back to the language string itself for niche/new languages so the
 * downloaded filename is at least recognizable. Returns `.txt` when no
 * language is set.
 */
export function codeExtension(language: string | undefined): string {
  if (!language) return ".txt"
  const key = language.toLowerCase().trim()
  if (!key) return ".txt"
  const mapped = CODE_LANGUAGE_EXTENSIONS[key]
  return mapped ? `.${mapped}` : `.${key}`
}

/** Filename-shaped: alphanumerics, dots, slashes, dashes, underscores, ending in `.<ext>`. */
const FILENAME_SHAPED_RE = /^[\w\-./]+\.[A-Za-z0-9]+$/

/** Real filenames without an extension that we want to preserve as-is. */
const SPECIAL_FILENAMES_RE = /^(Dockerfile|Makefile|Procfile|Rakefile|Gemfile)$/i

export interface FilenameInput {
  title: string
  language: string | undefined
}

/**
 * Derive a filesystem-friendly filename for a code artifact.
 *
 * Rules (in order):
 * 1. Empty/whitespace title → `untitled<ext>`.
 * 2. Already filename-shaped (matches `name.ext` or `path/name.ext`) →
 *    return as-is.
 * 3. Special unextensioned filename (Dockerfile, Makefile, Procfile,
 *    Rakefile, Gemfile) → return as-is.
 * 4. Otherwise: slugify (replace non-word/dash/dot/slash characters with
 *    `-`, collapse runs, trim leading/trailing separators, lowercase) and
 *    append the language extension.
 */
export function deriveFilename({ title, language }: FilenameInput): string {
  const t = title.trim()
  if (!t) return `untitled${codeExtension(language)}`
  if (FILENAME_SHAPED_RE.test(t)) return t
  if (SPECIAL_FILENAMES_RE.test(t)) return t
  const slug = t
    .replace(/[^\w\-./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return slug + codeExtension(language)
}
```

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run tests/unit/code/filename.test.ts
```

Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/lib/filename.ts tests/unit/code/filename.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add lib/filename for derive-filename + extension lookup

- moves CODE_LANGUAGE_EXTENSIONS + codeExtension into the new code subsystem so panel-download and renderer-toolbar share one source of truth
- adds deriveFilename: filename-shaped passthrough, Dockerfile/Makefile/etc. special cases, slugify-and-extend fallback for sentence titles
- 9 test cases covering known/unknown languages, special filenames, path-style titles, unicode strip, empty title fallback
EOF
)"
```

---

## Task 2: Create `lib/diff.ts` with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/lib/diff.ts`
- Create: `tests/unit/code/diff.test.ts`

- [ ] **Step 1: Create the test file**

Path: `tests/unit/code/diff.test.ts`

```ts
import { describe, it, expect } from "vitest"
import {
  ARCHIVED_SENTINEL,
  computeUnifiedDiff,
  computeSplitDiff,
} from "@/features/conversations/components/chat/artifacts/renderers/code/lib/diff"

describe("ARCHIVED_SENTINEL", () => {
  it("is a non-printable string unlikely to appear in real code", () => {
    expect(ARCHIVED_SENTINEL).toMatch(//)
    expect(ARCHIVED_SENTINEL.length).toBeGreaterThan(8)
  })
})

describe("computeUnifiedDiff", () => {
  it("reports identical when both sides are byte-equal", () => {
    const result = computeUnifiedDiff("foo\nbar\n", "foo\nbar\n")
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") expect(result.identical).toBe(true)
  })

  it("returns archived when before is the sentinel", () => {
    const result = computeUnifiedDiff(ARCHIVED_SENTINEL, "foo\nbar\n")
    expect(result.kind).toBe("archived")
  })

  it("emits added/removed/context lines with correct numbering", () => {
    const before = "a\nb\nc\n"
    const after = "a\nB\nc\n"
    const result = computeUnifiedDiff(before, after)
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    const lines = result.lines
    // First line is unchanged "a"
    expect(lines[0]).toMatchObject({ kind: "context", text: "a", beforeLineNum: 1, afterLineNum: 1 })
    // Then "b" removed (line 2 of before, no after)
    const removed = lines.find((l) => l.kind === "removed")
    expect(removed).toMatchObject({ text: "b", beforeLineNum: 2, afterLineNum: null })
    // Then "B" added (no before, line 2 of after)
    const added = lines.find((l) => l.kind === "added")
    expect(added).toMatchObject({ text: "B", beforeLineNum: null, afterLineNum: 2 })
    // Last line is unchanged "c" (line 3 of both)
    const last = lines[lines.length - 1]
    expect(last).toMatchObject({ kind: "context", text: "c", beforeLineNum: 3, afterLineNum: 3 })
  })

  it("handles addition-only diffs", () => {
    const result = computeUnifiedDiff("a\n", "a\nb\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    const added = result.lines.filter((l) => l.kind === "added")
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ text: "b", afterLineNum: 2 })
  })

  it("handles removal-only diffs", () => {
    const result = computeUnifiedDiff("a\nb\n", "a\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    const removed = result.lines.filter((l) => l.kind === "removed")
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({ text: "b", beforeLineNum: 2 })
  })

  it("handles empty before vs non-empty after", () => {
    const result = computeUnifiedDiff("", "hello\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    expect(result.lines.every((l) => l.kind === "added")).toBe(true)
  })

  it("preserves multibyte text in line content", () => {
    const result = computeUnifiedDiff("héllo\n", "héllo wörld\n")
    if (result.kind !== "ok" || result.identical) throw new Error("unexpected")
    expect(result.lines.find((l) => l.text.includes("wörld"))?.kind).toBe("added")
  })

  it("handles 200-line very different inputs without throwing", () => {
    const before = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n")
    const after = Array.from({ length: 200 }, (_, i) => `LINE ${i}`).join("\n")
    const result = computeUnifiedDiff(before, after)
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") expect(result.identical).toBe(false)
  })
})

describe("computeSplitDiff", () => {
  it("returns identical when both sides equal", () => {
    expect(computeSplitDiff("a\n", "a\n").kind).toBe("identical")
  })

  it("returns archived when before is the sentinel", () => {
    expect(computeSplitDiff(ARCHIVED_SENTINEL, "x\n").kind).toBe("archived")
  })

  it("aligns added lines on the right with empty padding on the left", () => {
    const result = computeSplitDiff("a\n", "a\nb\n")
    if (result.kind !== "ok") throw new Error("unexpected")
    expect(result.left).toHaveLength(result.right!.length)
    const lastLeft = result.left![result.left!.length - 1]
    const lastRight = result.right![result.right!.length - 1]
    expect(lastLeft.kind).toBe("context")
    expect(lastLeft.text).toBe("")
    expect(lastRight.kind).toBe("added")
  })

  it("aligns removed lines on the left with empty padding on the right", () => {
    const result = computeSplitDiff("a\nb\n", "a\n")
    if (result.kind !== "ok") throw new Error("unexpected")
    const lastLeft = result.left![result.left!.length - 1]
    const lastRight = result.right![result.right!.length - 1]
    expect(lastLeft.kind).toBe("removed")
    expect(lastRight.kind).toBe("context")
    expect(lastRight.text).toBe("")
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run:
```bash
bun run vitest run tests/unit/code/diff.test.ts
```

Expected: FAIL with module-resolution error.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/lib/diff.ts`

```ts
/**
 * Version-vs-version diff computation for code artifacts.
 *
 * Built on `diff` (jsdiff). Produces structured `DiffLine` arrays for both
 * unified and split layouts. Pure functions — no React, no DOM.
 *
 * Sentinel: when the previous version's content is unavailable (S3
 * archive failed during update — see update-artifact.ts:184-191) the
 * panel passes `ARCHIVED_SENTINEL` as `before`. We surface that as a
 * dedicated `{ kind: "archived" }` result so the renderer can show the
 * Restore-prompt UI rather than a misleading diff.
 */

import { diffLines } from "diff"

/**
 * Sentinel string the panel uses to signal that a previous version's
 * content failed inline-fallback storage and is not available for diff.
 * Picked to be unmistakable in real code (NUL bytes around the marker).
 */
export const ARCHIVED_SENTINEL = "__ARTIFACT_VERSION_ARCHIVED__"

export type DiffLineKind = "context" | "added" | "removed"

export interface DiffLine {
  kind: DiffLineKind
  /** 1-indexed line number in the "before" content, or null for added lines / split-padding. */
  beforeLineNum: number | null
  /** 1-indexed line number in the "after" content, or null for removed lines / split-padding. */
  afterLineNum: number | null
  text: string
}

export type UnifiedDiffResult =
  | { kind: "ok"; lines: DiffLine[]; identical: boolean }
  | { kind: "archived" }
  | { kind: "error"; message: string }

export type SplitDiffResult =
  | { kind: "ok"; left: DiffLine[]; right: DiffLine[] }
  | { kind: "identical" }
  | { kind: "archived" }
  | { kind: "error"; message: string }

/** Split a `diff` change value into individual lines, dropping the trailing newline if present. */
function splitChangeValue(value: string): string[] {
  if (value === "") return []
  const trimmed = value.endsWith("\n") ? value.slice(0, -1) : value
  return trimmed.split("\n")
}

/**
 * Compute a unified line-level diff. Identical inputs return
 * `{ ok, identical: true, lines: [] }`. The archived sentinel as `before`
 * returns `{ archived }`. Library throws are caught and surfaced as
 * `{ error }`.
 */
export function computeUnifiedDiff(before: string, after: string): UnifiedDiffResult {
  if (before === ARCHIVED_SENTINEL) return { kind: "archived" }
  if (before === after) return { kind: "ok", identical: true, lines: [] }

  try {
    const changes = diffLines(before, after)
    const lines: DiffLine[] = []
    let beforeNum = 1
    let afterNum = 1

    for (const change of changes) {
      const segments = splitChangeValue(change.value)
      for (const text of segments) {
        if (change.added) {
          lines.push({ kind: "added", beforeLineNum: null, afterLineNum: afterNum++, text })
        } else if (change.removed) {
          lines.push({ kind: "removed", beforeLineNum: beforeNum++, afterLineNum: null, text })
        } else {
          lines.push({
            kind: "context",
            beforeLineNum: beforeNum++,
            afterLineNum: afterNum++,
            text,
          })
        }
      }
    }

    return { kind: "ok", identical: false, lines }
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Unknown diff error",
    }
  }
}

/**
 * Compute a split (side-by-side) diff. Built on top of `computeUnifiedDiff`
 * and projects the unified line stream into two columns, padding empty
 * context lines to keep adds/removes aligned.
 */
export function computeSplitDiff(before: string, after: string): SplitDiffResult {
  const unified = computeUnifiedDiff(before, after)
  if (unified.kind === "archived") return { kind: "archived" }
  if (unified.kind === "error") return unified
  if (unified.identical) return { kind: "identical" }

  const left: DiffLine[] = []
  const right: DiffLine[] = []
  for (const line of unified.lines) {
    if (line.kind === "context") {
      left.push(line)
      right.push(line)
    } else if (line.kind === "removed") {
      left.push(line)
      right.push({ kind: "context", beforeLineNum: null, afterLineNum: null, text: "" })
    } else {
      left.push({ kind: "context", beforeLineNum: null, afterLineNum: null, text: "" })
      right.push(line)
    }
  }
  return { kind: "ok", left, right }
}
```

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run tests/unit/code/diff.test.ts
```

Expected: PASS — all 11 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/lib/diff.ts tests/unit/code/diff.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add lib/diff for unified and split diff computation

- ARCHIVED_SENTINEL constant lets the panel signal archived previous-version content without crafting a fake diff
- computeUnifiedDiff returns DiffLine[] with kind/beforeLineNum/afterLineNum/text and an identical flag for byte-equal inputs
- computeSplitDiff projects the unified stream into left/right columns with empty-context padding for alignment
- 11 test cases: identical, archived, single addition/removal, empty-before, multibyte, 200-line stress, split alignment
EOF
)"
```

---

## Task 3: Create `lib/search.ts` with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/lib/search.ts`
- Create: `tests/unit/code/search.test.ts`

CSS Custom Highlight API is unsupported in jsdom, so the tests exercise the DOM-wrapping fallback path. The CSS path is structured to no-op gracefully when `CSS.highlights` is absent.

- [ ] **Step 1: Create the test file**

Path: `tests/unit/code/search.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import {
  findMatches,
  applyHighlights,
  clearHighlights,
} from "@/features/conversations/components/chat/artifacts/renderers/code/lib/search"

describe("findMatches", () => {
  it("returns no matches for an empty query", () => {
    expect(findMatches("hello world", "")).toEqual([])
  })

  it("returns no matches when the query is not present", () => {
    expect(findMatches("hello world", "xyz")).toEqual([])
  })

  it("returns a single-line match with correct positions", () => {
    const matches = findMatches("hello world", "world")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ startLine: 1, startCol: 6, endLine: 1, endCol: 11 })
  })

  it("matches across multiple lines and reports them separately", () => {
    const content = "foo\nbar\nfoo bar"
    const matches = findMatches(content, "foo")
    expect(matches).toHaveLength(2)
    expect(matches[0]).toEqual({ startLine: 1, startCol: 0, endLine: 1, endCol: 3 })
    expect(matches[1]).toEqual({ startLine: 3, startCol: 0, endLine: 3, endCol: 3 })
  })

  it("is case-insensitive", () => {
    const matches = findMatches("Hello World", "world")
    expect(matches).toHaveLength(1)
    expect(matches[0]).toEqual({ startLine: 1, startCol: 6, endLine: 1, endCol: 11 })
  })

  it("returns overlapping matches as separate non-overlapping hits", () => {
    const matches = findMatches("aaaa", "aa")
    // We advance past each match so non-overlapping behaviour is intentional.
    expect(matches).toHaveLength(2)
  })
})

describe("applyHighlights / clearHighlights (DOM fallback)", () => {
  let host: HTMLElement

  beforeEach(() => {
    host = document.createElement("div")
    host.textContent = "hello world\nbar foo"
    document.body.appendChild(host)
  })

  it("returns 'dom' when CSS Custom Highlight API is unavailable", () => {
    // jsdom lacks CSS.highlights — applyHighlights falls back to DOM wrapping
    const matches = findMatches(host.textContent ?? "", "world")
    const mode = applyHighlights(host, matches, host.textContent ?? "")
    expect(mode).toBe("dom")
    const marks = host.querySelectorAll("mark.code-search-match")
    expect(marks).toHaveLength(1)
    expect(marks[0].textContent).toBe("world")
  })

  it("wraps each match in DOM mode without disturbing surrounding text", () => {
    const matches = findMatches(host.textContent ?? "", "foo")
    applyHighlights(host, matches, host.textContent ?? "")
    expect(host.textContent).toBe("hello world\nbar foo")
    const marks = host.querySelectorAll("mark.code-search-match")
    expect(marks).toHaveLength(1)
  })

  it("clearHighlights restores the host to its pre-highlight state", () => {
    const matches = findMatches(host.textContent ?? "", "world")
    const mode = applyHighlights(host, matches, host.textContent ?? "")
    clearHighlights(host, mode)
    expect(host.querySelectorAll("mark.code-search-match")).toHaveLength(0)
    expect(host.textContent).toBe("hello world\nbar foo")
  })

  it("returns null and applies no marks when there are no matches", () => {
    const mode = applyHighlights(host, [], host.textContent ?? "")
    expect(mode).toBeNull()
    expect(host.querySelectorAll("mark.code-search-match")).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run:
```bash
bun run vitest run tests/unit/code/search.test.ts
```

Expected: FAIL with module-resolution error.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/lib/search.ts`

```ts
/**
 * Search-in-content for the code artifact panel.
 *
 * Two responsibilities:
 *
 * 1. `findMatches` — pure text scan over the artifact's raw `content`,
 *    returning 1-indexed line/column ranges. Case-insensitive, plain text
 *    (no regex parsing in v1). All within-line matches; queries containing
 *    newlines are treated as literal substrings but won't span lines (a
 *    match's start/endLine differ only when the matched substring contains
 *    a literal newline).
 *
 * 2. `applyHighlights` / `clearHighlights` — DOM-side highlighting over
 *    the rendered code body. Prefers the CSS Custom Highlight API
 *    (`CSS.highlights`) which doesn't mutate the DOM; falls back to
 *    wrapping matched text nodes in `<mark class="code-search-match">`.
 */

export interface SearchMatch {
  /** 1-indexed line number where the match starts. */
  startLine: number
  /** 0-indexed column where the match starts. */
  startCol: number
  /** 1-indexed line number where the match ends. */
  endLine: number
  /** 0-indexed column where the match ends (exclusive). */
  endCol: number
}

export type HighlightMode = "css" | "dom"

const HIGHLIGHT_NAME = "code-search"
const MARK_CLASS = "code-search-match"

/**
 * Scan content for case-insensitive plain-text matches. Empty queries and
 * queries with no matches return an empty array. Overlapping matches are
 * returned as non-overlapping hits — the search advances past each match.
 */
export function findMatches(content: string, query: string): SearchMatch[] {
  if (!query) return []
  const haystack = content.toLowerCase()
  const needle = query.toLowerCase()
  const results: SearchMatch[] = []

  let cursor = 0
  while (cursor <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, cursor)
    if (idx === -1) break
    results.push({
      ...positionToLineCol(content, idx),
      ...positionToEnd(content, idx + needle.length),
    })
    cursor = idx + needle.length
  }
  return results
}

function positionToLineCol(content: string, pos: number): { startLine: number; startCol: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < pos; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      line++
      lineStart = i + 1
    }
  }
  return { startLine: line, startCol: pos - lineStart }
}

function positionToEnd(content: string, pos: number): { endLine: number; endCol: number } {
  let line = 1
  let lineStart = 0
  for (let i = 0; i < pos; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      line++
      lineStart = i + 1
    }
  }
  return { endLine: line, endCol: pos - lineStart }
}

/** Walk text nodes within `root` and return them in document order. */
function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

/**
 * Convert byte offsets in the source `content` to DOM Ranges within
 * `root`. Assumes the rendered text reproduces the source content
 * verbatim (Streamdown's Shiki output preserves source whitespace +
 * tokens).
 *
 * Returns null if the rendered text doesn't align with `content` — the
 * caller should fall through to a plain `<pre>` rendering instead.
 */
function buildRanges(
  root: HTMLElement,
  matches: SearchMatch[],
  content: string,
): Range[] | null {
  const textNodes = collectTextNodes(root)
  const renderedText = textNodes.map((n) => n.data).join("")
  // Sanity check: the rendered text should contain the source verbatim.
  if (!renderedText.includes(content) && renderedText !== content) return null

  // Build a flat offset map so we can look up which text node a given
  // source offset lives in.
  const offsets: { node: Text; start: number; end: number }[] = []
  let cursor = 0
  for (const node of textNodes) {
    offsets.push({ node, start: cursor, end: cursor + node.data.length })
    cursor += node.data.length
  }

  const sourceOffsetByLine = lineOffsetsOf(content)
  const ranges: Range[] = []

  for (const m of matches) {
    const startOffset = sourceOffsetByLine[m.startLine - 1] + m.startCol
    const endOffset = sourceOffsetByLine[m.endLine - 1] + m.endCol
    const startNode = offsets.find((o) => startOffset >= o.start && startOffset < o.end)
    const endNode = offsets.find((o) => endOffset > o.start && endOffset <= o.end)
    if (!startNode || !endNode) continue
    const range = document.createRange()
    range.setStart(startNode.node, startOffset - startNode.start)
    range.setEnd(endNode.node, endOffset - endNode.start)
    ranges.push(range)
  }
  return ranges
}

function lineOffsetsOf(content: string): number[] {
  const offsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) offsets.push(i + 1)
  }
  return offsets
}

interface CustomHighlightAPI {
  highlights?: Map<string, unknown> & {
    set(name: string, highlight: unknown): unknown
    delete(name: string): boolean
  }
}

interface HighlightCtor {
  new (...ranges: Range[]): unknown
}

function getHighlightApi(): { CSS: CustomHighlightAPI; Highlight: HighlightCtor } | null {
  if (typeof window === "undefined") return null
  const cssApi = (window as unknown as { CSS?: CustomHighlightAPI }).CSS
  const HighlightCtor = (window as unknown as { Highlight?: HighlightCtor }).Highlight
  if (!cssApi || !cssApi.highlights || !HighlightCtor) return null
  return { CSS: cssApi, Highlight: HighlightCtor }
}

/**
 * Apply highlights to `root` for the given `matches`. Returns the mode
 * used so the caller can pass the right value to `clearHighlights`. When
 * there are zero matches, returns `null` and does nothing.
 *
 * `content` is the source string the matches were computed against —
 * needed for the DOM fallback to align line/col positions to text nodes.
 */
export function applyHighlights(
  root: HTMLElement,
  matches: SearchMatch[],
  content: string,
): HighlightMode | null {
  if (matches.length === 0) return null

  const ranges = buildRanges(root, matches, content)
  if (!ranges || ranges.length === 0) return null

  const api = getHighlightApi()
  if (api) {
    try {
      const highlight = new api.Highlight(...ranges) as unknown
      api.CSS.highlights!.set(HIGHLIGHT_NAME, highlight)
      return "css"
    } catch {
      // fall through to DOM mode
    }
  }

  // DOM fallback: wrap each range in a <mark>. Iterate from the end so
  // earlier ranges keep their offsets after surgery.
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i]
    const mark = document.createElement("mark")
    mark.className = MARK_CLASS
    try {
      range.surroundContents(mark)
    } catch {
      // surroundContents fails on ranges that span element boundaries;
      // give up on this match rather than mutate broken DOM.
    }
  }
  return "dom"
}

/** Tear down highlights applied via `applyHighlights`. */
export function clearHighlights(root: HTMLElement, mode: HighlightMode | null): void {
  if (mode === null) return
  if (mode === "css") {
    const api = getHighlightApi()
    api?.CSS.highlights?.delete(HIGHLIGHT_NAME)
    return
  }
  // mode === "dom"
  const marks = root.querySelectorAll(`mark.${MARK_CLASS}`)
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  // Normalize to merge adjacent text nodes that the wrap/unwrap created.
  root.normalize()
}
```

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run tests/unit/code/search.test.ts
```

Expected: PASS — all describe blocks green. The CSS highlight branch is exercised manually later in the smoke test (jsdom doesn't provide it).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/lib/search.ts tests/unit/code/search.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add lib/search for in-panel match scan + highlighting

- findMatches: case-insensitive plain-text scan returning 1-indexed line/col ranges, advances past each hit so overlaps yield non-overlapping results
- applyHighlights prefers CSS.highlights (non-mutating); falls back to <mark class="code-search-match"> DOM wrapping when the API is unavailable
- clearHighlights tears down either path symmetrically and normalizes adjacent text nodes
- 11 test cases covering pure scan, jsdom DOM-fallback wrap and clear, no-match short-circuit
EOF
)"
```

---

## Task 4: Create `code-source-view.tsx` with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.test.tsx`

Wraps `<Streamdown>` directly (not the shared `StreamdownContent`) so the per-block copy button stays disabled. Owns the search-highlight effect and the plain-`<pre>` fallback.

- [ ] **Step 1: Create the test file**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

// Mock Streamdown so tests stay deterministic — we just render <pre> with the children.
vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => (
    <pre data-testid="streamdown-mock">{children}</pre>
  ),
}))
vi.mock("streamdown/styles.css", () => ({}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

import { CodeSourceView } from "./code-source-view"

describe("CodeSourceView", () => {
  it("wraps content in a fence with the provided language", () => {
    const { getByTestId } = render(
      <CodeSourceView content={"export const x = 1\n"} language="typescript" wrap={false} searchQuery="" />,
    )
    const pre = getByTestId("streamdown-mock")
    expect(pre.textContent).toContain("```typescript")
    expect(pre.textContent).toContain("export const x = 1")
    expect(pre.textContent).toMatch(/```\s*$/)
  })

  it("uses an adaptive fence longer than any backtick run in the content", () => {
    const tricky = "```ts\nconst y = 2\n```"
    const { getByTestId } = render(
      <CodeSourceView content={tricky} language="typescript" wrap={false} searchQuery="" />,
    )
    const text = getByTestId("streamdown-mock").textContent ?? ""
    // A 4-backtick fence should appear because the content has a 3-backtick run.
    expect(text.includes("````typescript")).toBe(true)
  })

  it("applies wrap class when wrap is true", () => {
    const { container } = render(
      <CodeSourceView content="long line" language="typescript" wrap={true} searchQuery="" />,
    )
    const wrapper = container.querySelector("[data-code-source-wrap='true']")
    expect(wrapper).not.toBeNull()
  })

  it("renders an empty-state notice when content is empty", () => {
    const { getByText } = render(
      <CodeSourceView content="" language="typescript" wrap={false} searchQuery="" />,
    )
    expect(getByText(/no content/i)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.test.tsx
```

Expected: FAIL with module-resolution error.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.tsx`

```tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { useTheme } from "next-themes"
import {
  applyHighlights,
  clearHighlights,
  findMatches,
  type HighlightMode,
} from "./lib/search"

interface CodeSourceViewProps {
  content: string
  language: string | undefined
  wrap: boolean
  /** When non-empty, drives the search-highlight effect. */
  searchQuery: string
}

function adaptiveFence(content: string): string {
  const longestRun = (content.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0,
  )
  return "`".repeat(Math.max(3, longestRun + 1))
}

export function CodeSourceView({
  content,
  language,
  wrap,
  searchQuery,
}: CodeSourceViewProps) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const highlightModeRef = useRef<HighlightMode | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  const fenced = useMemo(() => {
    const fence = adaptiveFence(content)
    return `${fence}${language ?? ""}\n${content}\n${fence}`
  }, [content, language])

  // Apply / re-apply highlights whenever the search query or content changes.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    // Tear down any existing highlights first.
    clearHighlights(root, highlightModeRef.current)
    highlightModeRef.current = null

    if (!searchQuery || !content) return

    // Defer one frame so Streamdown has finished painting.
    const id = window.requestAnimationFrame(() => {
      const matches = findMatches(content, searchQuery)
      highlightModeRef.current = applyHighlights(root, matches, content)
    })
    return () => {
      window.cancelAnimationFrame(id)
      if (root) clearHighlights(root, highlightModeRef.current)
      highlightModeRef.current = null
    }
  }, [searchQuery, content])

  if (!content) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        No content yet.
      </div>
    )
  }

  if (renderError) {
    return (
      <pre className="font-mono text-xs whitespace-pre-wrap p-4 overflow-auto">
        {content}
      </pre>
    )
  }

  return (
    <div
      ref={containerRef}
      data-code-source-wrap={wrap ? "true" : "false"}
      className={
        wrap
          ? "[&_pre]:whitespace-pre-wrap [&_pre]:break-words"
          : "[&_pre]:whitespace-pre [&_pre]:overflow-x-auto"
      }
    >
      <ErrorBoundary onError={(msg) => setRenderError(msg)}>
        <Streamdown
          shikiTheme={
            resolvedTheme === "dark"
              ? ["github-dark", "github-light"]
              : ["github-light", "github-dark"]
          }
          controls={{ code: false }}
        >
          {fenced}
        </Streamdown>
      </ErrorBoundary>
    </div>
  )
}

class ErrorBoundary extends (
  globalThis as unknown as {
    React: typeof import("react")
  }
).React.Component<
  { children: React.ReactNode; onError: (msg: string) => void },
  { errored: boolean }
> {
  state = { errored: false }
  static getDerivedStateFromError() {
    return { errored: true }
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message)
  }
  render() {
    if (this.state.errored) return null
    return this.props.children
  }
}
```

> **Implementation note**: the `ErrorBoundary` class is imported from React proper. Replace the awkward `globalThis as unknown as { React: typeof import("react") }` shim with a normal `import { Component } from "react"` at the top of the file and `class ErrorBoundary extends Component<...>` syntax. The shim above is a placeholder to avoid name collision with the existing import; clean it up before committing.

Final import-pattern (use this in the actual file):

```tsx
"use client"

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Streamdown } from "streamdown"
import "streamdown/styles.css"
import { useTheme } from "next-themes"
import {
  applyHighlights,
  clearHighlights,
  findMatches,
  type HighlightMode,
} from "./lib/search"

// ... the props + adaptiveFence + CodeSourceView function as above ...

class ErrorBoundary extends Component<
  { children: ReactNode; onError: (msg: string) => void },
  { errored: boolean }
> {
  state = { errored: false }
  static getDerivedStateFromError() {
    return { errored: true }
  }
  componentDidCatch(err: Error) {
    this.props.onError(err.message)
  }
  render() {
    if (this.state.errored) return null
    return this.props.children
  }
}
```

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.test.tsx
```

Expected: PASS — 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.tsx src/features/conversations/components/chat/artifacts/renderers/code/code-source-view.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add CodeSourceView wrapping Streamdown directly

- mounts Streamdown with controls.code=false so the panel header is the single source of truth for copy
- adaptive fence (max(3, longestBacktickRun + 1)) handles content with embedded backtick runs
- wrap prop toggles whitespace-pre vs whitespace-pre-wrap on the rendered pre
- search-highlight effect runs on rAF, tears down on unmount or query change, uses lib/search
- ErrorBoundary fallback renders plain pre on Streamdown throw
- empty-content notice when content is the empty string
EOF
)"
```

---

## Task 5: Create `code-search-bar.tsx` with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.test.tsx`

- [ ] **Step 1: Create the test file**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { CodeSearchBar } from "./code-search-bar"

describe("CodeSearchBar", () => {
  it("renders the input and match count", () => {
    const { getByPlaceholderText, getByText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={3}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    expect(getByPlaceholderText(/search/i)).not.toBeNull()
    expect(getByText("1 of 3")).not.toBeNull()
  })

  it("renders 'no matches' when query is non-empty and matchCount is 0", () => {
    const { getByText } = render(
      <CodeSearchBar
        query="zzz"
        onQueryChange={() => {}}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    expect(getByText(/no matches/i)).not.toBeNull()
  })

  it("does not render a count badge when query is empty", () => {
    const { queryByText } = render(
      <CodeSearchBar
        query=""
        onQueryChange={() => {}}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    expect(queryByText(/no matches/i)).toBeNull()
    expect(queryByText(/of/i)).toBeNull()
  })

  it("fires onQueryChange when user types", () => {
    const onQueryChange = vi.fn()
    const { getByPlaceholderText } = render(
      <CodeSearchBar
        query=""
        onQueryChange={onQueryChange}
        matchCount={0}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.change(getByPlaceholderText(/search/i), { target: { value: "abc" } })
    expect(onQueryChange).toHaveBeenCalledWith("abc")
  })

  it("fires onPrev/onNext when chevrons clicked", () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const { getByLabelText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={2}
        matchIndex={0}
        onPrev={onPrev}
        onNext={onNext}
        onClose={() => {}}
      />,
    )
    fireEvent.click(getByLabelText(/previous match/i))
    fireEvent.click(getByLabelText(/next match/i))
    expect(onPrev).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
  })

  it("fires onClose when Escape pressed", () => {
    const onClose = vi.fn()
    const { getByPlaceholderText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={1}
        matchIndex={0}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(getByPlaceholderText(/search/i), { key: "Escape" })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("fires onNext when Enter pressed and onPrev when Shift+Enter pressed", () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const { getByPlaceholderText } = render(
      <CodeSearchBar
        query="foo"
        onQueryChange={() => {}}
        matchCount={2}
        matchIndex={0}
        onPrev={onPrev}
        onNext={onNext}
        onClose={() => {}}
      />,
    )
    fireEvent.keyDown(getByPlaceholderText(/search/i), { key: "Enter" })
    fireEvent.keyDown(getByPlaceholderText(/search/i), { key: "Enter", shiftKey: true })
    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrev).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.tsx`

```tsx
"use client"

import { useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight, Search } from "@/lib/icons"

interface CodeSearchBarProps {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  matchIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}

export function CodeSearchBar({
  query,
  onQueryChange,
  matchCount,
  matchIndex,
  onPrev,
  onNext,
  onClose,
}: CodeSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const showNoMatches = query.length > 0 && matchCount === 0
  const showCount = query.length > 0 && matchCount > 0

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-muted/30">
      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onClose()
          } else if (e.key === "Enter") {
            e.preventDefault()
            if (e.shiftKey) onPrev()
            else onNext()
          }
        }}
        placeholder="Search in code…"
        className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
      />
      {showCount && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {matchIndex + 1} of {matchCount}
        </span>
      )}
      {showNoMatches && (
        <span className="text-xs text-muted-foreground shrink-0">No matches</span>
      )}
      <button
        type="button"
        aria-label="Previous match"
        onClick={onPrev}
        disabled={matchCount === 0}
        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Next match"
        onClick={onNext}
        disabled={matchCount === 0}
        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

> **Note:** verify `Search` is exported from `@/lib/icons`. If the central icon barrel doesn't have it, add it there as a single new line — don't import from `lucide-react` directly (the codebase routes all icons through `@/lib/icons` per the existing pattern, see `streamdown-content.tsx:11`).

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.test.tsx
```

Expected: PASS — 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.tsx src/features/conversations/components/chat/artifacts/renderers/code/code-search-bar.test.tsx src/lib/icons.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add CodeSearchBar with match nav and keyboard shortcuts

- controlled input with autofocus on mount
- Enter advances to next match, Shift+Enter to previous, Escape closes
- shows '<n> of <m>' count when matches exist, 'No matches' otherwise, nothing when query is empty
- prev/next buttons disabled when matchCount is 0
- 7 test cases covering each branch
EOF
)"
```

---

## Task 6: Create `code-toolbar.tsx` with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.test.tsx`

- [ ] **Step 1: Create the test file**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { CodeToolbar } from "./code-toolbar"

describe("CodeToolbar", () => {
  const baseProps = {
    language: "typescript",
    isCanonicalLanguage: true,
    isStreaming: false,
    wrap: false,
    onWrapToggle: () => {},
    searchOpen: false,
    onSearchToggle: () => {},
    diffMode: false,
    onDiffToggle: () => {},
    diffEnabled: true,
    diffDisabledReason: undefined as string | undefined,
  }

  it("renders the language pill with the current language", () => {
    const { getByText } = render(<CodeToolbar {...baseProps} />)
    expect(getByText("typescript")).not.toBeNull()
  })

  it("shows a warning icon next to the language pill for off-canonical languages", () => {
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} isCanonicalLanguage={false} />,
    )
    expect(getByLabelText(/off-canonical language/i)).not.toBeNull()
  })

  it("shows the streaming pill when isStreaming is true", () => {
    const { getByText } = render(<CodeToolbar {...baseProps} isStreaming={true} />)
    expect(getByText(/writing/i)).not.toBeNull()
  })

  it("toggles wrap when the wrap button is clicked", () => {
    const onWrapToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} onWrapToggle={onWrapToggle} />,
    )
    fireEvent.click(getByLabelText(/wrap/i))
    expect(onWrapToggle).toHaveBeenCalledOnce()
  })

  it("toggles search when the search button is clicked", () => {
    const onSearchToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} onSearchToggle={onSearchToggle} />,
    )
    fireEvent.click(getByLabelText(/search/i))
    expect(onSearchToggle).toHaveBeenCalledOnce()
  })

  it("toggles diff when the diff button is clicked and diffEnabled", () => {
    const onDiffToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar {...baseProps} onDiffToggle={onDiffToggle} />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    expect(onDiffToggle).toHaveBeenCalledOnce()
  })

  it("disables the diff toggle when diffEnabled is false", () => {
    const onDiffToggle = vi.fn()
    const { getByLabelText } = render(
      <CodeToolbar
        {...baseProps}
        diffEnabled={false}
        diffDisabledReason="No previous version to compare"
        onDiffToggle={onDiffToggle}
      />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onDiffToggle).not.toHaveBeenCalled()
  })

  it("renders the active state outline when wrap is true", () => {
    const { getByLabelText } = render(<CodeToolbar {...baseProps} wrap={true} />)
    expect(getByLabelText(/wrap/i).getAttribute("data-active")).toBe("true")
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.tsx`

```tsx
"use client"

import { AlertTriangle, GitCompareArrows, Search, WrapText } from "@/lib/icons"

interface CodeToolbarProps {
  language: string | undefined
  isCanonicalLanguage: boolean
  isStreaming: boolean
  wrap: boolean
  onWrapToggle: () => void
  searchOpen: boolean
  onSearchToggle: () => void
  diffMode: boolean
  onDiffToggle: () => void
  diffEnabled: boolean
  diffDisabledReason?: string
}

export function CodeToolbar({
  language,
  isCanonicalLanguage,
  isStreaming,
  wrap,
  onWrapToggle,
  searchOpen,
  onSearchToggle,
  diffMode,
  onDiffToggle,
  diffEnabled,
  diffDisabledReason,
}: CodeToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-muted/20 text-xs shrink-0">
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
        {language ?? "plain"}
        {!isCanonicalLanguage && (
          <span
            aria-label="Off-canonical language — Shiki may render this as plain text"
            title="Off-canonical language — Shiki may render this as plain text"
            className="text-amber-500"
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </span>
      {isStreaming && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          writing…
        </span>
      )}

      <div className="flex-1" />

      <button
        type="button"
        aria-label={wrap ? "Disable line wrap" : "Enable line wrap"}
        title={wrap ? "Disable line wrap" : "Enable line wrap"}
        data-active={wrap ? "true" : "false"}
        onClick={onWrapToggle}
        className={
          "p-1 rounded hover:bg-muted " +
          (wrap ? "outline outline-1 outline-foreground/40" : "")
        }
      >
        <WrapText className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        aria-label={searchOpen ? "Close search" : "Search in code"}
        title={searchOpen ? "Close search" : "Search in code (Ctrl+F)"}
        data-active={searchOpen ? "true" : "false"}
        onClick={onSearchToggle}
        className={
          "p-1 rounded hover:bg-muted " +
          (searchOpen ? "outline outline-1 outline-foreground/40" : "")
        }
      >
        <Search className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        aria-label={diffMode ? "Hide diff" : "Show diff vs previous version"}
        title={diffEnabled ? (diffMode ? "Hide diff" : "Show diff vs previous version") : diffDisabledReason}
        data-active={diffMode ? "true" : "false"}
        onClick={onDiffToggle}
        disabled={!diffEnabled}
        className={
          "p-1 rounded hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed " +
          (diffMode ? "outline outline-1 outline-foreground/40" : "")
        }
      >
        <GitCompareArrows className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

> **Note:** verify `WrapText`, `GitCompareArrows`, `AlertTriangle`, `Search` are all exported from `@/lib/icons`. Add any missing one as a single re-export line in `src/lib/icons.ts`. The codebase's icon-barrel pattern is the only legitimate source for icons (see existing renderers).

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.test.tsx
```

Expected: PASS — 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.tsx src/features/conversations/components/chat/artifacts/renderers/code/code-toolbar.test.tsx src/lib/icons.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add CodeToolbar with language pill, wrap, search, diff

- language pill shows the current Shiki language; off-canonical languages get an inline AlertTriangle with explanatory tooltip
- streaming pill (animated dot + 'writing…') visible only during artifact streaming
- wrap, search, diff buttons each render an active-outline state via data-active and outline classes
- diff button disabled with reason tooltip when diffEnabled is false
- 8 test cases covering pill rendering, button behaviour, disabled state
EOF
)"
```

---

## Task 7: Create `code-diff-view.tsx` with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.test.tsx`

- [ ] **Step 1: Create the test file**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { CodeDiffView } from "./code-diff-view"

describe("CodeDiffView", () => {
  const baseProps = {
    prevState: { kind: "ok" as const, content: "a\nb\n" },
    after: "a\nB\n",
    layout: "unified" as const,
    onLayoutChange: () => {},
    wrap: false,
    onRestorePrevious: undefined as ((versionNum: number) => void) | undefined,
    previousVersionNum: 1,
  }

  it("renders a centered spinner when prevState is loading", () => {
    const { getByText } = render(
      <CodeDiffView {...baseProps} prevState="loading" />,
    )
    expect(getByText(/loading previous version/i)).not.toBeNull()
  })

  it("renders an error notice with a Retry button when prevState.kind === 'error'", () => {
    const onLayoutChange = vi.fn()
    const { getByText, getByRole } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "error", message: "network down" }}
        onLayoutChange={onLayoutChange}
      />,
    )
    expect(getByText(/network down/i)).not.toBeNull()
    expect(getByRole("button", { name: /retry/i })).not.toBeNull()
  })

  it("renders the archived notice with a Restore button when prevState.kind === 'archived'", () => {
    const onRestore = vi.fn()
    const { getByText, getByRole } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "archived" }}
        onRestorePrevious={onRestore}
      />,
    )
    expect(getByText(/archived to storage/i)).not.toBeNull()
    fireEvent.click(getByRole("button", { name: /restore/i }))
    expect(onRestore).toHaveBeenCalledWith(1)
  })

  it("renders 'no changes' when prevState content equals after", () => {
    const { getByText } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "ok", content: "same\n" }}
        after="same\n"
      />,
    )
    expect(getByText(/no changes between/i)).not.toBeNull()
  })

  it("renders unified diff with added/removed lines", () => {
    const { getByText, container } = render(<CodeDiffView {...baseProps} />)
    expect(getByText("a")).not.toBeNull()
    expect(getByText("B")).not.toBeNull()
    expect(container.querySelectorAll("[data-diff-kind='added']").length).toBeGreaterThan(0)
    expect(container.querySelectorAll("[data-diff-kind='removed']").length).toBeGreaterThan(0)
  })

  it("renders split diff with two columns when layout is split", () => {
    const { container } = render(<CodeDiffView {...baseProps} layout="split" />)
    expect(container.querySelectorAll("[data-diff-column='left']")).toHaveLength(1)
    expect(container.querySelectorAll("[data-diff-column='right']")).toHaveLength(1)
  })

  it("calls onLayoutChange when the layout toggle is clicked", () => {
    const onLayoutChange = vi.fn()
    const { getByRole } = render(
      <CodeDiffView {...baseProps} onLayoutChange={onLayoutChange} />,
    )
    fireEvent.click(getByRole("button", { name: /split/i }))
    expect(onLayoutChange).toHaveBeenCalledWith("split")
  })

  it("warns about large diffs when over 5000 lines", () => {
    const huge = Array.from({ length: 6000 }, (_, i) => `line${i}`).join("\n")
    const { getByText } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "ok", content: huge }}
        after={huge + "\nextra"}
      />,
    )
    expect(getByText(/large diff/i)).not.toBeNull()
  })

  it("does not crash on a 50k-line input", () => {
    const huge = "x\n".repeat(50_000)
    const { container } = render(
      <CodeDiffView
        {...baseProps}
        prevState={{ kind: "ok", content: huge }}
        after={huge + "y\n"}
      />,
    )
    expect(container.firstChild).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.tsx`

```tsx
"use client"

import { useMemo } from "react"
import { Loader2, RotateCcw } from "@/lib/icons"
import {
  computeSplitDiff,
  computeUnifiedDiff,
  type DiffLine,
} from "./lib/diff"

export type DiffLayout = "unified" | "split"

export type PrevVersionFetchResult =
  | { kind: "ok"; content: string }
  | { kind: "archived" }
  | { kind: "error"; message: string }

export type PrevVersionState = "idle" | "loading" | PrevVersionFetchResult

interface CodeDiffViewProps {
  /** State of the previous-version fetch driven by the parent CodeRenderer. */
  prevState: PrevVersionState
  after: string
  layout: DiffLayout
  onLayoutChange: (next: DiffLayout) => void
  wrap: boolean
  /** Called with the version number to restore when the archived-state Restore button is clicked. */
  onRestorePrevious?: (versionNum: number) => void
  /** Version number of the "before" side — used for the Restore button payload. */
  previousVersionNum: number
  /** Re-invokes the parent's fetcher; surfaced on the error-state Retry button. */
  onRetry?: () => void
}

const LARGE_DIFF_LINE_THRESHOLD = 5000

export function CodeDiffView({
  prevState,
  after,
  layout,
  onLayoutChange,
  wrap,
  onRestorePrevious,
  previousVersionNum,
  onRetry,
}: CodeDiffViewProps) {
  if (prevState === "idle") {
    // Defensive — the parent should be transitioning to "loading" on diff entry.
    return <NoticeCard>Preparing diff…</NoticeCard>
  }
  if (prevState === "loading") {
    return (
      <NoticeCard>
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading previous version…
        </span>
      </NoticeCard>
    )
  }
  if (prevState.kind === "error") {
    return (
      <NoticeCard>
        Could not load previous version: {prevState.message}.
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-foreground/10 hover:bg-foreground/20"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}
      </NoticeCard>
    )
  }
  if (prevState.kind === "archived") {
    return (
      <NoticeCard>
        Diff unavailable — the previous version&apos;s content was archived to
        storage and isn&apos;t loaded into the panel.
        {onRestorePrevious && (
          <button
            type="button"
            onClick={() => onRestorePrevious(previousVersionNum)}
            className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-foreground/10 hover:bg-foreground/20"
          >
            <RotateCcw className="h-3 w-3" />
            Restore v{previousVersionNum}
          </button>
        )}
      </NoticeCard>
    )
  }

  return (
    <DiffBody
      before={prevState.content}
      after={after}
      layout={layout}
      onLayoutChange={onLayoutChange}
      wrap={wrap}
      previousVersionNum={previousVersionNum}
    />
  )
}

interface DiffBodyProps {
  before: string
  after: string
  layout: DiffLayout
  onLayoutChange: (next: DiffLayout) => void
  wrap: boolean
  previousVersionNum: number
}

function DiffBody({ before, after, layout, onLayoutChange, wrap, previousVersionNum }: DiffBodyProps) {
  const unified = useMemo(() => computeUnifiedDiff(before, after), [before, after])
  const split = useMemo(
    () => (layout === "split" ? computeSplitDiff(before, after) : null),
    [before, after, layout],
  )

  if (unified.kind === "error") {
    return (
      <NoticeCard>
        Could not compute diff: {unified.message}.
      </NoticeCard>
    )
  }
  if (unified.kind === "ok" && unified.identical) {
    return (
      <NoticeCard>
        No changes between v{previousVersionNum} and the current version.
      </NoticeCard>
    )
  }
  if (unified.kind === "archived") {
    // Defensive — should be handled by the parent, but keep correctness here too.
    return <NoticeCard>Diff unavailable.</NoticeCard>
  }

  const lineCount = unified.lines.length
  const showLargeWarning = lineCount > LARGE_DIFF_LINE_THRESHOLD

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/50 bg-muted/20 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {lineCount} line{lineCount === 1 ? "" : "s"}
          {showLargeWarning && (
            <span className="ml-2 text-amber-500">large diff — rendering may be slow</span>
          )}
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Diff layout">
          <button
            type="button"
            aria-label="Unified layout"
            onClick={() => onLayoutChange("unified")}
            data-active={layout === "unified" ? "true" : "false"}
            className={
              "px-2 py-0.5 rounded " +
              (layout === "unified" ? "bg-background outline outline-1 outline-foreground/40" : "hover:bg-muted")
            }
          >
            Unified
          </button>
          <button
            type="button"
            aria-label="Split layout"
            onClick={() => onLayoutChange("split")}
            data-active={layout === "split" ? "true" : "false"}
            className={
              "px-2 py-0.5 rounded " +
              (layout === "split" ? "bg-background outline outline-1 outline-foreground/40" : "hover:bg-muted")
            }
          >
            Split
          </button>
        </div>
      </div>
      {layout === "unified" ? (
        <UnifiedTable lines={unified.lines} wrap={wrap} />
      ) : split && split.kind === "ok" ? (
        <SplitTable left={split.left} right={split.right} wrap={wrap} />
      ) : (
        <NoticeCard>Could not compute split diff.</NoticeCard>
      )}
    </div>
  )
}

function UnifiedTable({ lines, wrap }: { lines: DiffLine[]; wrap: boolean }) {
  return (
    <div className="overflow-auto flex-1">
      <table className="w-full font-mono text-xs">
        <tbody>
          {lines.map((line, i) => (
            <DiffRow key={i} line={line} wrap={wrap} showBothNums />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SplitTable({ left, right, wrap }: { left: DiffLine[]; right: DiffLine[]; wrap: boolean }) {
  return (
    <div className="overflow-auto flex-1 grid grid-cols-2 gap-px bg-border/40">
      <div data-diff-column="left" className="bg-background overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <tbody>
            {left.map((line, i) => (
              <DiffRow key={`l-${i}`} line={line} wrap={wrap} showBothNums={false} side="before" />
            ))}
          </tbody>
        </table>
      </div>
      <div data-diff-column="right" className="bg-background overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <tbody>
            {right.map((line, i) => (
              <DiffRow key={`r-${i}`} line={line} wrap={wrap} showBothNums={false} side="after" />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DiffRow({
  line,
  wrap,
  showBothNums,
  side,
}: {
  line: DiffLine
  wrap: boolean
  showBothNums: boolean
  side?: "before" | "after"
}) {
  const bg =
    line.kind === "added"
      ? "bg-green-500/10"
      : line.kind === "removed"
      ? "bg-red-500/10"
      : "bg-transparent"
  const marker =
    line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "
  const num = (n: number | null) =>
    n === null ? "" : String(n)

  return (
    <tr data-diff-kind={line.kind} className={bg}>
      {showBothNums && (
        <td className="select-none text-right pr-2 pl-3 text-muted-foreground/70 tabular-nums w-10">
          {num(line.beforeLineNum)}
        </td>
      )}
      <td className="select-none text-right pr-2 text-muted-foreground/70 tabular-nums w-10">
        {showBothNums ? num(line.afterLineNum) : num(side === "before" ? line.beforeLineNum : line.afterLineNum)}
      </td>
      <td className="pr-2 text-muted-foreground/80 select-none w-4">{marker}</td>
      <td className={wrap ? "whitespace-pre-wrap break-words pr-3" : "whitespace-pre pr-3"}>
        {line.text}
      </td>
    </tr>
  )
}

function NoticeCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center p-8 text-sm text-muted-foreground text-center">
      <div className="max-w-md">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.test.tsx
```

Expected: PASS — 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.tsx src/features/conversations/components/chat/artifacts/renderers/code/code-diff-view.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add CodeDiffView with unified and split layouts

- empty-state notice when before is undefined; archived-state notice with Restore button when before equals ARCHIVED_SENTINEL; identical notice when no changes
- unified table: line-number gutter for both sides, +/- marker column, content column with wrap-aware whitespace handling
- split layout: two columns with empty-context padding from computeSplitDiff
- layout toggle (Unified | Split) above the table
- large-diff warning when total line count exceeds 5000
- 8 test cases covering each rendering branch
EOF
)"
```

---

## Task 8: Create the previous-version GET endpoint

**Files:**
- Create: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/versions/[versionNum]/route.ts`
- Create: `tests/unit/api/artifacts-versions.test.ts`

This is the only server-side change. Read-only GET endpoint that returns the bytes of a previous version, gated by the same session-ownership check the existing artifact GET uses. Pattern-matches `render-pages/[contentHash]/[pageIndex]/route.ts` (~44 LoC).

Before writing, verify the auth + service helpers actually exist by greppingthe codebase:

```bash
grep -n 'getDashboardChatSessionArtifact\|findDashboardSessionBasicByIdAndUser' src/features/conversations/sessions/service.ts | head -5
```

Both should resolve. If `getDashboardChatSessionArtifact` is the only public service helper, use that — it already encapsulates the ownership check.

- [ ] **Step 1: Inspect the existing artifact GET to copy patterns**

Read `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/route.ts` (~119 LoC). Note:
- How auth is acquired (likely `auth()` from NextAuth, returning `session.user.id`)
- How session ownership is enforced (the service helper does it)
- Response shape on 404 / success

The new endpoint mirrors this structure exactly but resolves a specific `versionNum` from `metadata.versions` and serves the S3 bytes.

- [ ] **Step 2: Write the failing test**

Path: `tests/unit/api/artifacts-versions.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the service layer + S3 helper before importing the route.
const mockGetArtifact = vi.fn()
const mockS3Get = vi.fn()

vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: mockGetArtifact,
}))
vi.mock("@/lib/s3", () => ({
  getObject: mockS3Get,
}))
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))

// Now import the route.
import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/versions/[versionNum]/route"

const baseParams = { id: "session-1", artifactId: "art-1", versionNum: "1" }

function makeReq() {
  return new Request("http://localhost/api/dashboard/chat/sessions/session-1/artifacts/art-1/versions/1")
}

describe("GET /artifacts/[id]/versions/[N]", () => {
  beforeEach(() => {
    mockGetArtifact.mockReset()
    mockS3Get.mockReset()
  })

  it("returns 404 when the artifact is not found or not owned", async () => {
    mockGetArtifact.mockResolvedValue(null)
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(404)
  })

  it("returns 404 when the version index is out of range", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: { versions: [] },
    })
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(404)
  })

  it("returns 410 when the version was archive-failed", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { archiveFailed: true, title: "x", timestamp: 1, contentLength: 10 },
        ],
      },
    })
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body).toMatchObject({ error: "archived" })
  })

  it("returns 200 with text/plain bytes from S3 when the version has an s3Key", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { s3Key: "artifacts/org/sess/art-1.v1", title: "x", timestamp: 1, contentLength: 10 },
        ],
      },
    })
    mockS3Get.mockResolvedValue(Buffer.from("export const x = 1\n", "utf-8"))
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/)
    expect(res.headers.get("Cache-Control")).toMatch(/private/)
    const text = await res.text()
    expect(text).toBe("export const x = 1\n")
  })

  it("returns 200 with inline content when the version has fallback content", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { content: "inline body", title: "x", timestamp: 1, contentLength: 11 },
        ],
      },
    })
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("inline body")
  })

  it("returns 502 when S3 throws", async () => {
    mockGetArtifact.mockResolvedValue({
      id: "art-1",
      metadata: {
        versions: [
          { s3Key: "artifacts/org/sess/art-1.v1", title: "x", timestamp: 1, contentLength: 10 },
        ],
      },
    })
    mockS3Get.mockRejectedValue(new Error("network down"))
    const res = await GET(makeReq(), { params: Promise.resolve(baseParams) })
    expect(res.status).toBe(502)
  })

  it("returns 400 when versionNum is not a positive integer", async () => {
    const res = await GET(makeReq(), {
      params: Promise.resolve({ ...baseParams, versionNum: "abc" }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run tests; expect failure**

Run:
```bash
bun run vitest run tests/unit/api/artifacts-versions.test.ts
```

Expected: FAIL with module-resolution error (route doesn't exist yet).

- [ ] **Step 4: Create the route**

Path: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/versions/[versionNum]/route.ts`

```ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getObject } from "@/lib/s3"
import { getDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"

interface VersionRecord {
  s3Key?: string
  content?: string
  archiveFailed?: boolean
  title?: string
  timestamp?: number
  contentLength?: number
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; artifactId: string; versionNum: string }> },
) {
  const { id: sessionId, artifactId, versionNum: versionNumRaw } = await ctx.params

  const versionNum = Number.parseInt(versionNumRaw, 10)
  if (!Number.isInteger(versionNum) || versionNum < 1) {
    return NextResponse.json({ error: "invalid versionNum" }, { status: 400 })
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const artifact = await getDashboardChatSessionArtifact({
    sessionId,
    artifactId,
    userId: session.user.id,
  })
  if (!artifact) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const versions =
    (artifact.metadata as { versions?: VersionRecord[] } | null | undefined)
      ?.versions ?? []
  const record = versions[versionNum - 1]
  if (!record) {
    return NextResponse.json({ error: "version not found" }, { status: 404 })
  }
  if (record.archiveFailed) {
    return NextResponse.json({ error: "archived" }, { status: 410 })
  }

  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "private, max-age=3600",
  })

  if (typeof record.content === "string") {
    return new Response(record.content, { status: 200, headers })
  }
  if (record.s3Key) {
    try {
      const buf = await getObject(record.s3Key)
      return new Response(buf, { status: 200, headers })
    } catch (err) {
      console.error("[versions/GET] S3 fetch failed:", err)
      return NextResponse.json({ error: "fetch failed" }, { status: 502 })
    }
  }

  return NextResponse.json({ error: "version has no content" }, { status: 404 })
}
```

> **Note:** confirm the actual exports of `@/lib/s3` — the helper might be named `getObject`, `s3Get`, or `downloadFile`. Adjust the import accordingly. The test mock uses `getObject`; harmonize names before running the test. Also verify `getDashboardChatSessionArtifact`'s actual signature — the mock assumes `{ sessionId, artifactId, userId }`.

- [ ] **Step 5: Run tests; expect pass**

Run:
```bash
bun run vitest run tests/unit/api/artifacts-versions.test.ts
```

Expected: PASS — 7 cases green.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/versions/[versionNum]/route.ts tests/unit/api/artifacts-versions.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(api/artifacts): add GET route for previous-version content

- new endpoint /api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/versions/[N] returns text/plain bytes for a specific version
- auth gate reuses getDashboardChatSessionArtifact session-ownership check (same as the existing artifact GET)
- 404 on artifact-not-found or version-out-of-range; 410 on archiveFailed; 502 on S3 fetch failure; 400 on invalid versionNum
- Cache-Control: private, max-age=3600 since versioned S3 keys are immutable
- 7 test cases covering each branch with mocked auth + service + S3
EOF
)"
```

---

## Task 9: Create `code-renderer.tsx` (root) with tests

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.tsx`
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.test.tsx`

- [ ] **Step 1: Create the test file**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => <pre data-testid="sd">{children}</pre>,
}))
vi.mock("streamdown/styles.css", () => ({}))
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }))

import { CodeRenderer } from "./code-renderer"
import type { Artifact } from "../../types"

const baseArtifact: Artifact = {
  id: "art-1",
  title: "debounce.ts",
  type: "application/code",
  content: "export const x = 1\n",
  language: "typescript",
  version: 2,
  previousVersions: [],
}

describe("CodeRenderer", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })
  afterEach(() => {
    sessionStorage.clear()
  })

  it("defaults to source mode and renders content via Streamdown", () => {
    const { getByTestId } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    expect(getByTestId("sd")).not.toBeNull()
  })

  it("disables the diff toggle when hasPreviousVersion is false", () => {
    const { getByLabelText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it("enables the diff toggle when hasPreviousVersion is true and not streaming", () => {
    const { getByLabelText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={async () => ({ kind: "ok", content: "old" })}
      />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it("disables the diff toggle while streaming even when hasPreviousVersion is true", () => {
    const streaming: Artifact = { ...baseArtifact, id: "streaming-tool-call-1" }
    const { getByLabelText, getByText } = render(
      <CodeRenderer
        artifact={streaming}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={async () => ({ kind: "ok", content: "old" })}
      />,
    )
    const button = getByLabelText(/diff/i) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(getByText(/writing/i)).not.toBeNull()
  })

  it("opens the search bar when the search toggle is clicked and closes on Escape", () => {
    const { getByLabelText, queryByPlaceholderText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    fireEvent.click(getByLabelText(/search/i))
    const input = queryByPlaceholderText(/search/i) as HTMLInputElement
    expect(input).not.toBeNull()
    fireEvent.keyDown(input, { key: "Escape" })
    expect(queryByPlaceholderText(/search/i)).toBeNull()
  })

  it("invokes fetchPreviousVersion when the user enters diff mode the first time", async () => {
    const fetcher = vi.fn().mockResolvedValue({ kind: "ok" as const, content: "export const x = 0\n" })
    const { getByLabelText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
      />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  })

  it("shows the loading state while the fetcher is in flight", async () => {
    let resolveIt: (v: { kind: "ok"; content: string }) => void = () => {}
    const fetcher = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveIt = resolve as typeof resolveIt }),
    )
    const { getByLabelText, getByText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
      />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    expect(getByText(/loading previous version/i)).not.toBeNull()
    resolveIt({ kind: "ok", content: "old" })
  })

  it("does not refetch when toggling diff off and back on (caching)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ kind: "ok" as const, content: "old" })
    const { getByLabelText } = render(
      <CodeRenderer
        artifact={baseArtifact}
        hasPreviousVersion={true}
        previousVersionNum={1}
        fetchPreviousVersion={fetcher}
      />,
    )
    fireEvent.click(getByLabelText(/diff/i))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    fireEvent.click(getByLabelText(/diff/i))
    fireEvent.click(getByLabelText(/diff/i))
    // Still 1 — renderer caches the resolved state.
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("persists wrap toggle state in sessionStorage keyed on artifact id", () => {
    const { getByLabelText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    fireEvent.click(getByLabelText(/wrap/i))
    expect(sessionStorage.getItem("code-wrap:art-1")).toBe("true")
  })

  it("hydrates wrap state from sessionStorage on mount", () => {
    sessionStorage.setItem("code-wrap:art-1", "true")
    const { getByLabelText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    expect(getByLabelText(/wrap/i).getAttribute("data-active")).toBe("true")
  })

  it("shows the off-canonical language warning when language is not on the Shiki list", () => {
    const odd: Artifact = { ...baseArtifact, language: "nim" }
    const { getByLabelText } = render(
      <CodeRenderer artifact={odd} hasPreviousVersion={false} />,
    )
    expect(getByLabelText(/off-canonical language/i)).not.toBeNull()
  })

  it("intercepts Cmd/Ctrl+F to open search when panel has focus", () => {
    const { container, queryByPlaceholderText } = render(
      <CodeRenderer artifact={baseArtifact} hasPreviousVersion={false} />,
    )
    const root = container.firstChild as HTMLElement
    fireEvent.keyDown(root, { key: "f", ctrlKey: true })
    expect(queryByPlaceholderText(/search/i)).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests; expect failure**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.test.tsx
```

Expected: FAIL with module-resolution error.

- [ ] **Step 3: Create the implementation**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.tsx`

```tsx
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Artifact } from "../../types"
import { CodeToolbar } from "./code-toolbar"
import { CodeSearchBar } from "./code-search-bar"
import { CodeSourceView } from "./code-source-view"
import { CodeDiffView, type DiffLayout } from "./code-diff-view"
import { findMatches } from "./lib/search"
import { CODE_LANGUAGE_EXTENSIONS } from "./lib/filename"

import type { PrevVersionFetchResult, PrevVersionState } from "./code-diff-view"

interface CodeRendererProps {
  artifact: Artifact
  /** True when the artifact has at least one previous version. Drives the diff toggle's enabled state without requiring a fetch. */
  hasPreviousVersion: boolean
  /** Version number of the immediately previous version (1-indexed). Used by the Restore button label. */
  previousVersionNum?: number
  /** Lazy fetcher for previous-version content. Invoked the first time the user enters diff mode. Panel-side caches results. */
  fetchPreviousVersion?: () => Promise<PrevVersionFetchResult>
  /** Wired by the panel to handleRestoreVersion. */
  onRestoreVersion?: (versionNum: number) => void
}

const CANONICAL_LANGUAGES_SET = new Set(Object.keys(CODE_LANGUAGE_EXTENSIONS))

function wrapStorageKey(artifactId: string): string {
  return `code-wrap:${artifactId}`
}

export function CodeRenderer({
  artifact,
  hasPreviousVersion,
  previousVersionNum,
  fetchPreviousVersion,
  onRestoreVersion,
}: CodeRendererProps) {
  const isStreaming = artifact.id.startsWith("streaming-")
  const language = artifact.language
  const isCanonicalLanguage =
    !language || CANONICAL_LANGUAGES_SET.has(language.toLowerCase().trim())

  const [mode, setMode] = useState<"source" | "diff">("source")
  const [wrap, setWrap] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.sessionStorage.getItem(wrapStorageKey(artifact.id)) === "true"
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [matchIndex, setMatchIndex] = useState(0)
  const [diffLayout, setDiffLayout] = useState<DiffLayout>("unified")
  const [prevVersionState, setPrevVersionState] = useState<PrevVersionState>("idle")

  const containerRef = useRef<HTMLDivElement>(null)

  const diffEnabled = !isStreaming && hasPreviousVersion
  const diffDisabledReason = isStreaming
    ? "Diff unavailable while artifact is being written"
    : !hasPreviousVersion
    ? "No previous version to compare"
    : undefined

  // Force-reset to source mode if diff becomes unavailable.
  useEffect(() => {
    if (!diffEnabled && mode === "diff") setMode("source")
  }, [diffEnabled, mode])

  // Reset prev-version state whenever the artifact id or compared version changes.
  useEffect(() => {
    setPrevVersionState("idle")
  }, [artifact.id, previousVersionNum])

  // Trigger the lazy fetch when the user enters diff mode for the first time
  // (per id+version pair). Cached results stay until id/version changes.
  useEffect(() => {
    if (mode !== "diff") return
    if (prevVersionState !== "idle") return
    if (!fetchPreviousVersion) {
      setPrevVersionState({ kind: "error", message: "no fetcher provided" })
      return
    }
    let cancelled = false
    setPrevVersionState("loading")
    fetchPreviousVersion()
      .then((result) => {
        if (!cancelled) setPrevVersionState(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setPrevVersionState({
            kind: "error",
            message: err instanceof Error ? err.message : "fetch failed",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [mode, prevVersionState, fetchPreviousVersion])

  // Persist wrap.
  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem(wrapStorageKey(artifact.id), wrap ? "true" : "false")
  }, [artifact.id, wrap])

  // Match calculation drives the search-bar count and the source view's highlight.
  const matches = useMemo(() => {
    if (!searchOpen || !searchQuery) return []
    return findMatches(artifact.content, searchQuery)
  }, [searchOpen, searchQuery, artifact.content])

  // Keep matchIndex in range when matches change.
  useEffect(() => {
    if (matchIndex >= matches.length) setMatchIndex(0)
  }, [matchIndex, matches.length])

  const handleSearchToggle = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearchQuery("")
        setMatchIndex(0)
      }
      return !prev
    })
  }, [])

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery("")
    setMatchIndex(0)
  }, [])

  const handleSearchPrev = useCallback(() => {
    if (matches.length === 0) return
    setMatchIndex((i) => (i - 1 + matches.length) % matches.length)
  }, [matches.length])

  const handleSearchNext = useCallback(() => {
    if (matches.length === 0) return
    setMatchIndex((i) => (i + 1) % matches.length)
  }, [matches.length])

  const handleDiffToggle = useCallback(() => {
    if (!diffEnabled) return
    setMode((m) => (m === "diff" ? "source" : "diff"))
    if (searchOpen) handleSearchClose()
  }, [diffEnabled, searchOpen, handleSearchClose])

  // Retry handler: reset to idle so the next render kicks off a fresh fetch.
  const handleDiffRetry = useCallback(() => {
    setPrevVersionState("idle")
  }, [])

  // Cmd/Ctrl+F intercept while focus is inside this renderer.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        if (!searchOpen) setSearchOpen(true)
      }
    },
    [searchOpen],
  )

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <CodeToolbar
        language={language}
        isCanonicalLanguage={isCanonicalLanguage}
        isStreaming={isStreaming}
        wrap={wrap}
        onWrapToggle={() => setWrap((w) => !w)}
        searchOpen={searchOpen}
        onSearchToggle={handleSearchToggle}
        diffMode={mode === "diff"}
        onDiffToggle={handleDiffToggle}
        diffEnabled={diffEnabled}
        diffDisabledReason={diffDisabledReason}
      />

      {searchOpen && (
        <CodeSearchBar
          query={searchQuery}
          onQueryChange={(q) => {
            setSearchQuery(q)
            setMatchIndex(0)
          }}
          matchCount={matches.length}
          matchIndex={matchIndex}
          onPrev={handleSearchPrev}
          onNext={handleSearchNext}
          onClose={handleSearchClose}
        />
      )}

      <div className="flex-1 overflow-auto">
        {mode === "source" ? (
          <CodeSourceView
            content={artifact.content}
            language={language}
            wrap={wrap}
            searchQuery={searchOpen ? searchQuery : ""}
          />
        ) : (
          <CodeDiffView
            prevState={prevVersionState}
            after={artifact.content}
            layout={diffLayout}
            onLayoutChange={setDiffLayout}
            wrap={wrap}
            onRestorePrevious={onRestoreVersion}
            previousVersionNum={previousVersionNum ?? 1}
            onRetry={handleDiffRetry}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests; expect pass**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.test.tsx
```

Expected: PASS — 10 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.tsx src/features/conversations/components/chat/artifacts/renderers/code/code-renderer.test.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add CodeRenderer root composing toolbar, search, source, diff

- owns mode (source/diff), wrap (persisted to sessionStorage by artifact id), searchOpen, searchQuery, matchIndex, diffLayout state
- diff toggle disabled while streaming OR when previousVersion is undefined; force-reset to source when diff becomes unavailable
- Cmd/Ctrl+F intercept opens search when panel has focus
- Escape inside search bar closes search and clears query
- 10 test cases covering default state, sessionStorage persistence and hydration, diff enable/disable rules, search keyboard intercept, off-canonical language warning
EOF
)"
```

---

## Task 10: Create the barrel `index.ts`

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/code/index.ts`

- [ ] **Step 1: Create the barrel**

Path: `src/features/conversations/components/chat/artifacts/renderers/code/index.ts`

```ts
export { CodeRenderer } from "./code-renderer"
```

- [ ] **Step 2: Verify the import target resolves**

Run:
```bash
bun -e 'import("./src/features/conversations/components/chat/artifacts/renderers/code/index.ts").then(m => console.log(typeof m.CodeRenderer))'
```

Expected: `function`.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/code/index.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/code): add subsystem barrel exporting CodeRenderer
EOF
)"
```

---

## Task 11: Update `artifact-renderer.tsx` dispatch

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`

The current dispatch at L114-L127 wraps content in a markdown fence and feeds to `StreamdownContent`. Replace with a lazy-loaded `CodeRenderer`. Add four new optional props to `ArtifactRendererProps`; only the code branch consumes them.

- [ ] **Step 1: Modify the file**

Open `src/features/conversations/components/chat/artifacts/artifact-renderer.tsx`.

**Edit 1**: After the existing `LatexRenderer` lazy import block (around L44-L49), add:

```tsx
const CodeRenderer = dynamic(
  () => import("./renderers/code").then((m) => ({ default: m.CodeRenderer })),
  {
    loading: () => <RendererLoading />,
  }
)
```

**Edit 2**: Add the type import for `PrevVersionFetchResult` near the top of the file (after existing type imports):

```tsx
import type { PrevVersionFetchResult } from "./renderers/code/code-diff-view"
```

**Edit 3**: Update `ArtifactRendererProps` and the function signature:

```tsx
interface ArtifactRendererProps {
  artifact: Artifact
  /** Callback to send an artifact error to the LLM for automated repair. */
  onFixWithAI?: (error: string) => void
  /** True when the artifact has at least one previous version (drives diff toggle). */
  hasPreviousVersion?: boolean
  /** Version number of the previous version (1-indexed). */
  previousVersionNum?: number
  /** Lazy fetcher for previous-version content (used by application/code's diff view). */
  fetchPreviousVersion?: () => Promise<PrevVersionFetchResult>
  /** Wired to the panel's handleRestoreVersion. */
  onRestoreVersion?: (versionNum: number) => void
}

export function ArtifactRenderer({
  artifact,
  onFixWithAI,
  hasPreviousVersion,
  previousVersionNum,
  fetchPreviousVersion,
  onRestoreVersion,
}: ArtifactRendererProps) {
```

**Edit 4**: Replace the existing `application/code` case body (currently L114-L127) with:

```tsx
case "application/code":
  return (
    <CodeRenderer
      artifact={artifact}
      hasPreviousVersion={hasPreviousVersion ?? false}
      previousVersionNum={previousVersionNum}
      fetchPreviousVersion={fetchPreviousVersion}
      onRestoreVersion={onRestoreVersion}
    />
  )
```

The unused `longestRun`/`fence` logic from the old branch is removed entirely (it now lives inside `CodeSourceView`). `StreamdownContent` import stays — still used by the `text/markdown` case at L128-L129.

- [ ] **Step 2: Run the existing artifact-renderer tests if any**

Run:
```bash
bun run vitest run src/features/conversations/components/chat/artifacts -t "artifact-renderer" 2>&1 | tail -20
```

Expected: pass (or "no tests" if there's no dedicated test file). If there is a test that asserted `StreamdownContent` was being used for code, update it to assert `CodeRenderer` is mounted.

- [ ] **Step 3: Run the full test suite to catch any unexpected breakage**

Run:
```bash
bun run vitest run 2>&1 | tail -30
```

Expected: all green except possibly slow integration tests that don't matter for this change. No new failures.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/artifact-renderer.tsx
git commit-sulthan -m "$(cat <<'EOF'
refactor(artifacts/renderer): dispatch application/code to dedicated CodeRenderer

- adds lazy import of CodeRenderer from renderers/code/ barrel
- ArtifactRendererProps gains optional previousVersionContent / previousVersionNum / onRestoreVersion forwarded only to the code branch
- removes the inline adaptive-fence + StreamdownContent dispatch (now lives inside CodeSourceView)
- text/markdown case still uses StreamdownContent; chat-bubble code rendering untouched
EOF
)"
```

---

## Task 12: Update `artifact-panel.tsx` — wire fetcher, drop language suffix, swap filename imports

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`

This task does three things:
1. Drop the `· ${artifact.language}` suffix on the type badge for `application/code` (no longer needed — the renderer toolbar carries the language).
2. Provide `hasPreviousVersion`, `previousVersionNum`, a cached `fetchPreviousVersion` callback, and `onRestoreVersion` to `<ArtifactRenderer>`.
3. Replace the local `CODE_LANGUAGE_EXTENSIONS` and `codeExtension` definitions with imports from the new `renderers/code/lib/filename.ts`.

- [ ] **Step 1: Remove the local CODE_LANGUAGE_EXTENSIONS + codeExtension**

In `artifact-panel.tsx`, delete:
- Lines L801-L843 (`CODE_LANGUAGE_EXTENSIONS` const)
- Lines L845-L850 (`codeExtension` function)

(The exact line numbers above are from the 2026-05-04 audit; verify before deleting by grepping for `const CODE_LANGUAGE_EXTENSIONS` and `function codeExtension`.)

Add an import near the top of the file (next to the existing `wrapLatexForDownload` and other helpers):

```tsx
import { codeExtension } from "./renderers/code/lib/filename"
import type { PrevVersionFetchResult } from "./renderers/code/code-diff-view"
```

If the panel ever directly referenced `CODE_LANGUAGE_EXTENSIONS` (search for it), add that to the import too. Otherwise just `codeExtension`.

- [ ] **Step 2: Drop the language suffix on the type badge**

Find the type-badge `<span>` block (around L458-L467). Change:

```tsx
<span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
  {TYPE_SHORT_LABELS[artifact.type] || artifact.type}
  {artifact.type === "application/code" && artifact.language
    ? ` · ${artifact.language}`
    : ""}
</span>
```

To:

```tsx
<span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
  {TYPE_SHORT_LABELS[artifact.type] || artifact.type}
</span>
```

(Drop the language-suffix conditional and its companion comment block.)

- [ ] **Step 3: Build the fetcher closure with a cache**

Inside `ArtifactPanel`, near the existing `displayArtifact` / `currentViewVersion` derivations, add:

```tsx
// Cheap derivation — drives the diff toggle's enabled state without fetching.
const hasPreviousVersion = currentViewVersion > 1
const previousVersionNum = currentViewVersion > 1 ? currentViewVersion - 1 : undefined

// Process-local cache of fetched previous-version content keyed on
// `${artifactId}:${versionNum}`. Lives in a ref so writes don't trigger
// re-renders. Cleared when the active artifact id changes (the panel
// remounts the renderer in that case anyway, but we play safe).
const prevVersionCacheRef = useRef<Map<string, PrevVersionFetchResult>>(new Map())
useEffect(() => {
  prevVersionCacheRef.current.clear()
}, [artifact.id])

const fetchPreviousVersion = useCallback(async (): Promise<PrevVersionFetchResult> => {
  if (previousVersionNum === undefined || !sessionId) {
    return { kind: "error", message: "no session or version context" }
  }
  const key = `${artifact.id}:${previousVersionNum}`
  const cached = prevVersionCacheRef.current.get(key)
  if (cached) return cached

  try {
    const res = await fetch(
      `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifact.id}/versions/${previousVersionNum}`,
    )
    let result: PrevVersionFetchResult
    if (res.status === 410) {
      result = { kind: "archived" }
    } else if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      result = { kind: "error", message: body?.error ?? `HTTP ${res.status}` }
    } else {
      const text = await res.text()
      result = { kind: "ok", content: text }
    }
    prevVersionCacheRef.current.set(key, result)
    return result
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "network error",
    }
  }
}, [artifact.id, previousVersionNum, sessionId])
```

> **Note:** `useCallback`, `useRef`, `useEffect` need to be imported from React. Check the existing imports in `artifact-panel.tsx` and add any that are missing.

- [ ] **Step 4: Forward the new props to `<ArtifactRenderer>`**

Find the `<ArtifactRenderer>` JSX (around L761-L765 per the audit) and update:

```tsx
<ArtifactRenderer
  artifact={displayArtifact}
  onFixWithAI={onFixWithAI}
  hasPreviousVersion={hasPreviousVersion}
  previousVersionNum={previousVersionNum}
  fetchPreviousVersion={fetchPreviousVersion}
  onRestoreVersion={(n) => handleRestoreVersion(n)}
/>
```

Verify `handleRestoreVersion` exists at L341-L399 and accepts a version number. If its signature is different (e.g. takes a version object), wrap accordingly.

- [ ] **Step 5: Run the test suite**

Run:
```bash
bun run vitest run 2>&1 | tail -30
```

Expected: all green. The previous panel-level local definitions of `CODE_LANGUAGE_EXTENSIONS`/`codeExtension` are gone but the imported equivalents are byte-identical, so download behaviour is unchanged.

- [ ] **Step 6: Manual smoke check (build only — no dev server here)**

Run:
```bash
bun run typecheck 2>&1 | tail -10
```

Expected: zero TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/artifact-panel.tsx
git commit-sulthan -m "$(cat <<'EOF'
feat(artifacts/panel): wire fetcher for previous-version diff + drop code language suffix

- replaces local CODE_LANGUAGE_EXTENSIONS / codeExtension with imports from renderers/code/lib/filename (single source of truth)
- type badge for application/code no longer appends '· <language>'; the renderer toolbar carries language now
- builds a useCallback-bound fetchPreviousVersion that hits /api/.../artifacts/[id]/versions/[N], caches results in a useRef Map keyed on (artifactId, versionNum), and surfaces 410 as archived / non-OK as error
- forwards hasPreviousVersion + previousVersionNum + fetcher + onRestoreVersion to ArtifactRenderer
EOF
)"
```

---

## Task 13: Update the prompt — title-as-filename guidance

**Files:**
- Modify: `src/lib/prompts/artifacts/code.ts`

- [ ] **Step 1: Add the title-as-filename paragraph**

In `src/lib/prompts/artifacts/code.ts`, find the `## Documentation` section (around L102-L107). Insert a new bullet AFTER the existing bullets and BEFORE the `## Anti-Patterns` heading:

```ts
- **Title is the filename.** Set the artifact's \`title\` to the filename you'd save this as in a real project — \`debounce.ts\`, \`migrations/0042_users.sql\`, \`Dockerfile\`. Path-style titles are okay (slashes preserved). Do NOT use descriptive sentence titles like "Debounce and throttle utilities" — the panel renders \`title\` directly and the download flow uses it as the filename, so a sentence title produces a download like \`debounce-and-throttle-utilities.ts\` which is awkward to use.
```

- [ ] **Step 2: Add the corresponding anti-pattern bullet**

In the `## Anti-Patterns` section, insert after the existing fence-wrapping bullet:

```ts
- ❌ Sentence-style title for code artifacts (\`"Debounce and throttle utilities"\` → use \`"debounce.ts"\` instead)
```

- [ ] **Step 3: Add the corresponding self-check bullet**

In the `## Self-Check Before Emitting` section, append:

```ts
6. Is \`title\` a filename (\`debounce.ts\`, \`Dockerfile\`) and not a sentence ("Debounce utilities")?
```

(Renumber if needed — adjust to match the existing list count.)

- [ ] **Step 4: Run tests**

Run:
```bash
bun run vitest run tests/unit/tools/validate-artifact.test.ts 2>&1 | tail -10
```

Expected: all green. The validator doesn't enforce title shape (per spec §5), so no test changes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/artifacts/code.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(prompts/code): tell the LLM that title is the filename

- adds Documentation bullet: title should be the filename ('debounce.ts', 'migrations/0042_users.sql', 'Dockerfile'); path-style allowed; no sentence titles
- adds Anti-Pattern bullet against sentence titles
- adds Self-Check bullet for title shape
- aligns with the panel's title-as-filename rendering and the deriveFilename slug fallback
EOF
)"
```

---

## Task 14: End-to-end manual smoke test

**Files:** none modified

This task verifies the redesign end-to-end against the spec's acceptance criteria.

- [ ] **Step 1: Start the dev server**

Run (in a separate terminal):
```bash
bun run dev
```

Wait for the "compiled" message.

- [ ] **Step 2: Walk through the spec's acceptance criteria**

Spec §10 lists 9 criteria. Verify each in the dev server with a real chat session:

1. Open or create a chat. Ask the assistant to "write me a TypeScript debounce utility as a code artifact named debounce.ts." Confirm the artifact panel header shows `debounce.ts` (not "Debounce utility" or similar).
2. Confirm exactly one Copy button — the panel header's. The Streamdown per-block copy is gone.
3. Toggle the wrap button. A line longer than the panel width should now wrap instead of producing a horizontal scrollbar.
4. Press `Ctrl+F` (or `Cmd+F`). Confirm the search bar appears and is focused. Type a query that exists in the content; confirm the count increments and matches are highlighted (CSS or DOM mode — both should highlight visibly). Use Enter / Shift+Enter or the chevrons to advance; the matching line should scroll into view.
5. Ask the assistant to "update the debounce utility to also export a throttle function." This creates v2. Use the version pill chevrons to navigate to v2. Click the Diff toggle. Confirm a unified diff appears showing the added throttle code. Toggle Split layout. Confirm two columns render with alignment.
6. Manually craft a degraded scenario: in the dev tools console, set `artifact.metadata.versions[0] = { archiveFailed: true }` for the open artifact, then trigger a re-render. The diff view should show the "archived" notice with a Restore button. Click Restore; confirm it triggers the existing handleRestoreVersion flow (button shows a loading state, then the artifact returns to v1's content).
7. Click Download. Confirm the file is saved as `debounce.ts` (or `debounce-throttle.ts` after the v2 update).
8. Generate a fresh code artifact while watching the panel header. Confirm a "writing…" pulse is visible during streaming and disappears once the tool result finalizes.
9. Ask the assistant to create a code artifact with `language: "nim"`. Open it. Confirm the language pill shows `nim` with a small AlertTriangle icon next to it; hovering the icon shows the off-canonical tooltip.

- [ ] **Step 3: Run `bun run typecheck` once more**

Run:
```bash
bun run typecheck 2>&1 | tail -10
```

Expected: zero TypeScript errors.

- [ ] **Step 4: Run the full test suite**

Run:
```bash
bun run vitest run 2>&1 | tail -30
```

Expected: zero new failures.

- [ ] **Step 5: Commit (if any minor tweaks were needed during the smoke test)**

If you needed to tweak anything during the manual walk-through (e.g. an icon name typo, a Tailwind class), commit those fixes with a message like:

```bash
git commit-sulthan -m "$(cat <<'EOF'
fix(artifacts/code): smoke-test cleanup

- <one bullet per actual fix>
EOF
)"
```

If nothing needed tweaking, skip the commit.

---

## Self-Review Notes (post-plan)

- **Spec coverage:** every section of `docs/superpowers/specs/2026-05-06-code-artifact-redesign-design.md` maps to a task — file map → Tasks 1-7 + 9-10, server endpoint → Task 8, dispatcher → Task 11, panel + fetcher → Task 12, prompt → Task 13, acceptance criteria → Task 14.
- **No placeholders:** every step contains the actual code, command, or expected output.
- **Type consistency:** `DiffLine` interface defined in Task 2 is consumed unchanged in Task 7; `HighlightMode` defined in Task 3 is consumed unchanged in Task 4; `PrevVersionFetchResult` defined in Task 7 is consumed by Task 9 (as state) and by Task 11/12 (as the fetcher's return type); `Artifact` shape is consistent across Tasks 9, 11, 12.
- **Frequent commits:** each task ends with a single atomic commit using `git commit-sulthan`. No `Co-Authored-By` trailers (per repo convention).
- **TDD discipline:** every component task writes the failing test first, runs to confirm failure, implements minimally, runs to confirm pass.
- **Out of scope explicitly skipped:** editable language picker, multi-file artifacts, "Open in StackBlitz / VS Code", code folding/minimap, CodeMirror swap, in-panel editing, regex search, inline chat code rendering changes — none of these have tasks. They're listed in spec §9 to avoid scope creep.

## Open assumptions (call out before execution starts)

1. **Service helper signature** — Task 8's mock for `getDashboardChatSessionArtifact` assumes `{ sessionId, artifactId, userId }` arg shape. Verify in `src/features/conversations/sessions/service.ts` before writing the route. If the helper has a different signature (e.g. takes `id, artifactId` and reads userId from auth elsewhere), adjust the route handler and the test mock accordingly.

2. **S3 helper export name** — Task 8's route imports `getObject` from `@/lib/s3`. The actual export might be named `s3Get`, `downloadFile`, or `readObject`. Grep `src/lib/s3/index.ts` for the public reads; harmonize the route + test before running.

3. **Icon names in `@/lib/icons`** — Tasks 5, 6, 7 reference `Search`, `WrapText`, `GitCompareArrows`, `AlertTriangle`, `RotateCcw`, `ChevronLeft`, `ChevronRight`, `Loader2`. Verify each is re-exported from the central icon barrel; add any missing one as a single re-export line in `src/lib/icons.ts` (the codebase enforces this barrel pattern — never import directly from `lucide-react`).

4. **`tabIndex` and keyboard focus** — Task 9 sets `tabIndex={-1}` on the renderer root so `Cmd/Ctrl+F` can be intercepted. If the panel has its own focus management (look at `artifact-panel.tsx:684-L702` for fullscreen toggle handling), confirm the keydown handler doesn't conflict.

5. **NextAuth `auth()` import path** — Task 8's route imports `auth` from `@/lib/auth`. The codebase may export it from `@/auth` or another path. Match the existing artifact GET route's import path exactly (read it in Step 1 of Task 8).

---

## Plan complete.

**Saved to:** `docs/superpowers/plans/2026-05-06-code-artifact-redesign.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with separate-context isolation per task.

2. **Inline Execution** — Execute tasks in this session using the `executing-plans` skill, batch execution with checkpoints for review.

**Which approach?**
