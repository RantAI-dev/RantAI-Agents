import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveMaxSteps } from "@/features/chat-public/step-budget";

describe("resolveMaxSteps", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.RANTAI_DEFAULT_MAX_STEPS;
    delete process.env.RANTAI_MAX_STEPS_HARD_CAP;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns the no-tools default when hasTools is false", () => {
    expect(resolveMaxSteps(null, false)).toBe(2);
    expect(resolveMaxSteps({ maxSteps: 30 }, false)).toBe(2);
  });

  it("returns the tools default (20) when no override is set", () => {
    expect(resolveMaxSteps(null, true)).toBe(20);
    expect(resolveMaxSteps({}, true)).toBe(20);
  });

  it("respects per-assistant maxSteps override", () => {
    expect(resolveMaxSteps({ maxSteps: 35 }, true)).toBe(35);
  });

  it("clamps to the hard cap (default 50)", () => {
    expect(resolveMaxSteps({ maxSteps: 200 }, true)).toBe(50);
  });

  it("respects RANTAI_MAX_STEPS_HARD_CAP env override", () => {
    process.env.RANTAI_MAX_STEPS_HARD_CAP = "10";
    expect(resolveMaxSteps({ maxSteps: 200 }, true)).toBe(10);
    expect(resolveMaxSteps({}, true)).toBe(10);
  });

  it("respects RANTAI_DEFAULT_MAX_STEPS env override", () => {
    process.env.RANTAI_DEFAULT_MAX_STEPS = "8";
    expect(resolveMaxSteps(null, true)).toBe(8);
    expect(resolveMaxSteps({ maxSteps: 35 }, true)).toBe(35);
  });

  it("floors at 1 for absurd inputs", () => {
    expect(resolveMaxSteps({ maxSteps: 0 }, true)).toBe(20);
    expect(resolveMaxSteps({ maxSteps: -5 }, true)).toBe(20);
    expect(resolveMaxSteps({ maxSteps: "abc" }, true)).toBe(20);
  });

  it("ignores non-finite numeric overrides and falls back to platform default", () => {
    expect(resolveMaxSteps({ maxSteps: NaN }, true)).toBe(20);
    expect(resolveMaxSteps({ maxSteps: Infinity }, true)).toBe(20);
    expect(resolveMaxSteps({ maxSteps: -Infinity }, true)).toBe(20);
  });

  it("treats unknown shapes as empty config", () => {
    expect(resolveMaxSteps("not-an-object", true)).toBe(20);
    expect(resolveMaxSteps(undefined, true)).toBe(20);
    expect(resolveMaxSteps(42, true)).toBe(20);
  });
});
