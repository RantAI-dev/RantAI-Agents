import { extractWithUnpdf, extractWithVision, writeJson, sleep } from "./lib";
import * as fs from "node:fs";

const DOCS = [
  { id: "attention", path: "./corpus/attention.pdf", note: "arxiv paper" },
  { id: "apple10k", path: "./corpus/apple-10k-excerpt.pdf", note: "financial tables" },
];

const VISION_MODELS = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.1-flash-lite-preview",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.6",
  "qwen/qwen3-vl-8b-instruct",
  "qwen/qwen3-vl-32b-instruct",
  "qwen/qwen3-vl-235b-a22b-instruct",
  "mistralai/pixtral-large-2411",
  "openai/gpt-4o-mini",
  "openai/gpt-5-mini",
  "z-ai/glm-4.6v",
  "x-ai/grok-4-fast",
];

function outPath(doc: string, model: string) {
  return `./results/extraction/${doc}/${model.replace(/\//g, "_")}.json`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms: ${label}`)), ms)),
  ]);
}

async function run() {
  const results: any[] = [];
  for (const doc of DOCS) {
    console.log(`\n=== ${doc.id} ===`);

    const uPath = outPath(doc.id, "unpdf");
    if (!fs.existsSync(uPath)) {
      try {
        const u = await extractWithUnpdf(doc.path);
        console.log(`  unpdf: ${u.ms}ms, ${u.text.length} chars, ${u.pages} pages`);
        writeJson(uPath, { text: u.text, ms: u.ms, pages: u.pages });
        results.push({ doc: doc.id, model: "unpdf", ms: u.ms, chars: u.text.length, ok: true });
      } catch (e: any) {
        console.log(`  unpdf FAIL: ${e.message}`);
      }
    } else {
      const data = JSON.parse(fs.readFileSync(uPath, "utf-8"));
      console.log(`  unpdf: (cached) ${data.ms}ms, ${data.text.length} chars`);
    }

    for (const model of VISION_MODELS) {
      const p = outPath(doc.id, model);
      if (fs.existsSync(p)) {
        const d = JSON.parse(fs.readFileSync(p, "utf-8"));
        console.log(`  ${model}: (cached) ${d.ms}ms, ${d.text.length} chars`);
        continue;
      }
      try {
        const v = await withTimeout(extractWithVision(model, doc.path, 16000), 90000, model);
        console.log(`  ${model}: ${v.ms}ms, ${v.text.length} chars, in/out=${v.usage?.prompt_tokens}/${v.usage?.completion_tokens}`);
        results.push({ doc: doc.id, model, ms: v.ms, chars: v.text.length, usage: v.usage, ok: true });
        writeJson(p, { text: v.text, ms: v.ms, usage: v.usage });
        await sleep(300);
      } catch (e: any) {
        console.log(`  ${model} FAIL: ${e.message.slice(0, 200)}`);
        results.push({ doc: doc.id, model, ok: false, err: e.message.slice(0, 300) });
        writeJson(p + ".err", { err: e.message });
      }
    }
  }
  writeJson("./results/extraction/summary.json", results);
  console.log("\n=== DONE ===");
}

run().catch(e => { console.error(e); process.exit(1); });
