# Smart Router Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `SmartRouterExtractor` that runs `unpdf` first and only falls through to MinerU / gpt-4.1-nano when text-layer heuristics say OCR is needed, delivering the 98%-coverage / 1.1 s-average benchmark result in production.

**Architecture:** One new `Extractor` class that wraps a text-layer extractor (unpdf) and an OCR fallback (MinerU on-prem, gpt-4.1-nano on cloud). A pure-function signals module decides per-document whether unpdf's output suffices. The class plugs into the existing `buildExtractor` sentinel registry via `KB_EXTRACT_PRIMARY="smart"`.

**Tech Stack:** TypeScript, Vitest, Bun. Depends only on existing `src/lib/rag/extractors/{unpdf,mineru,vision-llm}-extractor.ts` and `getRagConfig()`.

**Related docs:**
- Spec: `docs/superpowers/specs/2026-04-22-smart-router-extractor-design.md`
- Empirical evidence: `tests/bench-kb/results/all-approaches/summary.csv`
- Bench script: `tests/bench-kb/src/bench-all-approaches.ts`

**Files overview:**
| Path | Action | Responsibility |
|---|---|---|
| `src/lib/rag/extractors/text-layer-signals.ts` | Create | Pure functions: `isUnpdfSufficient`, `hasColumnarLines`, `hasDenseCurrency` |
| `src/lib/rag/extractors/smart-router-extractor.ts` | Create | `SmartRouterExtractor` class — runs text-layer, decides, maybe falls through |
| `src/lib/rag/config.ts` | Modify | Add `extractSmartFallback: string` field + `KB_EXTRACT_SMART_FALLBACK` env var |
| `src/lib/rag/extractors/index.ts` | Modify | New branch: `modelId === "smart"` → construct `SmartRouterExtractor` |
| `tests/unit/rag/extractors/text-layer-signals.test.ts` | Create | Unit tests for each pure signal + the combined gate |
| `tests/unit/rag/extractors/smart-router-extractor.test.ts` | Create | Unit tests for dispatch behavior with mock extractors |
| `tests/unit/rag/config.test.ts` | Modify | Assert the new default + env override for `extractSmartFallback` |
| `.env.example` | Modify | Document the `"smart"` mode with cloud + on-prem sub-sections |

---

## Task 1: Pure signals module — tokenizer and helper stubs

**Files:**
- Create: `src/lib/rag/extractors/text-layer-signals.ts`
- Test: `tests/unit/rag/extractors/text-layer-signals.test.ts`

- [ ] **Step 1: Write the failing tests for the volume gate**

Create `tests/unit/rag/extractors/text-layer-signals.test.ts` with:

```ts
import { describe, it, expect } from "vitest"
import { isUnpdfSufficient } from "@/lib/rag/extractors/text-layer-signals"

const DEFAULTS = { minCharsPerPage: 300, maxColumnarLines: 5, maxCurrencyMatches: 10 }

describe("isUnpdfSufficient / volume gate", () => {
  it("returns false on empty text", () => {
    expect(isUnpdfSufficient("", 1, DEFAULTS)).toBe(false)
  })

  it("returns false below the char-per-page threshold", () => {
    const text = "x".repeat(200)
    expect(isUnpdfSufficient(text, 1, DEFAULTS)).toBe(false)
  })

  it("returns true at the char-per-page threshold when no table signals", () => {
    const text = "prose ".repeat(60) // 360 chars
    expect(isUnpdfSufficient(text, 1, DEFAULTS)).toBe(true)
  })

  it("scales char threshold with page count", () => {
    const text = "x".repeat(400) // enough for 1 page, not for 2
    expect(isUnpdfSufficient(text, 1, DEFAULTS)).toBe(true)
    expect(isUnpdfSufficient(text, 2, DEFAULTS)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail with "module not found"**

```bash
bun x vitest run tests/unit/rag/extractors/text-layer-signals.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/rag/extractors/text-layer-signals'`.

- [ ] **Step 3: Create the module with the volume gate only**

Create `src/lib/rag/extractors/text-layer-signals.ts`:

