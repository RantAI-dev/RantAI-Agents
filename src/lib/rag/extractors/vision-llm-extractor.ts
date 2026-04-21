import { PDFDocument } from "pdf-lib";
import { splitPdfByPageCount, getPdfPageCount } from "./pdf-splitter";
import type { Extractor, ExtractionResult } from "./types";

/**
 * Vision-LLM PDF extractor. Sends the PDF to OpenRouter via the `file` content
 * type and asks for clean, compact Markdown preserving headings, tables, math,
 * and code. Works with any OpenRouter model that supports PDF input natively
 * (Gemini, Claude) and — via OpenRouter's image conversion — most other vision
 * models (at higher token cost).
 *
 * For PDFs exceeding `segmentPages` (default 25), splits into page-segments and
 * extracts each segment concurrently via Promise.all. This dodges the vision
 * model's single-call output-token budget which otherwise truncates at ~2-8%
 * of a 100-page doc.
 *
 * Prompt intentionally asks for COMPACT tables (single-space padding). This
 * prevents the padding-bloat failure mode observed with gemini-2.5-flash and
 * gemini-2.5-flash-lite on table-heavy PDFs (400K+ char output for a 4-page doc).
 */
export class VisionLlmExtractor implements Extractor {
  readonly name: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly segmentPages: number;
  private readonly segmentConcurrency: number;

  constructor(
    model: string,
    opts: { maxTokens?: number; segmentPages?: number; segmentConcurrency?: number } = {}
  ) {
    this.name = model;
    this.model = model;
    this.maxTokens = opts.maxTokens ?? 16000;
    this.segmentPages = opts.segmentPages ?? 25;
    this.segmentConcurrency = opts.segmentConcurrency ?? 4;
  }

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const pageCount = await getPdfPageCount(pdfBuffer).catch(() => 0);

    // Small docs (or unreadable — treat as single call).
    if (pageCount === 0 || pageCount <= this.segmentPages) {
      return this.extractSingleCall(pdfBuffer, "document.pdf", pageCount);
    }

    // Large docs — split + parallel.
    const segments = await splitPdfByPageCount(pdfBuffer, this.segmentPages);
    const tStart = Date.now();

    // Run up to segmentConcurrency segments in parallel, preserving order.
    const results: ExtractionResult[] = new Array(segments.length);
    let nextIdx = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const idx = nextIdx++;
        if (idx >= segments.length) return;
        try {
          results[idx] = await this.extractSingleCall(
            segments[idx],
            `document-segment-${idx + 1}-of-${segments.length}.pdf`,
            this.segmentPages
          );
        } catch (err) {
          throw new Error(
            `[VisionLlmExtractor segment ${idx + 1}/${segments.length}] ${(err as Error).message}`
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(this.segmentConcurrency, segments.length) }, () => worker())
    );

    const concatText = results.map((r) => r.text).join("\n\n");
    const totalPromptTokens = results.reduce((s, r) => s + (r.usage?.prompt_tokens ?? 0), 0);
    const totalCompletionTokens = results.reduce(
      (s, r) => s + (r.usage?.completion_tokens ?? 0),
      0
    );
    const totalCost = results.reduce((s, r) => s + (r.usage?.cost ?? 0), 0);

    return {
      text: concatText,
      ms: Date.now() - tStart,
      pages: pageCount,
      model: `${this.model} (${segments.length} segments × ${this.segmentPages}pg)`,
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        cost: totalCost,
      },
    };
  }

  private async extractSingleCall(
    pdfBuffer: Buffer,
    filename: string,
    pages: number
  ): Promise<ExtractionResult> {
    const { getRagConfig, resolveApiKey } = await import("../config");
    const cfg = getRagConfig();
    const apiKey = resolveApiKey(cfg.extractVisionApiKey);
    if (!apiKey) throw new Error("No API key configured: set KB_EXTRACT_VISION_API_KEY or OPENROUTER_API_KEY");

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
                filename,
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
    const res = await fetch(cfg.extractVisionBaseUrl, {
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
      throw new Error(
        `VisionLlmExtractor ${this.model} ${res.status}: ${err.slice(0, 300)}`
      );
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text, ms, model: this.model, pages: pages || undefined, usage: data.usage };
  }
}

const EXTRACTION_PROMPT = `Extract the full textual content of this PDF as clean, COMPACT Markdown.

Strict rules:
- Headings: # / ## / ### matching document hierarchy
- Lists: "- " or "1. " with ONE space
- Tables: standard Markdown pipes with a single space of padding on each side of cell content. DO NOT pad cells with many spaces or align columns — compact tables only.
- Inline math: $...$ ; block math: $$...$$
- Code blocks: fenced with triple backticks

Do not summarize. Do not omit content. Do not add commentary. Output ONLY the extracted Markdown.`;
