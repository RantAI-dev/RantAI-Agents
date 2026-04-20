import * as fs from "node:fs";
import * as path from "node:path";

const OPENROUTER = "https://openrouter.ai/api/v1";
export const API_KEY = process.env.OPENROUTER_API_KEY || "";
function needKey() { if (!API_KEY) throw new Error("OPENROUTER_API_KEY not set"); }

export type ChatOut = { text: string; ms: number; usage?: any; raw?: any };

export async function chat(model: string, messages: any[], maxTokens = 4000): Promise<ChatOut> {
  const t0 = Date.now();
  const res = await fetch(`${OPENROUTER}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0 }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`chat ${model} ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as any;
  return { text: data.choices?.[0]?.message?.content ?? "", ms, usage: data.usage, raw: data };
}

export async function embed(model: string, input: string | string[]): Promise<{ vectors: number[][]; dim: number; ms: number; usage?: any }> {
  const t0 = Date.now();
  const res = await fetch(`${OPENROUTER}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`embed ${model} ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as any;
  const vectors = data.data.map((d: any) => d.embedding);
  return { vectors, dim: vectors[0].length, ms, usage: data.usage };
}

export async function rerank(model: string, query: string, documents: string[]): Promise<{ ranked: Array<{ index: number; score: number }>; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${OPENROUTER}/rerank`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, query, documents }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`rerank ${model} ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json() as any;
  const ranked = data.results.map((r: any) => ({ index: r.index, score: r.relevance_score }));
  return { ranked, ms };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Resolve paths relative to the bench-kb root (two levels up from this file)
// so scripts work whether invoked from repo root or tests/bench-kb.
const BENCH_ROOT = path.resolve(import.meta.dirname, "..");
export function benchPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  if (p.startsWith("./")) return path.resolve(BENCH_ROOT, p.slice(2));
  return path.resolve(BENCH_ROOT, p);
}

export function writeJson(p: string, data: any) {
  const abs = benchPath(p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data, null, 2));
}

export function readJson<T>(p: string): T { return JSON.parse(fs.readFileSync(benchPath(p), "utf-8")); }

export function pdfToBase64(p: string): string {
  return fs.readFileSync(benchPath(p)).toString("base64");
}

export async function extractWithUnpdf(pdfPath: string): Promise<{ text: string; ms: number; pages: number }> {
  pdfPath = benchPath(pdfPath);
  const t0 = Date.now();
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buf = fs.readFileSync(pdfPath);
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join("\n") : text, ms: Date.now() - t0, pages: totalPages };
}

// Vision extraction: send PDF as file attachment (works for Gemini, Claude). Fall back to raw content.
export async function extractWithVision(model: string, pdfPath: string, maxTokens = 8000): Promise<ChatOut & { method: string }> {
  const base64 = pdfToBase64(pdfPath);
  const filename = path.basename(pdfPath);
  const prompt = "Extract the full textual content of this PDF as clean Markdown. Preserve: headings (use #/##/###), bullet lists, numbered lists, tables (as Markdown tables), and code/formula blocks. Do not summarize, do not omit content, do not add commentary. Output ONLY the extracted markdown.";

  // Try OpenRouter's file content type
  const messages = [{
    role: "user",
    content: [
      { type: "file", file: { filename, file_data: `data:application/pdf;base64,${base64}` } },
      { type: "text", text: prompt },
    ],
  }];

  try {
    const out = await chat(model, messages, maxTokens);
    return { ...out, method: "file" };
  } catch (e: any) {
    // Fall back to image conversion (single first page preview)
    throw e;
  }
}

export function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
