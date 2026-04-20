// Cost-optimized extraction bench. Focuses on <$0.001/page candidates with native or OR-converted PDF.
// Revised prompt asks for COMPACT output (no padded tables) to fix the gemini-2.5-flash-lite bloat issue.
import { chat, writeJson, sleep } from "./lib";
import * as fs from "node:fs";
import * as path from "node:path";

const DOCS = [
  { id: "attention", path: "./corpus/attention.pdf" },
  { id: "apple10k", path: "./corpus/apple-10k-excerpt.pdf" },
];

// Candidates selected for cost-per-page. All support vision; most support PDF via OpenRouter pipeline.
const CANDIDATES = [
  // Dirt cheap, image-heavy price-per-million
  "amazon/nova-lite-v1",               // $0.06 in / $0.24 out
  "openai/gpt-5-nano",                 // $0.05 in / $0.40 out
  "openai/gpt-4.1-nano",               // $0.10 in / $0.40 out
  "bytedance-seed/seed-1.6-flash",     // $0.075 in / $0.30 out
  // Mid cheap
  "google/gemini-2.5-flash-lite",      // $0.10 in / $0.40 out — re-test with compact prompt
  "qwen/qwen3-vl-8b-instruct",         // $0.08 in / $0.50 out (already tested, for comparison)
  "x-ai/grok-4-fast",                  // $0.20 in / $0.50 out — fastest so far
  "google/gemini-2.5-flash",           // $0.30 in / $2.50 out — sanity check
  // Current new-SOTA baseline
  "google/gemini-3-flash-preview",     // $0.50 in / $3 out — reference
];

const COMPACT_PROMPT = `Extract the full textual content of this PDF as clean, COMPACT Markdown.

Strict rules:
- Headings: # / ## / ### matching document hierarchy
- Lists: \`- \` or \`1. \` with ONE space
- Tables: standard Markdown pipes with ONE space of padding on each side of cell content. DO NOT pad cells with more than one space — no aligned columns.
- Inline math: \`$...$\` ; block math: \`$$...$$\`
- Code blocks: fenced with backticks

Do not summarize. Do not omit content. Do not add commentary. Output ONLY the extracted Markdown.`;

function outPath(doc: string, model: string) {
  return `./results/extraction-cheap/${doc}/${model.replace(/\//g, "_")}.json`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms: ${label}`)), ms)),
  ]);
}

async function extract(model: string, pdfPath: string): Promise<any> {
  const base64 = fs.readFileSync(pdfPath).toString("base64");
  const messages = [{
    role: "user",
    content: [
      { type: "file", file: { filename: path.basename(pdfPath), file_data: `data:application/pdf;base64,${base64}` } },
      { type: "text", text: COMPACT_PROMPT },
    ],
  }];
  return await chat(model, messages, 16000);
}

async function run() {
  const results: any[] = [];
  for (const doc of DOCS) {
    console.log(`\n=== ${doc.id} ===`);
    for (const model of CANDIDATES) {
      const p = outPath(doc.id, model);
      if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, "utf-8"));
        console.log(`  ${model}: (cached) ${d.ms}ms, ${d.text.length} chars`);
        continue;
      }
      try {
        const r = await withTimeout(extract(model, doc.path), 90000, model);
        const cost = r.usage?.cost ?? 0;
        console.log(`  ${model}: ${r.ms}ms, ${r.text.length} chars, in/out=${r.usage?.prompt_tokens}/${r.usage?.completion_tokens}, $${cost.toFixed(6)}`);
        writeJson(p, { text: r.text, ms: r.ms, usage: r.usage });
        results.push({ doc: doc.id, model, ms: r.ms, chars: r.text.length, usage: r.usage, ok: true });
        await sleep(300);
      } catch (e: any) {
        console.log(`  ${model} FAIL: ${e.message.slice(0, 200)}`);
        results.push({ doc: doc.id, model, ok: false, err: e.message.slice(0, 300) });
      }
    }
  }
  writeJson("./results/extraction-cheap/summary.json", results);
  console.log("\n=== cheap bench done ===");
}

run().catch(e => { console.error(e); process.exit(1); });
