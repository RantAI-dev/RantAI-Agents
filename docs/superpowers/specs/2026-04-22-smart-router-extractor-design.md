# Smart Router Extractor — Design

## Goal

Route each incoming PDF to the right extractor based on cheap signals from
its text layer, so that prose-heavy born-digital docs skip the 4-second OCR
call entirely, while scans and complex-layout docs still go through the
vision model.

Empirically validated against `unpdf`, `mineru`, `hybrid`, and
`gpt-4.1-nano+context` on a 40-doc mixed corpus (30 resumes + 10 Indonesian
scans, 725 ground-truth labels):

| Approach | Coverage | Avg latency |
|---|---|---|
| unpdf alone | 43% | 23 ms |
| mineru alone | 97% | 8073 ms |
| hybrid (Pattern 2 merge) | 97% | 6804 ms |
| nano-ctx (Approach D always) | 93% | 12833 ms |
| router+D | 95% | 2247 ms |
| **smart router (this spec)** | **98%** | **1107 ms** |

Perfect 300/300 on resumes at unpdf speed. 97% on Indonesian scans via MinerU
fall-through. Saves ~9 GPU-hours per day at 5K pages/day on a
70%-prose/30%-scan corpus vs always-MinerU.

Raw bench CSV: `tests/bench-kb/results/all-approaches/summary.csv`.

## Architecture

One new extractor class, no changes to the rest of the pipeline. Slots in
behind the existing `KB_EXTRACT_PRIMARY` sentinel mechanism.

```
src/lib/rag/extractors/
├─ smart-router-extractor.ts   (NEW)
├─ text-layer-signals.ts       (NEW — exported for testing)
├─ unpdf-extractor.ts          (unchanged)
├─ vision-llm-extractor.ts     (unchanged — used as fallback on cloud)
├─ mineru-extractor.ts         (unchanged — used as fallback on on-prem)
├─ hybrid-extractor.ts         (kept, still available via KB_EXTRACT_PRIMARY="hybrid")
├─ hybrid-merge.ts             (kept)
└─ index.ts                    (new branch for KB_EXTRACT_PRIMARY="smart")
```

### Flow

```
pdfBuffer arrives
     │
     ▼
 unpdf.extract()  ─── 50 ms, always runs
     │
     ▼
 isUnpdfSufficient(text, pageCount)?
     │
     ├─ YES  → return { text: unpdfText, model: "smart(unpdf)" }
     │         (prose docs, 50 ms total)
     │
     └─ NO   → fallback.extract(pdfBuffer)
               (scans, tables, garbled text)
               return { text, model: "smart(fallback:<name>)" }
```

`fallback` is injected at construction time — `MineruExtractor` on-prem,
`VisionLlmExtractor("openai/gpt-4.1-nano")` on cloud. The router itself
does not know or care.

## Components

### `SmartRouterExtractor`

**Purpose:** Wraps a text-layer extractor and an OCR fallback, decides per
document which to use.

**Interface:**
```typescript
class SmartRouterExtractor implements Extractor {
  constructor(textLayer: Extractor, fallback: Extractor, opts?: {
    minCharsPerPage?: number;      // default 300
    maxColumnarLines?: number;     // default 5
    maxCurrencyMatches?: number;   // default 10
  });
  readonly name: string;
  extract(pdfBuffer: Buffer): Promise<ExtractionResult>;
}
```

**Behavior:**
- Call `textLayer.extract(pdfBuffer)`.
- Call `isUnpdfSufficient(text, pageCount)` with constructor opts.
- If sufficient, return text-layer result (rewriting `model` to include
  `"smart(<textLayer.name>)"` for observability).
- Else, call `fallback.extract(pdfBuffer)` and return its result (rewriting
  `model` to `"smart(fallback:<fallback.name>)"`).
- If text-layer throws (e.g. corrupt PDF), catch and fall through.
- If fallback throws, re-throw with a descriptive message mentioning both
  extractors.

### `isUnpdfSufficient` (in `text-layer-signals.ts`)

**Purpose:** Pure function, no side effects, easy to unit-test and tune.

```typescript
function isUnpdfSufficient(text: string, pageCount: number, opts: RouterOpts): boolean {
  if (!text || text.length < opts.minCharsPerPage * pageCount) return false;
  if (hasColumnarLines(text, opts.maxColumnarLines)) return false;
  if (hasDenseCurrency(text, opts.maxCurrencyMatches)) return false;
  return true;
}

function hasColumnarLines(text: string, threshold: number): boolean;
function hasDenseCurrency(text: string, threshold: number): boolean;
function estimatePageCount(pdfBuffer: Buffer): number;  // fast path via unpdf metadata
```

Heuristics chosen empirically from the bench:

1. **Volume gate** — `chars >= 300 × pageCount`. Scans produce near-empty
   text layers; this gate catches them.
