// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

const ORIGINAL_ENV = process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION

beforeEach(() => {
  delete process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION
})

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION
  } else {
    process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION = ORIGINAL_ENV
  }
})

describe("validateMarkdown — script tag (env-gated)", () => {
  it("treats <script> as a warning when ARTIFACT_STRICT_MARKDOWN_VALIDATION is unset (default)", async () => {
    const md = "# Hi\n\n<script>alert('hi')</script>\n"
    const result = await validateArtifactContent("text/markdown", md)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /script/i.test(w))).toBe(true)
  })

  it("treats <script> as a hard error when ARTIFACT_STRICT_MARKDOWN_VALIDATION='true'", async () => {
    process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION = "true"
    const md = "# Hi\n\n<script>alert('hi')</script>\n"
    const result = await validateArtifactContent("text/markdown", md)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => /script/i.test(e))).toBe(true)
  })

  it("stays a warning when env is any other truthy-ish value (only literal 'true' enables strict mode)", async () => {
    process.env.ARTIFACT_STRICT_MARKDOWN_VALIDATION = "1"
    const md = "# Hi\n\n<script>alert('hi')</script>\n"
    const result = await validateArtifactContent("text/markdown", md)
    expect(result.ok).toBe(true)
  })
})

describe("validateMarkdown — 128KB cap (isNew gate)", () => {
  it("accepts > 128KB markdown when isNew is omitted/false (existing artifact)", async () => {
    const big = "# Long\n\n" + "x".repeat(140 * 1024)
    const result = await validateArtifactContent("text/markdown", big)
    expect(result.ok).toBe(true)
  })

  it("rejects > 128KB markdown when isNew is true (create path)", async () => {
    const big = "# Long\n\n" + "x".repeat(140 * 1024)
    const result = await validateArtifactContent("text/markdown", big, { isNew: true })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => /128|size|cap/i.test(e))).toBe(true)
  })

  it("accepts ≤ 128KB markdown even when isNew is true", async () => {
    const small = "# Short\n\n" + "x".repeat(10 * 1024)
    const result = await validateArtifactContent("text/markdown", small, { isNew: true })
    expect(result.ok).toBe(true)
  })
})
