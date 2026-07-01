import { describe, it, expect } from "vitest"

import {
  composeSystemPrompt,
  renderDesignSystemBlocks,
  renderSkillBlock,
  findDesignSystem,
  findSkill,
} from "@/design/server/prompt-compose"
import { designSystems, designTemplates } from "@/design/server/design-catalog.generated"

// The composer is the load-bearing piece that makes the open-design port's
// generation brand-steered: when a run names a design system / skill, that
// system's DESIGN.md (authoritative) + tokens and the skill's SKILL.md workflow
// must land in the composed system prompt — mirroring the daemon's order.

const CLAUDE = designSystems.find((s) => s.id === "claude")!
const FIRST_SKILL = designTemplates.find((t) => (t.body ?? "").trim().length > 0)!

describe("composeSystemPrompt — design-system steering", () => {
  it("catalog sanity: claude system + at least one skill exist", () => {
    expect(CLAUDE).toBeTruthy()
    expect(CLAUDE.title).toBe("Claude (Anthropic)")
    expect(CLAUDE.body).toContain("# Design System Inspired by Claude (Anthropic)")
    expect(FIRST_SKILL).toBeTruthy()
  })

  it("injects the picked system's DESIGN.md (authoritative) when designSystemId is set", () => {
    const prompt = composeSystemPrompt({
      projectName: "Acme",
      designSystemId: "claude",
    })
    // Section header (daemon-mirrored) carrying the system title.
    expect(prompt).toContain("## Active design system — Claude (Anthropic)")
    // Authoritative framing.
    expect(prompt).toContain("Treat the following DESIGN.md as authoritative")
    // The actual DESIGN.md body marker.
    expect(prompt).toContain("# Design System Inspired by Claude (Anthropic)")
    // The tokens (swatch palette) adjunct.
    expect(prompt).toContain("## Active design system tokens — Claude (Anthropic)")
    for (const hex of CLAUDE.swatches) {
      expect(prompt).toContain(hex)
    }
  })

  it("does NOT inject any design system when designSystemId is omitted", () => {
    const prompt = composeSystemPrompt({ projectName: "Acme" })
    expect(prompt).not.toContain("## Active design system")
    expect(prompt).not.toContain("# Design System Inspired by Claude (Anthropic)")
    expect(prompt).not.toContain("Treat the following DESIGN.md as authoritative")
  })

  it("skips gracefully for an unknown design-system id", () => {
    const prompt = composeSystemPrompt({
      projectName: "Acme",
      designSystemId: "definitely-not-a-real-system",
    })
    expect(prompt).not.toContain("## Active design system")
    expect(renderDesignSystemBlocks("definitely-not-a-real-system")).toEqual([])
    expect(findDesignSystem("definitely-not-a-real-system")).toBeUndefined()
  })

  it("a different system yields a different DESIGN.md than claude", () => {
    const vercel = composeSystemPrompt({ projectName: "Acme", designSystemId: "vercel" })
    expect(vercel).toContain("## Active design system")
    expect(vercel).not.toContain("# Design System Inspired by Claude (Anthropic)")
  })
})

describe("composeSystemPrompt — skill steering", () => {
  it("injects the picked skill's SKILL.md workflow when skillId is set", () => {
    const prompt = composeSystemPrompt({
      projectName: "Acme",
      skillId: FIRST_SKILL.id,
    })
    expect(prompt).toContain("## Active skill")
    expect(prompt).toContain("Follow this skill's workflow exactly.")
    // The actual SKILL.md body lands in the prompt.
    const marker = FIRST_SKILL.body.trim().slice(0, 60)
    expect(prompt).toContain(marker)
  })

  it("resolves a skill by slug name as well as id", () => {
    expect(findSkill(FIRST_SKILL.name)?.id).toBe(FIRST_SKILL.id)
  })

  it("does NOT inject any skill when skillId is omitted", () => {
    const prompt = composeSystemPrompt({ projectName: "Acme" })
    expect(prompt).not.toContain("## Active skill")
    expect(renderSkillBlock(undefined)).toBeNull()
    expect(renderSkillBlock("definitely-not-a-real-skill")).toBeNull()
  })
})

describe("composeSystemPrompt — ordering + base charter", () => {
  it("always includes the base charter and role-marker guard", () => {
    const prompt = composeSystemPrompt({ projectName: "Acme" })
    expect(prompt).toContain("You are an expert designer working with the user as a manager.")
    expect(prompt).toContain("## CRITICAL: Never fabricate conversation turns")
    expect(prompt).toContain("## Project\nYou are working in the project **Acme**.")
  })

  it("orders base charter → design system → skill → project (daemon order)", () => {
    const prompt = composeSystemPrompt({
      projectName: "Acme",
      designSystemId: "claude",
      skillId: FIRST_SKILL.id,
    })
    const charterIdx = prompt.indexOf("You are an expert designer")
    const dsIdx = prompt.indexOf("## Active design system — Claude (Anthropic)")
    const skillIdx = prompt.indexOf("## Active skill")
    const projectIdx = prompt.indexOf("## Project\nYou are working in the project")
    expect(charterIdx).toBeGreaterThanOrEqual(0)
    expect(dsIdx).toBeGreaterThan(charterIdx)
    expect(skillIdx).toBeGreaterThan(dsIdx)
    expect(projectIdx).toBeGreaterThan(skillIdx)
  })
})
