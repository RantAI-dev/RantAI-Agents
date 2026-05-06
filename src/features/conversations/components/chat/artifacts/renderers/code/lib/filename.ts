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

/** Dotfiles like .env, .gitignore, .npmrc, .editorconfig — preserve as-is. */
const DOTFILE_RE = /^\.[A-Za-z0-9][\w\-.]*$/

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
 * 4. Dotfile (matches `.env`, `.gitignore`, `.npmrc`, `.editorconfig`) →
 *    return as-is.
 * 5. Otherwise: slugify (replace non-word/dash/dot/slash characters with
 *    `-`, collapse runs, trim leading/trailing separators, lowercase) and
 *    append the language extension.
 */
export function deriveFilename({ title, language }: FilenameInput): string {
  const t = title.trim()
  if (!t) return `untitled${codeExtension(language)}`
  if (FILENAME_SHAPED_RE.test(t)) return t
  if (SPECIAL_FILENAMES_RE.test(t)) return t
  if (DOTFILE_RE.test(t)) return t
  const slug = t
    .replace(/[^\w\-./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return slug + codeExtension(language)
}
