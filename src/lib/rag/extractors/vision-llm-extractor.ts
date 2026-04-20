import type { Extractor, ExtractionResult } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Vision-LLM PDF extractor. Sends the PDF to OpenRouter via the `file` content
 * type and asks for clean, compact Markdown preserving headings, tables, math,
 * and code. Works with any OpenRouter model that supports PDF input natively
 * (Gemini, Claude) and — via OpenRouter's image conversion — most other vision
 * models (at higher token cost).
 *
 * Prompt intentionally asks for COMPACT tables (single-space padding). This
 * prevents the padding-bloat failure mode observed with gemini-2.5-flash and
 * gemini-2.5-flash-lite on table-heavy PDFs (400K+ char output for a 4-page doc).
 */
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
      throw new Error(
        `VisionLlmExtractor ${this.model} ${res.status}: ${err.slice(0, 300)}`
      );
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { text, ms, model: this.model, usage: data.usage };
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
