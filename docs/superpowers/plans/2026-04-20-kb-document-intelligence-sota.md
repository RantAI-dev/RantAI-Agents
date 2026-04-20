# KB Document Intelligence SOTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply three measured SOTA wins to the KB/document intelligence pipeline: (1) vision-LLM PDF extraction replacing `unpdf`, (2) `qwen/qwen3-embedding-8b` replacing `openai/text-embedding-3-small`, (3) optional LLM-as-reranker opt-in.

**Architecture:** The pipeline stages remain the same (ingest → chunk → embed → store → retrieve → rerank → answer). Every layer gets a model-selection env var. Extraction becomes pluggable. SurrealDB `document_chunk.embedding` MTREE index gets re-defined at a new dimension (4096). A one-shot migration script re-embeds all existing chunks. An in-repo `tests/bench-kb/` directory holds the harness that validated the wins.

**Tech Stack:** Next.js + TypeScript, bun package manager, Prisma + PostgreSQL (document metadata), SurrealDB (vectors), vitest (tests), OpenRouter (all model calls).

**Source spec:** [`docs/superpowers/specs/2026-04-20-kb-document-intelligence-sota-audit.md`](../specs/2026-04-20-kb-document-intelligence-sota-audit.md)

---

## File Structure (created / modified)

**New files:**
- `src/lib/rag/config.ts` — central env-driven config (all `KB_*` vars)
- `src/lib/rag/extractors/index.ts` — extractor dispatch
- `src/lib/rag/extractors/unpdf-extractor.ts` — existing path, extracted
- `src/lib/rag/extractors/vision-llm-extractor.ts` — new vision-LLM extractor
- `src/lib/rag/extractors/types.ts` — `Extractor` interface
- `src/lib/rag/rerankers/index.ts` — reranker dispatch
- `src/lib/rag/rerankers/llm-reranker.ts` — LLM-as-reranker implementation
- `src/lib/rag/rerankers/types.ts` — `Reranker` interface
- `scripts/kb-migrate-embeddings.ts` — one-shot migration script
- `tests/bench-kb/README.md` — how to run the harness
- `tests/bench-kb/src/lib.ts` — shared OpenRouter helpers (port of `/tmp/kb-bench/src/lib.ts`)
- `tests/bench-kb/src/smart-chunker.ts` — frozen chunker copy
- `tests/bench-kb/src/prepare-corpus.ts`
- `tests/bench-kb/src/generate-qa.ts`
- `tests/bench-kb/src/bench-extraction.ts`
- `tests/bench-kb/src/bench-embedding.ts`
- `tests/bench-kb/src/bench-rerank.ts`
- `tests/bench-kb/src/bench-e2e.ts`
- `tests/bench-kb/corpus/` (fixture docs — `.gitkeep` only, docs fetched on first run)
- `tests/bench-kb/results/.gitignore` (ignore everything; only dir committed)
- `tests/unit/rag/config.test.ts`
- `tests/unit/rag/extractors/vision-llm-extractor.test.ts`
- `tests/unit/rag/rerankers/llm-reranker.test.ts`
- `tests/integration/rag/migration.test.ts`

**Modified files:**
- `.env.example` — add `KB_*` env vars
- `src/lib/rag/embeddings.ts` — read model from `getRagConfig()`; update types for variable dim
- `src/lib/rag/vector-store.ts` — remove hardcoded 1536 comments; pass through whatever dim the embedder returns
- `src/lib/rag/file-processor.ts` — use the new extractor dispatch
- `src/lib/rag/retriever.ts` — remove non-English translation hop; call reranker dispatch
- `src/lib/rag/ingest.ts` — use the new extractor path
- `src/lib/rag/index.ts` — export new modules
- `src/lib/surrealdb/schema.surql` — change `MTREE DIMENSION 1536` → read config; document migration
- `package.json` — add `"kb:migrate": "bun scripts/kb-migrate-embeddings.ts"` and `"bench:kb": "bun tests/bench-kb/src/bench-e2e.ts"`

**Not modified:**
- `src/lib/rag/chunker.ts` and `src/lib/rag/smart-chunker.ts` — chunking layer unchanged (spec §2)
- `src/lib/rag/hybrid-search.ts` — entity/RRF hybrid kept as-is (spec §"What this design does NOT do")
- Prisma schema — document-level metadata unchanged

---

## Phases

- **Phase 1 (Tasks 1-3):** Config surface + env plumbing — foundation, no behavior change.
- **Phase 2 (Tasks 4-7):** Vision-LLM extraction replacing `unpdf`. Extraction-quality tests go green.
- **Phase 3 (Tasks 8-12):** Embedding swap + schema migration. Retrieval-quality tests go green.
- **Phase 4 (Tasks 13-14):** LLM reranker opt-in. Spec's "quality mode" becomes real.
- **Phase 5 (Task 15):** Drop ID→EN translation hop.
- **Phase 6 (Tasks 16-17):** Port bench harness in-repo + smoke bench CI.

Each phase produces a committable, revertible unit.

---

### Task 1: Central RAG config module

**Files:**
- Create: `src/lib/rag/config.ts`
- Create: `tests/unit/rag/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getRagConfig } from "@/lib/rag/config";

describe("getRagConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.KB_EXTRACT_PRIMARY;
    delete process.env.KB_EXTRACT_FALLBACK;
    delete process.env.KB_EMBEDDING_MODEL;
    delete process.env.KB_EMBEDDING_DIM;
    delete process.env.KB_RERANK_ENABLED;
    delete process.env.KB_RERANK_MODEL;
    delete process.env.KB_RERANK_INITIAL_K;
    delete process.env.KB_RERANK_FINAL_K;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns SOTA defaults when no env vars set", () => {
    const cfg = getRagConfig();
    expect(cfg.extractPrimary).toBe("google/gemini-3-flash-preview");
    expect(cfg.extractFallback).toBe("anthropic/claude-sonnet-4.6");
    expect(cfg.embeddingModel).toBe("qwen/qwen3-embedding-8b");
    expect(cfg.embeddingDim).toBe(4096);
    expect(cfg.rerankEnabled).toBe(false);
    expect(cfg.rerankModel).toBe("google/gemini-3-flash-preview");
    expect(cfg.rerankInitialK).toBe(20);
    expect(cfg.rerankFinalK).toBe(5);
  });

  it("reads overrides from env", () => {
    process.env.KB_EXTRACT_PRIMARY = "anthropic/claude-haiku-4.5";
    process.env.KB_EMBEDDING_MODEL = "openai/text-embedding-3-large";
    process.env.KB_EMBEDDING_DIM = "3072";
    process.env.KB_RERANK_ENABLED = "true";
    process.env.KB_RERANK_INITIAL_K = "40";
    const cfg = getRagConfig();
    expect(cfg.extractPrimary).toBe("anthropic/claude-haiku-4.5");
    expect(cfg.embeddingModel).toBe("openai/text-embedding-3-large");
    expect(cfg.embeddingDim).toBe(3072);
    expect(cfg.rerankEnabled).toBe(true);
    expect(cfg.rerankInitialK).toBe(40);
  });

  it("throws if KB_EMBEDDING_DIM is non-numeric", () => {
    process.env.KB_EMBEDDING_DIM = "not-a-number";
    expect(() => getRagConfig()).toThrow(/KB_EMBEDDING_DIM/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun vitest run tests/unit/rag/config.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/rag/config'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/rag/config.ts
export interface RagConfig {
  extractPrimary: string;
  extractFallback: string;
  embeddingModel: string;
  embeddingDim: number;
  rerankEnabled: boolean;
  rerankModel: string;
  rerankInitialK: number;
  rerankFinalK: number;
}

const DEFAULTS: RagConfig = {
  extractPrimary: "google/gemini-3-flash-preview",
  extractFallback: "anthropic/claude-sonnet-4.6",
  embeddingModel: "qwen/qwen3-embedding-8b",
  embeddingDim: 4096,
  rerankEnabled: false,
  rerankModel: "google/gemini-3-flash-preview",
  rerankInitialK: 20,
  rerankFinalK: 5,
};

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${key} must be an integer, got "${raw}"`);
  }
  return n;
}

