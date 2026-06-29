import { describe, it, expect } from "vitest"
import {
  loadDesignSystem,
  listDesignSystems,
  isKnownDesignSystem,
  DEFAULT_DESIGN_SYSTEM_ID,
} from "@/lib/design-systems/loader"
import { getDesignSystemContext } from "@/lib/prompts/design-system"
import { assembleArtifactContext } from "@/lib/prompts/artifacts/context"
import { buildToolInstruction } from "@/lib/prompts/instructions"

// ─── loader ──────────────────────────────────────────────────────────────────

describe("design-system loader", () => {
  it("defaults to the house style when no id is given", () => {
    expect(loadDesignSystem().id).toBe(DEFAULT_DESIGN_SYSTEM_ID)
    expect(loadDesignSystem(DEFAULT_DESIGN_SYSTEM_ID).id).toBe("rantai")
  })

  it("falls back to the default for unknown or empty ids", () => {
    expect(loadDesignSystem("does-not-exist").id).toBe(DEFAULT_DESIGN_SYSTEM_ID)
    expect(loadDesignSystem(null).id).toBe(DEFAULT_DESIGN_SYSTEM_ID)
    expect(loadDesignSystem(undefined).id).toBe(DEFAULT_DESIGN_SYSTEM_ID)
  })

  it("reports which ids are known", () => {
    expect(isKnownDesignSystem("rantai")).toBe(true)
    expect(isKnownDesignSystem("nope")).toBe(false)
    expect(isKnownDesignSystem(undefined)).toBe(false)
  })

  it("lists systems with the default first and no heavy string fields", () => {
    const list = listDesignSystems()
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list[0].isDefault).toBe(true)
    expect(list[0]).not.toHaveProperty("tokensCss")
    expect(list[0]).not.toHaveProperty("designMd")
  })

  it("ships a token contract with the RantAI palette", () => {
    const ds = loadDesignSystem("rantai")
    expect(ds.tokensCss).toContain("--ds-bg: #f5f4ed")
    expect(ds.tokensCss).toContain("--ds-accent: #3b6ddb")
    expect(ds.tokensCss).toContain("prefers-color-scheme: dark")
  })
})

// ─── prompt block builder ─────────────────────────────────────────────────────

describe("getDesignSystemContext", () => {
  it("emits a full block for HTML (prose + verbatim tokens + tailwind guide + manifest)", () => {
    const block = getDesignSystemContext("text/html")
    expect(block).toContain("Active design system — RantAI — Warm Paper")
    expect(block).toContain("authoritative brand style")
    expect(block).toContain("--ds-bg: #f5f4ed") // token contract present
    expect(block).toContain("Applying the tokens (Tailwind v3)")
    expect(block).toContain("Component reference") // full depth only
  })

  it("emits the tailwind guide for React too", () => {
    const block = getDesignSystemContext("application/react")
    expect(block).toContain("Applying the tokens (Tailwind v3)")
    expect(block).toContain("--ds-accent")
  })

  it("emits a compact block (no manifest) when the type is unknown (auto mode)", () => {
    const block = getDesignSystemContext(null)
    expect(block).toContain("Brand essence")
    expect(block).toContain("--ds-bg") // tokens still included
    expect(block).not.toContain("Component reference") // compact omits manifest
  })

  it("returns nothing for types it does not steer", () => {
    expect(getDesignSystemContext("application/python")).toBe("")
    expect(getDesignSystemContext("text/markdown")).toBe("")
    expect(getDesignSystemContext("application/code")).toBe("")
    // visual but intentionally excluded (own theme / no DOM / rejects <style>)
    expect(getDesignSystemContext("image/svg+xml")).toBe("")
    expect(getDesignSystemContext("application/slides")).toBe("")
    expect(getDesignSystemContext("application/3d")).toBe("")
  })

  it("falls back to the house style for an unknown design system id", () => {
    const block = getDesignSystemContext("text/html", "no-such-system")
    expect(block).toContain("RantAI — Warm Paper")
  })
})

// ─── ordering: design system must come AFTER the few-shot examples ─────────────

describe("assembleArtifactContext ordering", () => {
  it("places the authoritative design system after the examples for HTML", () => {
    const ctx = assembleArtifactContext("text/html", "full")
    // "authoritative brand style" is unique to the injected block (the per-type
    // rules only *reference* the design system, they don't contain this phrase).
    const dsIdx = ctx.indexOf("authoritative brand style")
    const exIdx = ctx.indexOf("Few-Shot Examples")
    expect(dsIdx).toBeGreaterThan(-1)
    expect(exIdx).toBeGreaterThan(-1)
    expect(dsIdx).toBeGreaterThan(exIdx)
  })

  it("omits the design system for non-styled types", () => {
    const ctx = assembleArtifactContext("application/python", "full")
    expect(ctx).not.toContain("Active design system")
  })
})

// ─── tool instruction threading ───────────────────────────────────────────────

describe("buildToolInstruction design-system injection", () => {
  it("injects the full house block for a specific styled canvas type", () => {
    const out = buildToolInstruction(["create_artifact"], { canvasMode: "text/html" })
    expect(out).toContain("Active design system — RantAI — Warm Paper")
    expect(out).toContain("--ds-bg")
  })

  it("injects the compact house block in auto canvas mode", () => {
    const out = buildToolInstruction(["create_artifact"], { canvasMode: "auto" })
    expect(out).toContain("Brand essence")
    expect(out).toContain("--ds-bg")
  })

  it("injects the compact house block in opt-in (no canvas) mode", () => {
    const out = buildToolInstruction(["create_artifact"], {})
    expect(out).toContain("Brand essence")
  })

  it("does not inject design tokens for a non-styled canvas type", () => {
    const out = buildToolInstruction(["create_artifact"], { canvasMode: "application/python" })
    expect(out).not.toContain("Active design system")
    expect(out).not.toContain("--ds-bg")
  })

  it("falls back to the house style when given an unknown design system id", () => {
    const out = buildToolInstruction(["create_artifact"], {
      canvasMode: "text/html",
      designSystemId: "ghost",
    })
    expect(out).toContain("RantAI — Warm Paper")
  })
})