```ts
/**
 * Pure heuristic functions that classify an unpdf text-layer extraction as
 * "sufficient" for retrieval purposes. Used by SmartRouterExtractor to decide
 * whether to return unpdf's output directly or fall through to a vision-LLM
 * OCR fallback.
 *
 * Every function is a pure predicate. Signals are ordered cheapest-first so
 * early false-returns avoid unnecessary work.
 *
 * Thresholds were chosen empirically against the 40-doc all-approaches bench.
 * See docs/superpowers/specs/2026-04-22-smart-router-extractor-design.md.
 */

export interface RouterOpts {
  /** Min chars per PDF page that unpdf must produce to be trusted. Below this
   * signals a scanned / image-only PDF whose text layer is empty or junk. */
  minCharsPerPage: number;
  /** Max lines that look columnar (multi-cell tabular data flattened by unpdf).
   * If the text-layer has more than this, the doc probably has tables that
   * need vision OCR to preserve structure. */
  maxColumnarLines: number;
  /** Max `$X,XXX` currency patterns. Financial tables contain many; prose rarely
   * exceeds this. Over the threshold → route to OCR. */
  maxCurrencyMatches: number;
}

export const DEFAULT_ROUTER_OPTS: RouterOpts = {
  minCharsPerPage: 300,
  maxColumnarLines: 5,
  maxCurrencyMatches: 10,
};

export function isUnpdfSufficient(
  text: string,
  pageCount: number,
  opts: RouterOpts = DEFAULT_ROUTER_OPTS,
): boolean {
  if (!text || text.length < opts.minCharsPerPage * pageCount) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun x vitest run tests/unit/rag/extractors/text-layer-signals.test.ts
```
Expected: PASS, 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/text-layer-signals.ts tests/unit/rag/extractors/text-layer-signals.test.ts
git commit -m "feat(rag): text-layer signals — volume gate for smart router

First piece of the smart-router heuristic: isUnpdfSufficient rejects
text-layer output whose total length is below minCharsPerPage × pageCount.
Scans produce near-empty text layers; the volume gate catches them.

Thresholds default to 300 chars/page but are overridable per caller.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Columnar-line signal

**Files:**
- Modify: `src/lib/rag/extractors/text-layer-signals.ts`
- Test: `tests/unit/rag/extractors/text-layer-signals.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `tests/unit/rag/extractors/text-layer-signals.test.ts`:

```ts
import { hasColumnarLines } from "@/lib/rag/extractors/text-layer-signals"

describe("hasColumnarLines", () => {
  it("returns false on plain prose", () => {
    const text = [
      "This is a paragraph about running.",
      "Another paragraph describing cats.",
      "A third line with ordinary prose content.",
    ].join("\n")
    expect(hasColumnarLines(text, 5)).toBe(false)
  })

  it("returns true when multi-whitespace columnar lines exceed the threshold", () => {
    // Six lines each with 2+ runs of 3+ whitespace chars between words → table-like
    const tabular = Array.from({ length: 6 }, () =>
      "Cash   $29,943   $29,965"
    ).join("\n")
    expect(hasColumnarLines(tabular, 5)).toBe(true)
  })

  it("ignores short lines even if they look columnar", () => {
    const text = Array.from({ length: 10 }, () => "A   B   C").join("\n") // <10 chars each trimmed
    expect(hasColumnarLines(text, 5)).toBe(false)
  })

  it("the threshold is exclusive — exactly N columnar lines is not enough", () => {
    const text = Array.from({ length: 5 }, () =>
      "Long row   $1,000   $2,000"
    ).join("\n")
    expect(hasColumnarLines(text, 5)).toBe(false)
  })
})

