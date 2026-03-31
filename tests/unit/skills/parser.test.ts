import { describe, it, expect } from "vitest"
import { parseSkillMarkdown } from "@/lib/skills/parser"

describe("parseSkillMarkdown", () => {
  it("parses a complete SKILL.md with all frontmatter fields", () => {
    const raw = `---
name: my-skill
displayName: My Skill
description: A test skill
category: productivity
tags: [ai, automation]
version: "1.0.0"
author: Test Author
---

This is the skill body.
`
    const result = parseSkillMarkdown(raw)
    expect(result.name).toBe("my-skill")
    expect(result.displayName).toBe("My Skill")
    expect(result.description).toBe("A test skill")
    expect(result.category).toBe("productivity")
    expect(result.tags).toEqual(["ai", "automation"])
    expect(result.version).toBe("1.0.0")
    expect(result.author).toBe("Test Author")
    expect(result.content).toBe("This is the skill body.")
  })

  it("generates slug from displayName when name is missing", () => {
    const raw = `---
displayName: Code Review Helper
---

Body content.
`
    const result = parseSkillMarkdown(raw)
    expect(result.name).toBe("code-review-helper")
  })

  it("falls back to 'untitled' when both name and displayName are missing", () => {
    const raw = `---
description: No name skill
---

Body.
`
    const result = parseSkillMarkdown(raw)
    expect(result.name).toBe("untitled")
  })

  it("uses name as displayName when displayName is missing", () => {
    const raw = `---
name: my-tool
---

Body.
`
    const result = parseSkillMarkdown(raw)
    expect(result.displayName).toBe("my-tool")
  })

  it("defaults category to 'general' when missing", () => {
    const raw = `---
name: test
---

Body.
`
    const result = parseSkillMarkdown(raw)
    expect(result.category).toBe("general")
  })

  it("returns empty tags array when tags is missing", () => {
    const raw = `---
name: test
---

Body.
`
    const result = parseSkillMarkdown(raw)
    expect(result.tags).toEqual([])
  })

  it("returns undefined for optional version and author when missing", () => {
    const raw = `---
name: test
---

Body.
`
    const result = parseSkillMarkdown(raw)
    expect(result.version).toBeUndefined()
    expect(result.author).toBeUndefined()
  })

  it("handles special characters in displayName for slug", () => {
    const raw = `---
displayName: "Hello World!!! @#$ 123"
---

Body.
`
    const result = parseSkillMarkdown(raw)
    expect(result.name).toBe("hello-world-123")
  })

  it("trims body content whitespace", () => {
    const raw = `---
name: test
---


  Content with surrounding whitespace.

`
    const result = parseSkillMarkdown(raw)
    expect(result.content).toBe("Content with surrounding whitespace.")
  })

  it("extracts requirements from content body", () => {
    const raw = `---
name: deploy-helper
requires:
  bins: [docker, kubectl]
  env: [KUBE_TOKEN]
---

Deploy using \`docker build\` and \`kubectl apply\`.
`
    const result = parseSkillMarkdown(raw)
    expect(result.requirements).toBeDefined()
    expect(result.requirements!.bins).toContain("docker")
    expect(result.requirements!.bins).toContain("kubectl")
    expect(result.requirements!.env).toContain("KUBE_TOKEN")
    expect(result.requirements!.layer).toBe("execution")
  })

  it("detects integrations from content heuristics", () => {
    const raw = `---
name: slack-notifier
---

Send notifications via Slack when builds complete.
Also check GitHub for PR status.
`
    const result = parseSkillMarkdown(raw)
    expect(result.requirements!.integrations).toContain("slack")
    expect(result.requirements!.integrations).toContain("github")
  })

  it("classifies as knowledge layer for best-practices content", () => {
    const raw = `---
name: style-guide
---

# Rules

You must always follow these best practices when writing code.
Never use var, always use const or let.
`
    const result = parseSkillMarkdown(raw)
    expect(result.requirements!.layer).toBe("knowledge")
  })
})