2. **Columnar signal** — count lines with 2+ runs of 3+ whitespace chars
   between visible text. Tables flatten to these in text layer. More than 5
   such lines → tables present → route to OCR.
3. **Currency signal** — count `$X,XXX` patterns. Financial tables have
   many; plain prose doesn't. More than 10 → route to OCR.

Design invariants:
- All thresholds are injected via opts so they're tunable without code
  changes and overridable per deployment.
- Each signal returns `boolean`, not a score. Keeps the decision
  auditable (logs can record which gate triggered).
- Signals are ordered cheapest-first (length check before regex scan).

## Data flow

```
                        config
                          │
                          ▼
    KB_EXTRACT_PRIMARY="smart"
                          │
                          ▼
     buildExtractor("smart") in extractors/index.ts
                          │
                          ▼
     SmartRouterExtractor(
       textLayer = new UnpdfExtractor(),
       fallback = buildExtractor(KB_EXTRACT_SMART_FALLBACK ?? "openai/gpt-4.1-nano")
     )
                          │
                          ▼
              ingest.ts calls .extract(pdfBuffer)
                          │
                          ▼
               returns ExtractionResult
                          │
                          ▼
             chunker, embedder, vector store (unchanged)
```

Existing env vars stay compatible:
- `KB_EXTRACT_PRIMARY="smart"` — new, activates router
- `KB_EXTRACT_SMART_FALLBACK` — new, specifies the OCR fallback model
  (defaults to `"openai/gpt-4.1-nano"` on cloud; set to `"mineru"` for
  on-prem)
- `KB_EXTRACT_MINERU_BASE_URL` — unchanged, used when fallback is "mineru"
- `KB_EXTRACT_VISION_BASE_URL` — unchanged, used when fallback is a
  vision-LLM model id
- All existing sentinels (`"unpdf"`, `"mineru"`, `"hybrid"`, any
  OpenRouter model id) still work unchanged

## Error handling

| Scenario | Behavior |
|---|---|
| Text layer extraction throws | Log warning, fall through to OCR fallback. Router returns fallback's result or throws if fallback also fails. |
| Heuristic says "sufficient" but text layer actually empty | Covered by volume gate. |
| Fallback throws | Throw a combined error mentioning both extractors and their failure messages. Ingest should treat this as a hard failure (same as today's `extractWithFallback`). |
| Page-count estimation fails | Default to `pageCount = 1`. Worst case: under-estimates, triggers fallback more often. Safe bias. |

## Testing

### Unit tests
- `text-layer-signals.test.ts`
  - `isUnpdfSufficient` returns false when text empty / below char threshold
  - returns false with 6+ columnar lines
  - returns false with 11+ currency patterns
  - returns true on plain prose
  - respects custom opts
- `smart-router-extractor.test.ts`
  - Calls text-layer first, returns its result when sufficient
  - Falls through to fallback when insufficient
  - Falls through on text-layer throw
  - Re-throws combined error when both fail
  - Model id reflects which branch was used
  - Uses the pageCount from text-layer's result when available

### Integration / regression
- Keep the existing `bench-all-approaches.ts` as a canonical regression
  test. CI can run it nightly against a small sample (e.g. 6 resumes +
  3 Indonesian samples) to catch drift.
- Success criteria for the router in that bench:
  - Resume coverage ≥ 99% (target: 100%)
  - Indonesian coverage ≥ 95%
  - Avg latency ≤ 2500 ms across the mixed corpus

## Migration / rollout

1. Ship `SmartRouterExtractor` + signals + tests.
2. Keep defaults unchanged (still `KB_EXTRACT_PRIMARY="openai/gpt-4.1-nano"`)
   so this is **opt-in** on first release.
3. Flip the default to `"smart"` in a follow-up commit once internal
   dogfooding confirms no surprises on real customer uploads.
4. Document the router prominently in `.env.example` alongside the existing
   modes.
5. Hybrid extractor stays available for the specific case where someone
   wants MinerU structure + unpdf chars per-block merging.

## What this spec is NOT

- **Not** a replacement for Pattern 3 (region-level hybrid). That spec is
  still deferred per
  `docs/superpowers/plans/2026-04-22-hybrid-extractor-pattern-3-region-level.md`.
- **Not** a change to any downstream pipeline stage (chunker, embedder,
  retriever). Only the extractor layer changes.
- **Not** introducing a new dependency. All components already exist.

## Self-review

Placeholders: none.
Internal consistency: env-var naming is consistent; fallback model selection
described once; heuristic thresholds cross-referenced with bench results.
Scope: single extractor class + pure signal helpers + tests + doc updates.
Single implementation plan's worth of work.
Ambiguity: `pageCount` source is stated explicitly (`unpdf` metadata → 1 on
failure). Thresholds are stated as defaults and overridable. Fallback model
selection is explicit per mode.
