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

  it("preserves dotfiles", () => {
    expect(deriveFilename({ title: ".env", language: undefined })).toBe(".env")
    expect(deriveFilename({ title: ".gitignore", language: undefined })).toBe(".gitignore")
    expect(deriveFilename({ title: ".npmrc", language: undefined })).toBe(".npmrc")
    expect(deriveFilename({ title: ".editorconfig", language: undefined })).toBe(".editorconfig")
  })
})
