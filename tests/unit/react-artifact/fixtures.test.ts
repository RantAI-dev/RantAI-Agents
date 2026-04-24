import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"
import {
  parseDirectives,
  buildFontLinks,
  AESTHETIC_DIRECTIONS,
  type AestheticDirection,
} from "@/features/conversations/components/chat/artifacts/renderers/_react-directives"

const FIXTURES_DIR = join(__dirname, "..", "..", "fixtures", "react-artifacts")

function readFixture(direction: AestheticDirection): string {
  return readFileSync(join(FIXTURES_DIR, `aesthetic-${direction}.tsx`), "utf-8")
}

describe("react-artifact fixtures — roundtrip", () => {
  for (const dir of AESTHETIC_DIRECTIONS) {
    describe(`aesthetic-${dir}.tsx`, () => {
      const content = readFixture(dir)

      it("declares the matching @aesthetic directive on line 1", () => {
        const parsed = parseDirectives(content)
        expect(parsed.aesthetic).toBe(dir)
      })

      it("validates without errors", () => {
        const result = validateArtifactContent("application/react", content)
        expect(
          result.errors,
          `errors for ${dir}: ${result.errors.join(" | ")}`
        ).toEqual([])
        expect(result.ok).toBe(true)
      })

      it("produces a Google Fonts link block for buildSrcdoc to inject", () => {
        const parsed = parseDirectives(content)
        const links = buildFontLinks(dir, parsed.fonts)
        expect(links).toContain("https://fonts.googleapis.com/css2?")
        expect(links).toContain('rel="stylesheet"')
      })
    })
  }
})