describe("isUnpdfSufficient / columnar gate", () => {
  it("returns false when columnar lines exceed threshold even with enough chars", () => {
    const tabular = Array.from({ length: 6 }, () =>
      "Cash   $29,943   $29,965"
    ).join("\n")
    // Padded with prose so volume gate passes
    const padding = "prose text ".repeat(40)
    expect(isUnpdfSufficient(tabular + "\n" + padding, 1, DEFAULTS)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
bun x vitest run tests/unit/rag/extractors/text-layer-signals.test.ts
```
Expected: 4 passes (from Task 1) + 5 new FAILs with `hasColumnarLines is not a function` and the isUnpdfSufficient columnar-gate test failing because the gate isn't wired yet.

- [ ] **Step 3: Implement `hasColumnarLines` and wire into `isUnpdfSufficient`**

Edit `src/lib/rag/extractors/text-layer-signals.ts` — add the function below `DEFAULT_ROUTER_OPTS` and update `isUnpdfSufficient`:

```ts
/**
 * Count lines that look columnar: 2+ runs of 3+ whitespace chars between
 * visible text tokens. Tables flatten to these when extracted as text layer.
 * Returns true if the count exceeds `threshold`.
 */
export function hasColumnarLines(text: string, threshold: number): boolean {
  const lines = text.split("\n");
  let count = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 10) continue;
    const matches = line.match(/\S\s{3,}\S/g);
    if (matches && matches.length >= 2) {
      count++;
      if (count > threshold) return true;
    }
  }
  return false;
}

export function isUnpdfSufficient(
  text: string,
  pageCount: number,
  opts: RouterOpts = DEFAULT_ROUTER_OPTS,
): boolean {
  if (!text || text.length < opts.minCharsPerPage * pageCount) return false;
  if (hasColumnarLines(text, opts.maxColumnarLines)) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
bun x vitest run tests/unit/rag/extractors/text-layer-signals.test.ts
```
Expected: 9/9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/text-layer-signals.ts tests/unit/rag/extractors/text-layer-signals.test.ts
git commit -m "feat(rag): text-layer signals — columnar-line detection

Adds hasColumnarLines: counts lines with 2+ runs of 3+ whitespace
between tokens (e.g. flattened financial tables) and reports whether
the count exceeds a threshold. Now part of isUnpdfSufficient so PDFs
that appear to contain tables route to vision OCR instead of settling
for the structurally-flattened text layer.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Dense-currency signal

**Files:**
- Modify: `src/lib/rag/extractors/text-layer-signals.ts`
- Test: `tests/unit/rag/extractors/text-layer-signals.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/rag/extractors/text-layer-signals.test.ts`:

```ts
import { hasDenseCurrency } from "@/lib/rag/extractors/text-layer-signals"

describe("hasDenseCurrency", () => {
  it("returns false on prose with no currency", () => {
    expect(hasDenseCurrency("just some words here", 10)).toBe(false)
  })

  it("returns false when currency count is below threshold", () => {
    const text = Array.from({ length: 5 }, () => "$1,234").join(" ")
    expect(hasDenseCurrency(text, 10)).toBe(false)
  })

  it("returns true when currency count exceeds threshold", () => {
    const text = Array.from({ length: 11 }, () => "$1,234").join(" ")
    expect(hasDenseCurrency(text, 10)).toBe(true)
  })

  it("matches dollar amounts with optional space after $ and decimals", () => {
    const text = Array.from({ length: 11 }, () => "$ 29,943.50").join("\n")
    expect(hasDenseCurrency(text, 10)).toBe(true)
  })
})

describe("isUnpdfSufficient / currency gate", () => {
  it("returns false when currency density exceeds threshold", () => {
    // Enough chars, no columns — but many $ amounts means tables likely exist
    const padded = "description text ".repeat(40) // 680 chars prose
    const currency = Array.from({ length: 11 }, () => "$29,943").join(" ")
    expect(isUnpdfSufficient(padded + " " + currency, 1, DEFAULTS)).toBe(false)
  })

  it("returns true on pure prose with enough volume", () => {
    const prose = "The quick brown fox jumps over the lazy dog. ".repeat(20)
    expect(isUnpdfSufficient(prose, 1, DEFAULTS)).toBe(true)
  })
})
```

- [ ] **Step 2: Verify the new tests fail**

```bash
bun x vitest run tests/unit/rag/extractors/text-layer-signals.test.ts
```
Expected: earlier tests PASS, new ones FAIL with `hasDenseCurrency is not a function`.

- [ ] **Step 3: Implement `hasDenseCurrency` and wire into `isUnpdfSufficient`**

Edit `src/lib/rag/extractors/text-layer-signals.ts`:

```ts
/**
 * Count `$X,XXX(.XX)?` currency patterns in text. Returns true if the count
 * exceeds `threshold`. Financial tables contain many; plain prose rarely
 * does.
 */
export function hasDenseCurrency(text: string, threshold: number): boolean {
  const matches = text.match(/\$\s?[\d,]+(?:\.\d+)?/g);
  return matches ? matches.length > threshold : false;
}

export function isUnpdfSufficient(
  text: string,
  pageCount: number,
  opts: RouterOpts = DEFAULT_ROUTER_OPTS,
): boolean {
  if (!text || text.length < opts.minCharsPerPage * pageCount) return false;
  if (hasColumnarLines(text, opts.maxColumnarLines)) return false;
  if (hasDenseCurrency(text, opts.maxCurrencyMatches)) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
bun x vitest run tests/unit/rag/extractors/text-layer-signals.test.ts
```
Expected: 15/15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/text-layer-signals.ts tests/unit/rag/extractors/text-layer-signals.test.ts
git commit -m "feat(rag): text-layer signals — dense-currency gate

Adds hasDenseCurrency: counts \$X,XXX(.XX)? patterns. Over the
threshold (default 10) → table density suggests vision OCR will give a
better structured extraction than unpdf's flattened text.

All three gates (volume, columnar, currency) are now active in
isUnpdfSufficient. Complete heuristic set from the design spec.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: SmartRouterExtractor — happy path (return text-layer when sufficient)

**Files:**
- Create: `src/lib/rag/extractors/smart-router-extractor.ts`
- Test: `tests/unit/rag/extractors/smart-router-extractor.test.ts`

- [ ] **Step 1: Write failing test for the happy path**

Create `tests/unit/rag/extractors/smart-router-extractor.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"
import { SmartRouterExtractor } from "@/lib/rag/extractors/smart-router-extractor"
import type { Extractor, ExtractionResult } from "@/lib/rag/extractors/types"

function mockExtractor(name: string, result: Partial<ExtractionResult> | Error): Extractor {
  return {
    name,
    extract: vi.fn(async () => {
      if (result instanceof Error) throw result
      return { text: "", ms: 0, model: name, ...result } as ExtractionResult
    }),
  }
}

describe("SmartRouterExtractor", () => {
  it("returns the text-layer result when unpdf output is sufficient", async () => {
    const textLayer = mockExtractor("unpdf", {
      text: "The quick brown fox jumps over the lazy dog. ".repeat(20),
      ms: 42,
      model: "unpdf",
      pages: 1,
    })
    const fallback = mockExtractor("mineru", { text: "SHOULD NOT BE USED", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("%PDF-1.5"))

    expect(textLayer.extract).toHaveBeenCalledTimes(1)
    expect(fallback.extract).not.toHaveBeenCalled()
    expect(result.text).toContain("quick brown fox")
    expect(result.model).toBe("smart(unpdf)")
    expect(result.ms).toBe(42)
  })
})
```

- [ ] **Step 2: Run test, confirm it fails with "module not found"**

```bash
bun x vitest run tests/unit/rag/extractors/smart-router-extractor.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/rag/extractors/smart-router-extractor'`.

- [ ] **Step 3: Create the minimal implementation**

Create `src/lib/rag/extractors/smart-router-extractor.ts`:

```ts
import type { Extractor, ExtractionResult } from "./types";
import { isUnpdfSufficient, DEFAULT_ROUTER_OPTS, type RouterOpts } from "./text-layer-signals";

/**
 * SmartRouterExtractor — runs a text-layer extractor first, falls through to
 * an OCR fallback only when heuristics flag the text-layer output as
 * insufficient for retrieval.
 *
 * Empirically: on a 40-doc mixed bench this routes prose-heavy born-digital
 * PDFs to unpdf (50 ms, 100% coverage on resumes) while sending scans and
 * table-heavy docs to MinerU (97% coverage on Indonesian scans).
 *
 * See docs/superpowers/specs/2026-04-22-smart-router-extractor-design.md.
 */
export class SmartRouterExtractor implements Extractor {
  readonly name: string;
  private readonly textLayer: Extractor;
  private readonly fallback: Extractor;
  private readonly opts: RouterOpts;

  constructor(textLayer: Extractor, fallback: Extractor, opts?: Partial<RouterOpts>) {
    this.textLayer = textLayer;
    this.fallback = fallback;
    this.opts = { ...DEFAULT_ROUTER_OPTS, ...(opts ?? {}) };
    this.name = `SmartRouter(${textLayer.name}+${fallback.name})`;
  }

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const textLayerResult = await this.textLayer.extract(pdfBuffer);
    const pageCount = textLayerResult.pages ?? 1;
    if (isUnpdfSufficient(textLayerResult.text, pageCount, this.opts)) {
      return {
        ...textLayerResult,
        model: `smart(${textLayerResult.model ?? this.textLayer.name})`,
      };
    }
    // Fall-through path (task 5 implements the fallback branch)
    throw new Error("not implemented — fallback branch not yet wired");
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun x vitest run tests/unit/rag/extractors/smart-router-extractor.test.ts
```
Expected: 1/1 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/smart-router-extractor.ts tests/unit/rag/extractors/smart-router-extractor.test.ts
git commit -m "feat(rag): SmartRouterExtractor — text-layer happy path

First of two paths: when isUnpdfSufficient returns true, return the
text-layer result with model id rewritten to smart(<underlying>) for
observability. Fallback path is stubbed and will be implemented in the
next commit.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: SmartRouterExtractor — fallback path (route to OCR when insufficient)

**Files:**
- Modify: `src/lib/rag/extractors/smart-router-extractor.ts`
- Modify: `tests/unit/rag/extractors/smart-router-extractor.test.ts`

- [ ] **Step 1: Write failing test for fall-through**

Append to `tests/unit/rag/extractors/smart-router-extractor.test.ts`:

```ts
describe("SmartRouterExtractor / fallback path", () => {
  it("falls through to the fallback when text layer is empty", async () => {
    const textLayer = mockExtractor("unpdf", { text: "", ms: 5, model: "unpdf", pages: 1 })
    const fallback = mockExtractor("mineru", {
      text: "# From OCR\n\nBody.",
      ms: 4000,
      model: "mineru-2.5-pro",
    })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("x"))
    expect(textLayer.extract).toHaveBeenCalledTimes(1)
    expect(fallback.extract).toHaveBeenCalledTimes(1)
    expect(result.text).toContain("From OCR")
    expect(result.model).toBe("smart(fallback:mineru-2.5-pro)")
  })

  it("falls through when text-layer volume is below threshold", async () => {
    const textLayer = mockExtractor("unpdf", { text: "tiny", ms: 3, model: "unpdf", pages: 1 })
    const fallback = mockExtractor("mineru", { text: "full ocr output", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("x"))
    expect(result.text).toBe("full ocr output")
  })

  it("falls through when text-layer extraction throws", async () => {
    const textLayer = mockExtractor("unpdf", new Error("pdf corrupt"))
    const fallback = mockExtractor("mineru", { text: "recovered by OCR", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback)
    const result = await router.extract(Buffer.from("x"))
    expect(result.text).toBe("recovered by OCR")
  })

  it("throws combined error when both extractors fail", async () => {
    const textLayer = mockExtractor("unpdf", new Error("pdf corrupt"))
    const fallback = mockExtractor("mineru", new Error("sidecar down"))
    const router = new SmartRouterExtractor(textLayer, fallback)
    await expect(router.extract(Buffer.from("x"))).rejects.toThrow(/both extractors failed/i)
  })

  it("accepts custom opts and uses them", async () => {
    // Very strict threshold — prose that was sufficient under defaults now triggers fallback
    const textLayer = mockExtractor("unpdf", {
      text: "The quick brown fox ".repeat(10), // 200 chars
      ms: 5,
      model: "unpdf",
      pages: 1,
    })
    const fallback = mockExtractor("mineru", { text: "ocr result", ms: 4000, model: "mineru" })
    const router = new SmartRouterExtractor(textLayer, fallback, { minCharsPerPage: 1000 })
    const result = await router.extract(Buffer.from("x"))
    expect(result.text).toBe("ocr result") // fallback used because 200 < 1000
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
bun x vitest run tests/unit/rag/extractors/smart-router-extractor.test.ts
```
Expected: Task 4 test passes, 5 new FAILs (stub throws "not implemented").

- [ ] **Step 3: Implement the fallback branch and error handling**

Edit `src/lib/rag/extractors/smart-router-extractor.ts` — replace the `extract` method body:

```ts
  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    let textLayerResult: ExtractionResult | null = null;
    let textLayerErr: Error | null = null;

    try {
      textLayerResult = await this.textLayer.extract(pdfBuffer);
    } catch (err) {
      textLayerErr = err as Error;
      console.warn(
        `[rag/smart-router] text-layer extractor ${this.textLayer.name} threw (${textLayerErr.message.slice(0, 100)}), falling through to ${this.fallback.name}`,
      );
    }

    if (textLayerResult) {
      const pageCount = textLayerResult.pages ?? 1;
      if (isUnpdfSufficient(textLayerResult.text, pageCount, this.opts)) {
        return {
          ...textLayerResult,
          model: `smart(${textLayerResult.model ?? this.textLayer.name})`,
        };
      }
    }

    try {
      const fallbackResult = await this.fallback.extract(pdfBuffer);
      return {
        ...fallbackResult,
        model: `smart(fallback:${fallbackResult.model ?? this.fallback.name})`,
      };
    } catch (err) {
      const fbMsg = (err as Error).message.slice(0, 150);
      const tlMsg = textLayerErr ? textLayerErr.message.slice(0, 150) : "insufficient output";
      throw new Error(
        `Both extractors failed — textLayer(${this.textLayer.name}): ${tlMsg}; fallback(${this.fallback.name}): ${fbMsg}`,
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
bun x vitest run tests/unit/rag/extractors/smart-router-extractor.test.ts
```
Expected: 6/6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/smart-router-extractor.ts tests/unit/rag/extractors/smart-router-extractor.test.ts
git commit -m "feat(rag): SmartRouterExtractor — fallback branch + error handling

Completes the dispatch logic: when text-layer output is insufficient or
the text-layer throws, invoke the configured fallback extractor and
return its result with model id rewritten to smart(fallback:<name>).

If the fallback also throws, combine both error messages into a single
descriptive exception matching the Both extractors failed shape that
tests assert on.

Custom RouterOpts override DEFAULT_ROUTER_OPTS at construction time so
deployments with unusual corpora can tune thresholds without forking.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Config plumbing — `KB_EXTRACT_SMART_FALLBACK` env var

**Files:**
- Modify: `src/lib/rag/config.ts`
- Modify: `tests/unit/rag/config.test.ts`

- [ ] **Step 1: Add failing tests for the new config field**

Append to `tests/unit/rag/config.test.ts`:

```ts
  it("defaults extractSmartFallback to openai/gpt-4.1-nano", () => {
    delete process.env.KB_EXTRACT_SMART_FALLBACK
    const cfg = getRagConfig()
    expect(cfg.extractSmartFallback).toBe("openai/gpt-4.1-nano")
  })

  it("reads KB_EXTRACT_SMART_FALLBACK override", () => {
    process.env.KB_EXTRACT_SMART_FALLBACK = "mineru"
    const cfg = getRagConfig()
    expect(cfg.extractSmartFallback).toBe("mineru")
  })
```

- [ ] **Step 2: Verify they fail**

```bash
bun x vitest run tests/unit/rag/config.test.ts
```
Expected: existing tests pass; 2 new FAILs: `Property 'extractSmartFallback' does not exist on type 'RagConfig'`.

- [ ] **Step 3: Add the field to RagConfig + DEFAULTS + getRagConfig**

Edit `src/lib/rag/config.ts`. In the `RagConfig` interface add:

```ts
  /**
   * Model id the SmartRouterExtractor falls through to when the text layer
   * is insufficient. Recognizes the same sentinels as extractPrimary:
   * "mineru", "unpdf", "hybrid", or any OpenRouter model id. Default:
   * "openai/gpt-4.1-nano" (cloud). Set to "mineru" for on-prem.
   */
  extractSmartFallback: string;
```

In the `DEFAULTS` object, next to the other extract fields:

```ts
  extractSmartFallback: "openai/gpt-4.1-nano",
```

In `getRagConfig()` return object, add:

```ts
    extractSmartFallback: process.env.KB_EXTRACT_SMART_FALLBACK || DEFAULTS.extractSmartFallback,
```

- [ ] **Step 4: Run all config tests**

```bash
bun x vitest run tests/unit/rag/config.test.ts
```
Expected: all tests PASS (both new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/config.ts tests/unit/rag/config.test.ts
git commit -m "feat(rag): config — KB_EXTRACT_SMART_FALLBACK

Adds extractSmartFallback to RagConfig so SmartRouterExtractor knows
what to fall through to when text-layer is insufficient. Defaults to
openai/gpt-4.1-nano (cloud); on-prem overrides to mineru.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Wire `"smart"` sentinel into `buildExtractor`

**Files:**
- Modify: `src/lib/rag/extractors/index.ts`
- Test: new section in `tests/unit/rag/extractors/smart-router-extractor.test.ts`

- [ ] **Step 1: Write failing test that uses the public `getDefaultExtractor`**

Append to `tests/unit/rag/extractors/smart-router-extractor.test.ts`:

```ts
describe("SmartRouterExtractor / integration with buildExtractor", () => {
  const originalEnv = { ...process.env }
  afterEach(() => { process.env = { ...originalEnv }; vi.resetModules() })

  it("KB_EXTRACT_PRIMARY=smart builds a SmartRouterExtractor", async () => {
    process.env.KB_EXTRACT_PRIMARY = "smart"
    process.env.KB_EXTRACT_SMART_FALLBACK = "openai/gpt-4.1-nano"
    const { getDefaultExtractor } = await import("@/lib/rag/extractors")
    const ex = getDefaultExtractor()
    expect(ex.name).toMatch(/^SmartRouter\(/)
    expect(ex.name).toContain("unpdf")
    expect(ex.name).toContain("openai/gpt-4.1-nano")
  })

  it("KB_EXTRACT_PRIMARY=smart with KB_EXTRACT_SMART_FALLBACK=mineru uses MineruExtractor", async () => {
    process.env.KB_EXTRACT_PRIMARY = "smart"
    process.env.KB_EXTRACT_SMART_FALLBACK = "mineru"
    process.env.KB_EXTRACT_MINERU_BASE_URL = "http://localhost:8100"
    const { getDefaultExtractor } = await import("@/lib/rag/extractors")
    const ex = getDefaultExtractor()
    expect(ex.name).toMatch(/^SmartRouter\(/)
    expect(ex.name).toContain("MineruExtractor")
  })
})
```

You'll also need the import at the top (if not already present):

```ts
import { afterEach } from "vitest"
```

- [ ] **Step 2: Verify the new tests fail**

```bash
bun x vitest run tests/unit/rag/extractors/smart-router-extractor.test.ts
```
Expected: earlier tests pass, the two new ones FAIL because the sentinel doesn't exist yet.

- [ ] **Step 3: Wire the sentinel in `src/lib/rag/extractors/index.ts`**

Edit the `buildExtractor` function — add the new branch:

```ts
import { SmartRouterExtractor } from "./smart-router-extractor";

// ... at the top, extend the export:
export { VisionLlmExtractor, UnpdfExtractor, MineruExtractor, HybridExtractor, SmartRouterExtractor };

// Extend buildExtractor:
function buildExtractor(modelId: string): Extractor {
  if (modelId === "unpdf") return new UnpdfExtractor();
  if (modelId === "mineru") {
    return new MineruExtractor(getRagConfig().extractMineruBaseUrl);
  }
  if (modelId === "hybrid") {
    const mineruUrl = getRagConfig().extractMineruBaseUrl;
    return new HybridExtractor(new MineruExtractor(mineruUrl), new UnpdfExtractor());
  }
  if (modelId === "smart") {
    const cfg = getRagConfig();
    // Recursively build the fallback from its sentinel / model id.
    const fallback = buildExtractor(cfg.extractSmartFallback);
    return new SmartRouterExtractor(new UnpdfExtractor(), fallback);
  }
  return new VisionLlmExtractor(modelId);
}
```

- [ ] **Step 4: Run the integration tests + all rag tests to check for regressions**

```bash
bun x vitest run tests/unit/rag/extractors/smart-router-extractor.test.ts
bun x vitest run tests/unit/rag/
```
Expected: all smart-router tests PASS; full rag suite PASSES with no regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/index.ts tests/unit/rag/extractors/smart-router-extractor.test.ts
git commit -m "feat(rag): wire KB_EXTRACT_PRIMARY=\"smart\" into buildExtractor

Registers the \"smart\" sentinel so setting KB_EXTRACT_PRIMARY=\"smart\"
constructs a SmartRouterExtractor with unpdf as the text-layer
extractor and the fallback resolved from KB_EXTRACT_SMART_FALLBACK
(defaults to openai/gpt-4.1-nano; override to mineru on-prem).

The fallback lookup is recursive through the same buildExtractor
registry, so any existing sentinel works as a fallback: smart→mineru,
smart→hybrid, smart→openai/gpt-4.1-nano, etc.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: `.env.example` documentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Read the current state of the KB section**

```bash
grep -n "KB_EXTRACT_PRIMARY\|KB_EXTRACT_MINERU\|KB_EXTRACT_FALLBACK" .env.example
```
Expected output: the existing MinerU block showing current KB_EXTRACT_PRIMARY modes.

- [ ] **Step 2: Insert the SMART mode block after the MinerU HYBRID block**

Find the `# HYBRID mode — strict union of MinerU structure...` block in `.env.example`. Immediately after it, insert:

```
#
# SMART mode (RECOMMENDED DEFAULT) — router: unpdf first, OCR on fall-through.
# Validated on a 40-doc mixed-corpus bench: 98% coverage at 1.1 s avg latency.
# Born-digital prose docs skip OCR entirely (50 ms path); scans and table-heavy
# docs go through the fallback (MinerU on-prem, gpt-4.1-nano on cloud).
#
# Cloud deployment:
# KB_EXTRACT_PRIMARY="smart"
# KB_EXTRACT_SMART_FALLBACK="openai/gpt-4.1-nano"   # default if unset
#
# On-prem deployment (requires MinerU sidecar up per services/mineru-server/):
# KB_EXTRACT_PRIMARY="smart"
# KB_EXTRACT_SMART_FALLBACK="mineru"
# KB_EXTRACT_MINERU_BASE_URL="http://localhost:8100"
```

- [ ] **Step 3: Verify the insertion is syntactically valid by re-reading the file**

```bash
grep -n "SMART mode\|KB_EXTRACT_SMART_FALLBACK" .env.example
```
Expected: both strings present, no duplicates.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs(env): document KB_EXTRACT_PRIMARY=\"smart\" mode

Adds a new SMART section to .env.example describing the router mode
and its cloud vs on-prem fallback configurations. Includes the
empirical 98%/1.1 s number from the 40-doc bench as a quick summary
of why this mode is recommended.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: End-to-end regression check via `bench-all-approaches`

**Files:**
- Read: `tests/bench-kb/src/bench-all-approaches.ts` (no changes)
- Generate: `tests/bench-kb/results/all-approaches/summary.csv` (updated)

- [ ] **Step 1: Verify the MinerU sidecar is up**

```bash
curl -sf http://localhost:8100/health
```
Expected: `{"status":"ok","model":"opendatalab/MinerU2.5-Pro-2604-1.2B","loaded":true}` (or `loaded:false` if first boot, which is fine — lazy load).

If not up, start it:
```bash
source ~/vllm-env/bin/activate
CUDA_VISIBLE_DEVICES=0 FLASHINFER_DISABLE_VERSION_CHECK=1 \
  uvicorn services.mineru-server.server:app --host 0.0.0.0 --port 8100 \
  > /tmp/mineru-sidecar.log 2>&1 &
```

- [ ] **Step 2: Run the bench**

```bash
cd /home/shiro/rantai/RantAI-Agents
KB_EXTRACT_MINERU_BASE_URL=http://localhost:8100 \
OPENROUTER_API_KEY=$(grep -m1 "^OPENROUTER_API_KEY=" .env | cut -d= -f2- | tr -d '"') \
N_RESUME=30 N_INDO=10 \
  bun tests/bench-kb/src/bench-all-approaches.ts 2>&1 | tee /tmp/post-ship-bench.log
```
Expected: all six approaches run; `router` row in the aggregate table shows coverage >= 97% and avg latency <= 2500 ms. Concretely looking for a line like:
```
router       | ≤2500      | ≥703/725 (97%+)
```
If `router` drops below those targets, the heuristic needs retuning before merging.

- [ ] **Step 3: Compare against the pre-ship numbers**

```bash
grep -A 8 "AGGREGATE (by approach" /tmp/post-ship-bench.log
```
Expected output resembles (within ±1 label tolerance):
```
router       | ~1100      | ~712/725 (98%)
```

- [ ] **Step 4: Commit the regenerated bench CSV**

```bash
git add tests/bench-kb/results/all-approaches/summary.csv
git commit -m "test(bench-kb): regenerate all-approaches summary after smart-router ship

Router numbers should match the pre-ship bench (98% / 1107 ms) — this
commit captures the post-ship run for the record so any future drift
shows up in diff.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Final review — full rag suite + typecheck

**Files:** none

- [ ] **Step 1: Run full RAG unit-test suite**

```bash
bun x vitest run tests/unit/rag/
```
Expected: all tests PASS. Count should be 115 (pre-ship baseline) + 15 (Task 1 signals) + 5 (Task 2 columnar) + 5 (Task 3 currency) + 1 (Task 4 happy path) + 5 (Task 5 fallback) + 2 (Task 6 config) + 2 (Task 7 integration) = **150 tests**.

- [ ] **Step 2: Typecheck new files only**

```bash
bun x tsc --noEmit -p tsconfig.json 2>&1 | grep -E "text-layer-signals|smart-router-extractor|rag/config|rag/extractors/index" | head
```
Expected: no output (no errors in these paths). Pre-existing Next.js/docs-site errors in other paths are not a regression; do not fix them in this plan.

- [ ] **Step 3: If everything passes, no further commit needed — plan is complete.**

If any test fails or typecheck errors appear in new files, fix them and commit under a `fix(rag):` message before declaring done.

---

## Self-review checklist

**Spec coverage:**
- `isUnpdfSufficient` with volume/columnar/currency gates — Tasks 1, 2, 3 ✓
- `SmartRouterExtractor` class with happy path — Task 4 ✓
- Fallback path + error handling — Task 5 ✓
- `KB_EXTRACT_SMART_FALLBACK` env var — Task 6 ✓
- `"smart"` sentinel registration in `buildExtractor` — Task 7 ✓
- `.env.example` docs with cloud + on-prem blocks — Task 8 ✓
- Empirical bench success criteria (resume ≥99%, Indonesian ≥95%, latency ≤2500 ms) — Task 9 ✓
- Backward compat (existing sentinels unchanged, hybrid still available) — Task 7 preserves all existing branches ✓

**Placeholder scan:** none.

**Type consistency:**
- `RouterOpts` fields (`minCharsPerPage`, `maxColumnarLines`, `maxCurrencyMatches`) used identically across Tasks 1–5.
- `SmartRouterExtractor` constructor signature `(textLayer, fallback, opts?)` consistent across Tasks 4, 5, 7.
- Model-id rewrite pattern (`smart(<name>)` / `smart(fallback:<name>)`) consistent across Tasks 4, 5.
- Existing `Extractor` / `ExtractionResult` types unchanged.
- `buildExtractor` branch structure matches existing `unpdf`/`mineru`/`hybrid` pattern.