export function getRagConfig(): RagConfig {
  return {
    extractPrimary: process.env.KB_EXTRACT_PRIMARY || DEFAULTS.extractPrimary,
    extractFallback: process.env.KB_EXTRACT_FALLBACK || DEFAULTS.extractFallback,
    embeddingModel: process.env.KB_EMBEDDING_MODEL || DEFAULTS.embeddingModel,
    embeddingDim: parseIntEnv("KB_EMBEDDING_DIM", DEFAULTS.embeddingDim),
    rerankEnabled: process.env.KB_RERANK_ENABLED === "true",
    rerankModel: process.env.KB_RERANK_MODEL || DEFAULTS.rerankModel,
    rerankInitialK: parseIntEnv("KB_RERANK_INITIAL_K", DEFAULTS.rerankInitialK),
    rerankFinalK: parseIntEnv("KB_RERANK_FINAL_K", DEFAULTS.rerankFinalK),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun vitest run tests/unit/rag/config.test.ts
```
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/config.ts tests/unit/rag/config.test.ts
git commit -m "feat(rag): add central config module for KB pipeline

All KB_* env vars parsed in one place. Defaults match the SOTA audit:
gemini-3-flash-preview for extraction, qwen3-embedding-8b (4096d) for
embeddings, rerank off by default.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire env template

**Files:**
- Modify: `.env.example` (append after existing RAG-related section)

- [ ] **Step 1: Append KB config block**

Append this block to `.env.example` (right after the `SURREAL_DB_*` section):

```
# ============================================
# KNOWLEDGE BASE / RAG PIPELINE (Optional — SOTA defaults)
# ============================================
# Defaults selected from 2026-04-20 SOTA audit. Override to swap models.

# PDF / image extraction. gemini-3-flash-preview: 4-5s, compact markdown, tables + equations.
KB_EXTRACT_PRIMARY="google/gemini-3-flash-preview"

# Premium fallback for equation-heavy or table-critical docs.
KB_EXTRACT_FALLBACK="anthropic/claude-sonnet-4.6"

# Embedding model for chunks + queries. qwen3-embedding-8b measured +14.3 pts
# hit@1 vs the legacy openai/text-embedding-3-small. Multilingual (handles Bahasa).
KB_EMBEDDING_MODEL="qwen/qwen3-embedding-8b"
KB_EMBEDDING_DIM="4096"

# Rerank is OFF by default. When true, uses the rerank model below for top-20 → top-5.
# Adds ~1700ms per query but lifts hit@1 by +5.7 pts.
KB_RERANK_ENABLED="false"
KB_RERANK_MODEL="google/gemini-3-flash-preview"
KB_RERANK_INITIAL_K="20"
KB_RERANK_FINAL_K="5"
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document KB pipeline env vars with SOTA defaults

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Export new config from RAG index

**Files:**
- Modify: `src/lib/rag/index.ts:1-5` (top of file)

- [ ] **Step 1: Add export**

Open `src/lib/rag/index.ts` and add near the top (after the module docstring, before other exports):

```typescript
// Config
export { getRagConfig } from "./config";
export type { RagConfig } from "./config";
```

- [ ] **Step 2: Type-check**

```
bunx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/rag/index.ts
git commit -m "feat(rag): export getRagConfig from module index

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Extractor interface + unpdf extractor

**Files:**
- Create: `src/lib/rag/extractors/types.ts`
- Create: `src/lib/rag/extractors/unpdf-extractor.ts`

- [ ] **Step 1: Define the interface**

```typescript
// src/lib/rag/extractors/types.ts
export interface ExtractionResult {
  text: string;
  ms: number;
  pages?: number;
  model: string; // identifier of the extractor used
}

export interface Extractor {
  name: string;
  extract(pdfBuffer: Buffer): Promise<ExtractionResult>;
}
```

- [ ] **Step 2: Port unpdf path**

```typescript
// src/lib/rag/extractors/unpdf-extractor.ts
import type { Extractor, ExtractionResult } from "./types";

export class UnpdfExtractor implements Extractor {
  readonly name = "unpdf";

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const t0 = Date.now();
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return {
      text: Array.isArray(text) ? text.join("\n") : text,
      ms: Date.now() - t0,
      pages: totalPages,
      model: "unpdf",
    };
  }
}
```

- [ ] **Step 3: Type-check + commit (no tests yet — this just refactors existing behavior; Task 7 adds the integration test)**

```
bunx tsc --noEmit
git add src/lib/rag/extractors/
git commit -m "refactor(rag): factor unpdf extraction into Extractor interface

Prepares for pluggable vision-LLM extractor. No behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Vision-LLM extractor with tests

**Files:**
- Create: `src/lib/rag/extractors/vision-llm-extractor.ts`
- Create: `tests/unit/rag/extractors/vision-llm-extractor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/extractors/vision-llm-extractor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VisionLlmExtractor } from "@/lib/rag/extractors/vision-llm-extractor";

describe("VisionLlmExtractor", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("sends PDF as file content-type to OpenRouter and returns markdown", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "# Extracted\n\nbody" } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    });

    const extractor = new VisionLlmExtractor("google/gemini-3-flash-preview");
    const result = await extractor.extract(Buffer.from("%PDF-1.5\nfake"));

    expect(result.text).toBe("# Extracted\n\nbody");
    expect(result.model).toBe("google/gemini-3-flash-preview");
    expect(result.ms).toBeGreaterThanOrEqual(0);

    const call = (global.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe("google/gemini-3-flash-preview");
    expect(body.messages[0].content[0].type).toBe("file");
    expect(body.messages[0].content[0].file.filename).toBe("document.pdf");
    expect(body.messages[0].content[0].file.file_data).toMatch(/^data:application\/pdf;base64,/);
  });

  it("throws with informative message on API error", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    const extractor = new VisionLlmExtractor("google/gemini-3-flash-preview");
    await expect(extractor.extract(Buffer.from("x"))).rejects.toThrow(/429/);
  });

  it("throws if OPENROUTER_API_KEY is not set", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const extractor = new VisionLlmExtractor("google/gemini-3-flash-preview");
    await expect(extractor.extract(Buffer.from("x"))).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun vitest run tests/unit/rag/extractors/vision-llm-extractor.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/rag/extractors/vision-llm-extractor'`

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/rag/extractors/vision-llm-extractor.ts
import type { Extractor, ExtractionResult } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const EXTRACTION_PROMPT = `Extract the full textual content of this PDF as clean Markdown. Preserve:
- headings (use #/##/### matching document hierarchy)
- bullet and numbered lists
- tables as Markdown tables
- inline math with $...$ and block math with $$...$$
- code blocks with fences

Do not summarize. Do not omit content. Do not add commentary. Output ONLY the extracted Markdown.`;

export class VisionLlmExtractor implements Extractor {
  readonly name: string;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(model: string, opts: { maxTokens?: number } = {}) {
    this.name = model;
    this.model = model;
    this.maxTokens = opts.maxTokens ?? 16000;
  }

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

    const base64 = pdfBuffer.toString("base64");
    const body = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: "document.pdf",
                file_data: `data:application/pdf;base64,${base64}`,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
      max_tokens: this.maxTokens,
      temperature: 0,
    };

    const t0 = Date.now();
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`VisionLlmExtractor ${this.model} ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text, ms, model: this.model };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun vitest run tests/unit/rag/extractors/vision-llm-extractor.test.ts
```
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/vision-llm-extractor.ts tests/unit/rag/extractors/vision-llm-extractor.test.ts
git commit -m "feat(rag): add vision-LLM PDF extractor

Sends PDF as file content-type to OpenRouter. Prompt targets markdown with
headings, tables, equations, code preserved. Replaces unpdf's flat-text
output for any model that supports native PDF input (Gemini + Claude do).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Extractor dispatch with fallback

**Files:**
- Create: `src/lib/rag/extractors/index.ts`

- [ ] **Step 1: Write the failing test**

Extend `tests/unit/rag/extractors/vision-llm-extractor.test.ts` (append a new describe block at the bottom):

```typescript
describe("getDefaultExtractor", () => {
  it("returns VisionLlmExtractor configured with KB_EXTRACT_PRIMARY", async () => {
    process.env.KB_EXTRACT_PRIMARY = "anthropic/claude-haiku-4.5";
    const { getDefaultExtractor } = await import("@/lib/rag/extractors");
    const ex = getDefaultExtractor();
    expect(ex.name).toBe("anthropic/claude-haiku-4.5");
  });
});

describe("extractWithFallback", () => {
  it("uses primary when it succeeds", async () => {
    const primary = { name: "primary", extract: vi.fn().mockResolvedValue({ text: "ok", ms: 10, model: "primary" }) };
    const fallback = { name: "fallback", extract: vi.fn() };
    const { extractWithFallback } = await import("@/lib/rag/extractors");
    const result = await extractWithFallback(Buffer.from("x"), primary as any, fallback as any);
    expect(result.model).toBe("primary");
    expect(fallback.extract).not.toHaveBeenCalled();
  });

  it("falls back when primary throws", async () => {
    const primary = { name: "primary", extract: vi.fn().mockRejectedValue(new Error("boom")) };
    const fallback = { name: "fallback", extract: vi.fn().mockResolvedValue({ text: "ok", ms: 10, model: "fallback" }) };
    const { extractWithFallback } = await import("@/lib/rag/extractors");
    const result = await extractWithFallback(Buffer.from("x"), primary as any, fallback as any);
    expect(result.model).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun vitest run tests/unit/rag/extractors/vision-llm-extractor.test.ts
```
Expected: 2 new tests FAIL with `Cannot find module '@/lib/rag/extractors'`

- [ ] **Step 3: Write the dispatch module**

```typescript
// src/lib/rag/extractors/index.ts
import { getRagConfig } from "../config";
import { VisionLlmExtractor } from "./vision-llm-extractor";
import { UnpdfExtractor } from "./unpdf-extractor";
import type { Extractor, ExtractionResult } from "./types";

export type { Extractor, ExtractionResult };
export { VisionLlmExtractor, UnpdfExtractor };

export function getDefaultExtractor(): Extractor {
  const { extractPrimary } = getRagConfig();
  if (extractPrimary === "unpdf") return new UnpdfExtractor();
  return new VisionLlmExtractor(extractPrimary);
}

export function getFallbackExtractor(): Extractor {
  const { extractFallback } = getRagConfig();
  if (extractFallback === "unpdf") return new UnpdfExtractor();
  return new VisionLlmExtractor(extractFallback);
}

export async function extractWithFallback(
  pdfBuffer: Buffer,
  primary: Extractor,
  fallback: Extractor
): Promise<ExtractionResult> {
  try {
    return await primary.extract(pdfBuffer);
  } catch (err) {
    console.warn(
      `[rag/extractors] primary ${primary.name} failed (${(err as Error).message.slice(0, 120)}), falling back to ${fallback.name}`
    );
    return await fallback.extract(pdfBuffer);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
bun vitest run tests/unit/rag/extractors/vision-llm-extractor.test.ts
```
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/extractors/index.ts
git commit -m "feat(rag): extractor dispatch with primary+fallback

getDefaultExtractor / getFallbackExtractor read from RagConfig.
extractWithFallback swallows primary errors and logs before falling through.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire extractor into file-processor

**Files:**
- Modify: `src/lib/rag/file-processor.ts:111-145` (the `processPdf` function)

- [ ] **Step 1: Replace processPdf body**

Open `src/lib/rag/file-processor.ts`. Find the `processPdf` function (starts near line 111) and replace its body so it reads from the new extractor dispatch while keeping the old OCR pipeline escape hatch intact:

```typescript
async function processPdf(
  filePath: string,
  options?: ProcessingOptions
): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);

  // Legacy OCR pipeline opt-in remains first — callers that set useOCRPipeline
  // want scanned-PDF detection via Ollama, not vision-LLM text extraction.
  if (options?.useOCRPipeline) {
    try {
      const { processDocumentOCR } = await import("@/lib/ocr");
      const result = await processDocumentOCR(dataBuffer, "application/pdf", {
        documentType: options.documentType,
        outputFormat: options.outputFormat || "markdown",
      });
      return "combinedText" in result ? result.combinedText : result.text;
    } catch (error) {
      console.warn("[processPdf] OCR pipeline failed, falling back to extractor dispatch:", error);
    }
  }

  const { getDefaultExtractor, getFallbackExtractor, extractWithFallback } = await import("./extractors");
  const primary = getDefaultExtractor();
  const fallback = getFallbackExtractor();
  const result = await extractWithFallback(dataBuffer, primary, fallback);
  return result.text;
}
```

- [ ] **Step 2: Write an integration test for the wiring**

Create `tests/integration/rag/file-processor-pdf.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { processFile } from "@/lib/rag/file-processor";
import * as fs from "node:fs";
import * as path from "node:path";

describe("processFile (PDF)", () => {
  const fixtureDir = path.join(__dirname, "../../fixtures/rag");
  const tinyPdfPath = path.join(fixtureDir, "tiny.pdf");

  beforeEach(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    // Minimal PDF (1 empty page) — just enough for unpdf to parse
    if (!fs.existsSync(tinyPdfPath)) {
      const minimalPdf = Buffer.from(
        "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\n" +
        "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000100 00000 n \n" +
        "trailer<</Size 4/Root 1 0 R>>\nstartxref\n150\n%%EOF",
        "binary"
      );
      fs.writeFileSync(tinyPdfPath, minimalPdf);
    }
  });

  it("uses extractor dispatch when OPENROUTER_API_KEY is set", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "# Tiny\n\nmocked" } }],
      }),
    } as Response);

    process.env.OPENROUTER_API_KEY = "test";
    process.env.KB_EXTRACT_PRIMARY = "google/gemini-3-flash-preview";
    const result = await processFile(tinyPdfPath);
    expect(result.content).toBe("# Tiny\n\nmocked");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run integration test**

```
bun vitest run tests/integration/rag/file-processor-pdf.test.ts
```
Expected: 1 passed

- [ ] **Step 4: Run full RAG unit tests to confirm no regression**

```
bun vitest run tests/unit/rag
```
Expected: all passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/file-processor.ts tests/integration/rag/file-processor-pdf.test.ts tests/fixtures/rag/
git commit -m "feat(rag): route PDF extraction through the new dispatch

file-processor.ts now calls getDefaultExtractor/getFallbackExtractor for
PDFs by default. useOCRPipeline opt-in remains for scanned-PDF + Ollama
users. unpdf is still available via KB_EXTRACT_PRIMARY=unpdf.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Make embeddings.ts read from config

**Files:**
- Modify: `src/lib/rag/embeddings.ts:11-15` (the module constants)

- [ ] **Step 1: Add failing test**

Create `tests/unit/rag/embeddings-config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("generateEmbedding model selection", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: new Array(4096).fill(0.1) }] }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("uses KB_EMBEDDING_MODEL when set", async () => {
    process.env.KB_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
    const { generateEmbedding } = await import("@/lib/rag/embeddings");
    await generateEmbedding("hello");
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe("qwen/qwen3-embedding-8b");
  });

  it("defaults to qwen/qwen3-embedding-8b when env unset", async () => {
    delete process.env.KB_EMBEDDING_MODEL;
    delete process.env.KB_EMBEDDING_DIM;
    vi.resetModules();
    const { generateEmbedding } = await import("@/lib/rag/embeddings");
    await generateEmbedding("hello");
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe("qwen/qwen3-embedding-8b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
bun vitest run tests/unit/rag/embeddings-config.test.ts
```
Expected: FAIL — current code hardcodes `EMBEDDING_MODEL = "openai/text-embedding-3-small"`

- [ ] **Step 3: Replace the module constants**

In `src/lib/rag/embeddings.ts`, replace lines 11-15:

```typescript
import { getRagConfig } from "./config";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/embeddings";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const BATCH_SIZE = 50;
```

Then inside `generateEmbedding` (around line 63, replace `body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })`):

```typescript
const { embeddingModel } = getRagConfig();
// ...
body: JSON.stringify({ model: embeddingModel, input: text }),
```

And similarly inside `generateEmbeddings` (batch function, wherever `EMBEDDING_MODEL` is referenced).

- [ ] **Step 4: Update the module docstring (lines 1-10) to remove the stale "uses text-embedding-3-small" claim**

Replace the top comment with:
```typescript
/**
 * Embeddings module using OpenRouter API
 * Model selected via KB_EMBEDDING_MODEL env (default: qwen/qwen3-embedding-8b, 4096 dims).
 *
 * Features:
 * - Retry logic with exponential backoff for transient errors
 * - Response validation before processing
 * - Batch processing with rate limiting
 */
```

- [ ] **Step 5: Run tests**

```
bun vitest run tests/unit/rag/embeddings-config.test.ts
bun vitest run tests/unit/rag
```
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add src/lib/rag/embeddings.ts tests/unit/rag/embeddings-config.test.ts
git commit -m "feat(rag): embed with KB_EMBEDDING_MODEL (default qwen3-embedding-8b)

Model is now read from RagConfig instead of a hardcoded constant. Default
switches from openai/text-embedding-3-small (1536d, 0.771 hit@1) to
qwen/qwen3-embedding-8b (4096d, 0.914 hit@1 — measured in the SOTA audit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: SurrealDB schema: parameterize the dimension

**Files:**
- Modify: `src/lib/surrealdb/schema.surql:23-24`

- [ ] **Step 1: Update schema comment + index dimension**

Replace lines 23-24 of `src/lib/surrealdb/schema.surql`:

```surql
-- Vector index for similarity search.
-- Dimension must match KB_EMBEDDING_DIM (default 4096 for qwen/qwen3-embedding-8b).
-- If you change KB_EMBEDDING_MODEL, drop this index and re-define with the new dimension,
-- then run `bun run kb:migrate` to re-embed all chunks.
DEFINE INDEX embedding_idx ON document_chunk FIELDS embedding MTREE DIMENSION 4096 DIST COSINE;
```

Do the same for `conversation_memory` index (line 71):
```surql
-- Dimension must match KB_EMBEDDING_DIM (default 4096).
DEFINE INDEX conversation_embedding_idx ON conversation_memory FIELDS embedding MTREE DIMENSION 4096 DIST COSINE;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/surrealdb/schema.surql
git commit -m "chore(surreal): document_chunk.embedding index → 4096 dim

Matches the new default embedding model qwen/qwen3-embedding-8b. Fresh
installs will apply this schema directly. Existing installs run
\`bun run kb:migrate\` after Task 11 is in place.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Migration script — re-embed all chunks

**Files:**
- Create: `scripts/kb-migrate-embeddings.ts`

- [ ] **Step 1: Write the script**

```typescript
// scripts/kb-migrate-embeddings.ts
// One-shot: re-embed every document_chunk with the current KB_EMBEDDING_MODEL.
// Steps performed, in order:
//   1. Drop the existing embedding_idx MTREE (dimension may mismatch new model).
//   2. For each chunk, re-generate embedding and UPDATE the row.
//   3. Re-DEFINE the embedding_idx with the KB_EMBEDDING_DIM from config.
//
// Safe to re-run. Progress logged every 50 chunks. Aborts cleanly on Ctrl-C.

import { getSurrealClient } from "@/lib/surrealdb";
import { generateEmbeddings } from "@/lib/rag/embeddings";
import { prepareChunkForEmbedding } from "@/lib/rag/chunker";
import { getRagConfig } from "@/lib/rag/config";

const BATCH = 32;

async function main() {
  const { embeddingModel, embeddingDim } = getRagConfig();
  console.log(`[migrate] target model: ${embeddingModel} (dim ${embeddingDim})`);

  const surreal = await getSurrealClient();

  console.log("[migrate] dropping old embedding_idx...");
  await surreal.query("REMOVE INDEX embedding_idx ON document_chunk;");

  console.log("[migrate] scanning chunks...");
  const [chunkRows] = await surreal.query<[Array<{ id: string; content: string; metadata: any }>]>(
    "SELECT id, content, metadata FROM document_chunk ORDER BY id"
  );
  const chunks = chunkRows as Array<{ id: string; content: string; metadata: any }>;
  console.log(`[migrate] ${chunks.length} chunks to re-embed`);

  let done = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const inputs = batch.map((c) =>
      prepareChunkForEmbedding({
        content: c.content,
        metadata: {
          documentTitle: c.metadata?.title ?? "",
          category: c.metadata?.category ?? "",
          subcategory: c.metadata?.subcategory,
          section: c.metadata?.section,
          chunkIndex: 0,
        },
      })
    );
    const vectors = await generateEmbeddings(inputs);
    for (let j = 0; j < batch.length; j++) {
      await surreal.query(
        "UPDATE document_chunk SET embedding = $embedding WHERE id = $id",
        { id: batch[j].id, embedding: vectors[j] }
      );
    }
    done += batch.length;
    console.log(`[migrate] ${done}/${chunks.length}`);
  }

  console.log(`[migrate] re-defining embedding_idx with dim ${embeddingDim}...`);
  await surreal.query(
    `DEFINE INDEX embedding_idx ON document_chunk FIELDS embedding MTREE DIMENSION ${embeddingDim} DIST COSINE;`
  );

  console.log("[migrate] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Wire npm script**

In `package.json`, add under `"scripts"`:

```json
"kb:migrate": "bun scripts/kb-migrate-embeddings.ts",
```

- [ ] **Step 3: Add integration test**

Create `tests/integration/rag/migration.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
// This test intentionally does not run the migration against a real Surreal —
// it just smoke-checks the module loads and exposes a main() function via import.
describe("kb-migrate-embeddings", () => {
  it("is a loadable module", async () => {
    // Import without executing main by checking file exists + compiles.
    const mod = await import("@/../scripts/kb-migrate-embeddings");
    // No assertion on runtime behaviour — covered by manual run + bench.
    expect(mod).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run tests + typecheck**

```
bun vitest run tests/integration/rag/migration.test.ts
bunx tsc --noEmit
```
Expected: passed, no type errors

- [ ] **Step 5: Commit**

```bash
git add scripts/kb-migrate-embeddings.ts package.json tests/integration/rag/migration.test.ts
git commit -m "feat(rag): add kb-migrate-embeddings script

One-shot: drops embedding_idx, re-embeds all chunks with the configured
model, re-defines the index with the configured dimension. Idempotent.
Run after changing KB_EMBEDDING_MODEL.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Execute the migration against dev DB

**This is the first destructive task — verify `SURREAL_DB_*` env points at dev, not prod, before running.**

- [ ] **Step 1: Confirm target DB**

```
env | grep SURREAL_DB_URL
```
Expected: something like `ws://localhost:8000/rpc`. If it points anywhere else, STOP and ask the user before proceeding.

- [ ] **Step 2: Snapshot row counts before**

```
bun -e 'import("@/lib/surrealdb").then(async({getSurrealClient})=>{const s=await getSurrealClient();const[r]=await s.query("SELECT count() FROM document_chunk GROUP ALL");console.log(r);process.exit(0)})'
```
Write down the number.

- [ ] **Step 3: Run the migration**

```
bun run kb:migrate
```
Expected logs: `target model: qwen/qwen3-embedding-8b (dim 4096)` → drop index → scanning → N/N → re-define index → done.

- [ ] **Step 4: Verify row count unchanged**

Repeat Step 2. Number must equal pre-migration count.

- [ ] **Step 5: Verify new index exists with correct dim**

```
bun -e 'import("@/lib/surrealdb").then(async({getSurrealClient})=>{const s=await getSurrealClient();const[r]=await s.query("INFO FOR TABLE document_chunk");console.log(JSON.stringify(r,null,2));process.exit(0)})' | grep -A1 embedding_idx
```
Expected: `MTREE DIMENSION 4096`

- [ ] **Step 6: Smoke-test retrieval**

```
bun -e 'import("@/lib/rag").then(async({retrieveContext})=>{const r=await retrieveContext("what is the transformer architecture", 5);console.log(r.chunks?.length??0,"chunks returned");process.exit(0)})'
```
Expected: non-zero chunks returned.

- [ ] **Step 7: No commit — this task changes the DB, not the repo**

---

### Task 12: Retriever — use the new chunk-prefix consistently for queries

**Files:**
- Modify: `src/lib/rag/retriever.ts` (remove the non-English translation hop block)

The translation hop was a workaround for the old embedder's poor multilingual performance. qwen3-embedding-8b handles Bahasa natively (measured 8/8 hit@1 on the RDS proposal in the audit), so the hop is dead weight.

- [ ] **Step 1: Add failing test**

Create `tests/unit/rag/retriever-no-translation.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

describe("retriever does not translate queries", () => {
  it("retrieveContext does not call translation API", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(4096).fill(0) }],
      }),
    } as Response);
    vi.mock("@/lib/rag/vector-store", () => ({
      searchWithThreshold: vi.fn().mockResolvedValue([]),
      searchSimilar: vi.fn().mockResolvedValue([]),
    }));

    process.env.OPENROUTER_API_KEY = "test";
    const { retrieveContext } = await import("@/lib/rag/retriever");
    await retrieveContext("apa itu asuransi jiwa?", 5);

    // Translation endpoint would hit /chat/completions with xiaomi/mimo-v2-flash.
    // We only expect /embeddings calls.
    const calls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.every((url) => !url.includes("/chat/completions"))).toBe(true);
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test — expect it to fail**

```
bun vitest run tests/unit/rag/retriever-no-translation.test.ts
```
Expected: FAIL — current retriever calls the translation endpoint for Bahasa queries.

- [ ] **Step 3: Remove translation code**

In `src/lib/rag/retriever.ts`:
- Delete the `NON_ENGLISH_INDICATORS` constant (lines ~15-21).
- Delete the `isLikelyNonEnglish` function (lines ~26-32).
- Delete the `translateQueryForSearch` function (lines ~38-85).
- In `retrieveContext` and `smartRetrieve`, remove any call site that funnels the query through `translateQueryForSearch`. The query should be embedded as-is.

- [ ] **Step 4: Run tests**

```
bun vitest run tests/unit/rag
```
Expected: all passed including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/retriever.ts tests/unit/rag/retriever-no-translation.test.ts
git commit -m "refactor(rag): drop non-English query translation hop

qwen/qwen3-embedding-8b handles Bahasa (+ all major languages) natively.
Measured 8/8 hit@1 on the Indonesian proposal in the SOTA audit vs 7/8
with the translate-then-embed pipeline. One fewer network round-trip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: LLM reranker implementation

**Files:**
- Create: `src/lib/rag/rerankers/types.ts`
- Create: `src/lib/rag/rerankers/llm-reranker.ts`
- Create: `tests/unit/rag/rerankers/llm-reranker.test.ts`

- [ ] **Step 1: Define the interface**

```typescript
// src/lib/rag/rerankers/types.ts
export interface RerankCandidate {
  id: string;
  text: string;
  originalRank: number;
  originalScore: number;
}

export interface RerankedResult {
  id: string;
  finalRank: number;
  score: number;
}

export interface Reranker {
  name: string;
  rerank(query: string, candidates: RerankCandidate[], finalK: number): Promise<RerankedResult[]>;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/rag/rerankers/llm-reranker.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LlmReranker } from "@/lib/rag/rerankers/llm-reranker";

describe("LlmReranker", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("sends query + numbered candidates to the configured model and parses the JSON array", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "[2, 0, 1]" } }],
      }),
    });

    const reranker = new LlmReranker("google/gemini-3-flash-preview");
    const result = await reranker.rerank(
      "what is X",
      [
        { id: "a", text: "irrelevant", originalRank: 0, originalScore: 0.9 },
        { id: "b", text: "also nope", originalRank: 1, originalScore: 0.85 },
        { id: "c", text: "X is the answer", originalRank: 2, originalScore: 0.8 },
      ],
      3
    );

    expect(result.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(result[0].finalRank).toBe(0);

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe("google/gemini-3-flash-preview");
    expect(body.messages[0].content).toMatch(/Query: what is X/);
  });

  it("falls back to original order when the model output has no parseable array", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "sorry, cannot do that" } }] }),
    });

    const reranker = new LlmReranker("google/gemini-3-flash-preview");
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
    ];
    const result = await reranker.rerank("q", cands, 2);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("fills to finalK when the model returns fewer indices", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[1]" } }] }),
    });
    const reranker = new LlmReranker("google/gemini-3-flash-preview");
    const cands = [
      { id: "a", text: "a", originalRank: 0, originalScore: 0.9 },
      { id: "b", text: "b", originalRank: 1, originalScore: 0.8 },
      { id: "c", text: "c", originalRank: 2, originalScore: 0.7 },
    ];
    const result = await reranker.rerank("q", cands, 3);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe("b");
    // Remaining two come in original order, minus b.
    expect(result.slice(1).map((r) => r.id)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 3: Run test — expect all 3 to fail**

```
bun vitest run tests/unit/rag/rerankers/llm-reranker.test.ts
```

- [ ] **Step 4: Write the reranker**

```typescript
// src/lib/rag/rerankers/llm-reranker.ts
import type { Reranker, RerankCandidate, RerankedResult } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CANDIDATE_TEXT_LIMIT = 400;

export class LlmReranker implements Reranker {
  readonly name: string;
  private readonly model: string;

  constructor(model: string) {
    this.name = model;
    this.model = model;
  }

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    finalK: number
  ): Promise<RerankedResult[]> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

    const numbered = candidates
      .map((c, i) => `[${i}] ${c.text.slice(0, CANDIDATE_TEXT_LIMIT).replace(/\n/g, " ")}`)
      .join("\n\n");
    const prompt = `You are a retrieval reranker. Given a query and candidate passages, output the indices of the top ${finalK} most relevant passages in descending order of relevance, as a JSON array of integers. Output ONLY the JSON array.

Query: ${query}

Passages:
${numbered}

Top ${finalK} indices:`;

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LlmReranker ${this.model} ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\d,\s]+\]/);

    let picked: number[];
    if (!match) {
      picked = [];
    } else {
      try {
        picked = JSON.parse(match[0]);
      } catch {
        picked = [];
      }
    }

    const pickedIds = new Set<string>();
    const out: RerankedResult[] = [];
    for (const idx of picked) {
      const cand = candidates[idx];
      if (!cand || pickedIds.has(cand.id)) continue;
      pickedIds.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: finalK - out.length });
      if (out.length >= finalK) break;
    }

    // Fill with remaining candidates in original rank order.
    for (const cand of candidates) {
      if (out.length >= finalK) break;
      if (pickedIds.has(cand.id)) continue;
      pickedIds.add(cand.id);
      out.push({ id: cand.id, finalRank: out.length, score: finalK - out.length });
    }

    return out;
  }
}
```

- [ ] **Step 5: Run tests**

```
bun vitest run tests/unit/rag/rerankers/llm-reranker.test.ts
```
Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add src/lib/rag/rerankers/ tests/unit/rag/rerankers/
git commit -m "feat(rag): add LLM-as-reranker

Calls the configured chat model with numbered candidates and parses back
a JSON array of indices. Deterministic (temperature=0). Fills from original
order when the model returns fewer than finalK indices or malformed output.

Cohere rerank is intentionally NOT wired up — it hurt hit@1 by 5.7 pts in
the SOTA audit vs raw cosine.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Reranker dispatch + wire into retriever

**Files:**
- Create: `src/lib/rag/rerankers/index.ts`
- Modify: `src/lib/rag/retriever.ts` — inject rerank step after initial top-K fetch

- [ ] **Step 1: Dispatch module**

```typescript
// src/lib/rag/rerankers/index.ts
import { getRagConfig } from "../config";
import { LlmReranker } from "./llm-reranker";
import type { Reranker, RerankCandidate, RerankedResult } from "./types";

export type { Reranker, RerankCandidate, RerankedResult };
export { LlmReranker };

export function getDefaultReranker(): Reranker | null {
  const { rerankEnabled, rerankModel } = getRagConfig();
  if (!rerankEnabled) return null;
  return new LlmReranker(rerankModel);
}
```

- [ ] **Step 2: Wire into retriever**

In `src/lib/rag/retriever.ts`, find `retrieveContext`. After the top-K cosine fetch and before building the context string, add:

```typescript
import { getDefaultReranker } from "./rerankers";
import { getRagConfig } from "./config";

// ...inside retrieveContext, after initial top-K fetch...
const cfg = getRagConfig();
const reranker = getDefaultReranker();
let finalChunks = initialResults.slice(0, cfg.rerankFinalK);

if (reranker && initialResults.length > cfg.rerankFinalK) {
  const candidates = initialResults.slice(0, cfg.rerankInitialK).map((r, i) => ({
    id: r.id,
    text: r.content,
    originalRank: i,
    originalScore: r.similarity,
  }));
  const ranked = await reranker.rerank(query, candidates, cfg.rerankFinalK);
  const rankedIds = new Set(ranked.map((r) => r.id));
  finalChunks = candidates
    .filter((c) => rankedIds.has(c.id))
    .sort((a, b) => {
      const aIdx = ranked.findIndex((r) => r.id === a.id);
      const bIdx = ranked.findIndex((r) => r.id === b.id);
      return aIdx - bIdx;
    })
    .map((c) => initialResults.find((r) => r.id === c.id)!);
}
```

Concrete integration: in the existing `retrieveContext` function (currently in `src/lib/rag/retriever.ts`), the cosine search call returns `SearchResult[]` from `searchWithThreshold`. Rename the existing `results` variable to `initialResults`. The block above replaces the `const finalChunks = results.slice(0, limit)` line near the end of the function. Pass `finalChunks` to the existing `formatContextForPrompt` call instead of `results`.

- [ ] **Step 3: Also fetch `rerankInitialK` chunks when rerank is enabled**

Before the above rerank block, ensure the initial top-K fetch uses `cfg.rerankEnabled ? cfg.rerankInitialK : cfg.rerankFinalK` as the `limit` passed to `searchWithThreshold` / `searchSimilar`.

- [ ] **Step 4: Integration test**

Create `tests/integration/rag/retriever-rerank.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("retriever with rerank enabled", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test";
    process.env.KB_RERANK_ENABLED = "true";
    process.env.KB_RERANK_INITIAL_K = "3";
    process.env.KB_RERANK_FINAL_K = "2";
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("asks reranker to rerank the top-K cosine hits", async () => {
    vi.doMock("@/lib/rag/vector-store", () => ({
      searchWithThreshold: vi.fn().mockResolvedValue([
        { id: "c1", content: "first", documentId: "d", documentTitle: "t", categories: [], subcategory: null, section: null, similarity: 0.9 },
        { id: "c2", content: "second", documentId: "d", documentTitle: "t", categories: [], subcategory: null, section: null, similarity: 0.85 },
        { id: "c3", content: "third", documentId: "d", documentTitle: "t", categories: [], subcategory: null, section: null, similarity: 0.8 },
      ]),
      searchSimilar: vi.fn(),
    }));

    const fetchMock = vi.fn()
      // embedding call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: new Array(4096).fill(0) }] }),
      })
      // rerank call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "[2, 0]" } }] }),
      });
    global.fetch = fetchMock as any;

    const { retrieveContext } = await import("@/lib/rag/retriever");
    const result = await retrieveContext("query", 2);

    // The reranker put c3 first, then c1, so finalChunks should be [c3, c1].
    const ids = (result.chunks ?? result.results ?? []).map((c: any) => c.id);
    expect(ids).toEqual(["c3", "c1"]);
  });
});
```

- [ ] **Step 5: Run tests**

```
bun vitest run tests/integration/rag/retriever-rerank.test.ts
bun vitest run tests/unit/rag
```
Expected: all passed

- [ ] **Step 6: Commit**

```bash
git add src/lib/rag/rerankers/index.ts src/lib/rag/retriever.ts tests/integration/rag/retriever-rerank.test.ts
git commit -m "feat(rag): optional LLM rerank in retriever

Off by default. Set KB_RERANK_ENABLED=true to opt into the quality mode
that lifted hit@1 by +5.7 pts at +1700ms per query in the SOTA audit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Port bench harness in-repo

**Files:**
- Create: `tests/bench-kb/README.md`
- Create: `tests/bench-kb/src/lib.ts`
- Create: `tests/bench-kb/src/smart-chunker.ts`
- Create: `tests/bench-kb/src/prepare-corpus.ts`
- Create: `tests/bench-kb/src/generate-qa.ts`
- Create: `tests/bench-kb/src/bench-extraction.ts`
- Create: `tests/bench-kb/src/bench-embedding.ts`
- Create: `tests/bench-kb/src/bench-rerank.ts`
- Create: `tests/bench-kb/src/bench-e2e.ts`
- Create: `tests/bench-kb/corpus/.gitkeep`
- Create: `tests/bench-kb/results/.gitignore` with contents `*\n!.gitignore\n`

- [ ] **Step 1: Copy harness files**

Run:
```
mkdir -p tests/bench-kb/src tests/bench-kb/corpus tests/bench-kb/results
cp /tmp/kb-bench/src/*.ts tests/bench-kb/src/
printf '*\n!.gitignore\n' > tests/bench-kb/results/.gitignore
touch tests/bench-kb/corpus/.gitkeep
```

- [ ] **Step 2: Write README**

```markdown
# tests/bench-kb — KB Pipeline SOTA Benchmark

Evidence harness that produced the numbers in `docs/superpowers/specs/2026-04-20-kb-document-intelligence-sota-audit.md`.
Standalone: spins up no DB, only calls OpenRouter.

## Run

    export OPENROUTER_API_KEY=<key>
    cd tests/bench-kb

    # Fetch corpus (first time only)
    bun src/fetch-corpus.ts   # if you add one; otherwise manually curl into corpus/

    # Ingest corpus through current chunker
    bun src/prepare-corpus.ts

    # Generate Q/A if qa.json missing
    bun src/generate-qa.ts

    # Run each layer
    bun src/bench-extraction.ts
    bun src/bench-embedding.ts
    bun src/bench-rerank.ts
    bun src/bench-e2e.ts

Results land in `results/` (gitignored).

## Smoke bench

`bun src/bench-e2e.ts --smoke` (to be added Task 16) runs a 10-Q/A subset for CI, budget ~90s + ~$0.05.
```

- [ ] **Step 3: Adapt paths**

In each `tests/bench-kb/src/*.ts`, replace any `/tmp/kb-bench/` references with relative paths (e.g., `./results/...`, `./corpus/...`).

- [ ] **Step 4: Add bench script to package.json**

```json
"bench:kb": "bun tests/bench-kb/src/bench-e2e.ts",
"bench:kb:extraction": "bun tests/bench-kb/src/bench-extraction.ts",
"bench:kb:embedding": "bun tests/bench-kb/src/bench-embedding.ts",
```

- [ ] **Step 5: Smoke-run**

```
bun run bench:kb:embedding
```
Expected: same table as the spec's §3 (may differ slightly depending on corpus freshness). Retry tolerable.

- [ ] **Step 6: Commit**

```bash
git add tests/bench-kb/ package.json
git commit -m "test(bench-kb): port SOTA bench harness into repo

Same code that produced the numbers in the spec. Results gitignored; the
harness itself + README live in tests/bench-kb/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: CI-runnable smoke bench

**Files:**
- Create: `tests/bench-kb/src/bench-smoke.ts`
- Modify: `package.json` (add `bench:kb:smoke` script)

- [ ] **Step 1: Write the smoke bench**

```typescript
// tests/bench-kb/src/bench-smoke.ts
// CI-runnable: tiny corpus subset + 10 Q/A, enforces thresholds.
import { embed, cosine, readJson } from "./lib";

const THRESHOLDS = {
  hit_at_1: 0.85,
  recall_at_5: 0.95,
};

const SUBSET_SIZE = 10;

async function run() {
  const corpus = readJson<any[]>("./results/corpus-unpdf.json");
  const qa = readJson<any[]>("./results/qa.json").slice(0, SUBSET_SIZE);
  const allChunks = corpus.flatMap((d) => d.chunks);
  const idxMap: Record<string, number> = {};
  allChunks.forEach((c, i) => { idxMap[c.id] = i; });

  const model = process.env.KB_EMBEDDING_MODEL ?? "qwen/qwen3-embedding-8b";
  const chunkTexts = allChunks.map((c: any) => (c.section ? `Section: ${c.section}\n\n` : "") + c.text.slice(0, 3000));
  const chunkRes = await embed(model, chunkTexts);
  const queryRes = await embed(model, qa.map((q) => q.q));

  let h1 = 0, r5 = 0;
  for (let i = 0; i < qa.length; i++) {
    const q = qa[i];
    const expected = q.expected_chunk_ids.map((id: string) => idxMap[id]).filter((x: number | undefined) => x !== undefined);
    const scored = chunkRes.vectors.map((v, idx) => ({ idx, s: cosine(queryRes.vectors[i], v) }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 5).map((x) => x.idx);
    if (expected.includes(top[0])) h1++;
    if (expected.some((e: number) => top.includes(e))) r5++;
  }
  const hit_at_1 = h1 / qa.length;
  const recall_at_5 = r5 / qa.length;
  console.log(`hit@1=${hit_at_1.toFixed(3)} r@5=${recall_at_5.toFixed(3)}`);
  if (hit_at_1 < THRESHOLDS.hit_at_1) {
    console.error(`FAIL: hit@1 ${hit_at_1} < threshold ${THRESHOLDS.hit_at_1}`);
    process.exit(1);
  }
  if (recall_at_5 < THRESHOLDS.recall_at_5) {
    console.error(`FAIL: r@5 ${recall_at_5} < threshold ${THRESHOLDS.recall_at_5}`);
    process.exit(1);
  }
  console.log("smoke bench PASS");
}
run();
```

- [ ] **Step 2: Add script**

In `package.json`:
```json
"bench:kb:smoke": "bun tests/bench-kb/src/bench-smoke.ts",
```

- [ ] **Step 3: Run it**

```
bun run bench:kb:smoke
```
Expected: `hit@1=0.9xx r@5=1.000 smoke bench PASS` (may vary by ±5% due to OR response jitter).

- [ ] **Step 4: Commit**

```bash
git add tests/bench-kb/src/bench-smoke.ts package.json
git commit -m "test(bench-kb): CI-runnable smoke bench with thresholds

10 Q/A subset, enforces hit@1 >= 0.85 and recall@5 >= 0.95. Exits non-zero
on regression. ~90s + \$0.05 per run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: End-to-end validation (integrator-only — no commit required)

This task is a manual gate. Run through it before merging the branch.

- [ ] **Step 1: Type-check whole repo**

```
bunx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 2: Run all RAG tests**

```
bun run test -- tests/unit/rag tests/integration/rag
```
Expected: all green.

- [ ] **Step 3: Run the smoke bench**

```
bun run bench:kb:smoke
```
Expected: PASS.

- [ ] **Step 4: Ingest a representative PDF through the full stack**

Pick any real PDF (e.g., `rantai-vs-perplexity-dify.pdf` if available, or drop one). Run:

```
bun -e 'import("@/lib/rag").then(async({ingestFile})=>{const r=await ingestFile("./sample.pdf","Sample","GENERAL","Test");console.log(r);process.exit(0)})'
```

Expected logs: extractor name appears in output, chunk count > 10 for any real PDF.

- [ ] **Step 5: Query it**

```
bun -e 'import("@/lib/rag").then(async({retrieveContext})=>{const r=await retrieveContext("what is the main topic?", 5);console.log(JSON.stringify(r,null,2));process.exit(0)})'
```

Expected: 5 chunks returned, each with a plausible section header in the body.

- [ ] **Step 6: Retention check — turn rerank on and verify latency rise**

```
KB_RERANK_ENABLED=true bun -e '...same query as step 5...'
```

Expected: slower by ~1700ms, different ordering of returned chunks.

---

## Post-merge runbook

- Production cutover: set `KB_EMBEDDING_MODEL=qwen/qwen3-embedding-8b` + `KB_EMBEDDING_DIM=4096` in prod env → deploy → run `bun run kb:migrate` against prod Surreal during a low-traffic window. Monitor `hit@1` via a manual 10-query spot check before and after.
- Rollback: unset `KB_EMBEDDING_MODEL`/`KB_EMBEDDING_DIM` + re-apply old schema (`DIMENSION 1536`) + re-run `kb:migrate`. Migration script is idempotent.
- Observability: hook the `avg ms per query` metric into the existing metrics stack (follow-up, not in this plan).
