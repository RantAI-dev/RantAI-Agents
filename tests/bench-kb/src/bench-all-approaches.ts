// Comprehensive bench comparing all extraction approaches on the big dataset.
//
// Tests 6 approaches × (30 resumes + 10 Indonesian scans) with normalized
// phrase-coverage scoring. Normalized matching strips non-alphanumeric chars
// so markdown/bullet restructuring doesn't falsely penalize an approach.
//
// Approaches:
//   unpdf      — text layer only (baseline)
//   mineru     — MinerU sidecar alone
//   hybrid     — Pattern 2 merge (already shipped)
//   router     — unpdf first; if heuristic says needs OCR, fall through to MinerU
//   nano-ctx   — Approach D: gpt-4.1-nano(image + unpdf as context), always
//   router+D   — router + nano-ctx on fall-through (cloud combined)
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { UnpdfExtractor } from "@/lib/rag/extractors/unpdf-extractor";
import { MineruExtractor } from "@/lib/rag/extractors/mineru-extractor";
import { HybridExtractor } from "@/lib/rag/extractors/hybrid-extractor";

const BENCH_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(BENCH_ROOT, "results/all-approaches");
const MINERU_URL = process.env.KB_EXTRACT_MINERU_BASE_URL || "http://localhost:8100";
const KEY = process.env.OPENROUTER_API_KEY || "";
if (!KEY) { console.error("set OPENROUTER_API_KEY"); process.exit(1); }

interface Doc {
  id: string;
  label: string;
  category: string;
  corpus: "resume" | "indo";
  pdf: Buffer;
  groundTruth: string[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreNormalized(text: string, gt: string[]): { matched: number; total: number } {
  const n = norm(text);
  const matched = gt.filter(p => n.includes(norm(p))).length;
  return { matched, total: gt.length };
}

function phrasesFromText(gt: string, n: number = 10, words: number = 6): string[] {
  const toks = gt.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (toks.length < words * 2) return [];
  const step = Math.max(1, Math.floor((toks.length - words) / n));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(toks.slice(i * step, i * step + words).join(" "));
  return out;
}

async function loadResumes(max: number): Promise<Doc[]> {
  const gt = JSON.parse(fs.readFileSync(path.join(BENCH_ROOT, "corpus/resume/ground_truth.json"), "utf-8"));
  const base = path.join(BENCH_ROOT, "corpus/resume/data/data");
  const cats = ["ACCOUNTANT", "FINANCE", "HEALTHCARE", "ENGINEERING", "TEACHER", "DESIGNER", "SALES", "ADVOCATE", "BPO", "CONSULTANT"];
  const out: Doc[] = [];
  for (const cat of cats) {
    const dir = path.join(base, cat);
    if (!fs.existsSync(dir)) continue;
    const pdfs = fs.readdirSync(dir).filter(f => f.endsWith(".pdf")).sort();
    let taken = 0;
    for (const pdfFile of pdfs) {
      if (taken >= Math.ceil(max / cats.length)) break;
      const id = pdfFile.replace(/\.pdf$/, "");
      const gtText = gt[id];
      if (!gtText || gtText.length < 500) continue;
      const phrases = phrasesFromText(gtText);
      if (phrases.length === 0) continue;
      out.push({
        id,
        label: `${cat}/${id}`,
        category: cat,
        corpus: "resume",
        pdf: fs.readFileSync(path.join(dir, pdfFile)),
        groundTruth: phrases,
      });
      taken++;
      if (out.length >= max) return out;
    }
  }
  return out;
}

async function loadIndo(max: number): Promise<Doc[]> {
  const base = path.join(BENCH_ROOT, "corpus/indo/IMG_OCR_IND_CN");
  const cats = ["PAPERS", "BOOK CONTENTS OR COVERS", "CONTRACTS", "FORMS", "NEWSPAPERS", "TRADE DOCUMENTS", "IDENTITY CARDS", "BILLS"];
  const out: Doc[] = [];
  for (const cat of cats) {
    const dir = path.join(base, cat);
    if (!fs.existsSync(dir)) continue;
    const jpgs = fs.readdirSync(dir).filter(f => f.endsWith(".jpg")).sort();
    let taken = 0;
    for (const jpg of jpgs) {
      if (taken >= Math.ceil(max / cats.length)) break;
      const js = jpg.replace(/\.jpg$/, ".json");
      const jsonPath = path.join(dir, js);
      if (!fs.existsSync(jsonPath)) continue;
      const gt = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      const labels = (gt.shapes ?? []).map((s: any) => (s.label ?? "").trim()).filter((l: string) => l && l !== "###" && l !== "*");
      if (labels.length < 5) continue;
      // Wrap jpg in a 1-page PDF
      try {
        const jpgBytes = fs.readFileSync(path.join(dir, jpg));
        if (!(jpgBytes[0] === 0xff && jpgBytes[1] === 0xd8)) continue;
        const doc = await PDFDocument.create();
        const img = await doc.embedJpg(jpgBytes);
        const page = doc.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        out.push({
          id: jpg.replace(/\.jpg$/, ""),
          label: `${cat}/${jpg.replace(/\.jpg$/, "")}`,
          category: cat,
          corpus: "indo",
          pdf: Buffer.from(await doc.save()),
          groundTruth: labels as string[],
        });
        taken++;
        if (out.length >= max) return out;
      } catch { continue; }
    }
  }
  return out;
}

// Heuristic: should we skip OCR and trust unpdf alone?
function shouldSkipOcr(unpdfText: string, pageCount: number = 1): boolean {
  if (!unpdfText || unpdfText.length < 300 * pageCount) return false;
  const lines = unpdfText.split("\n");
  const columnarLines = lines.filter(l => {
    const trim = l.trim();
    if (trim.length < 10) return false;
    return (trim.match(/\S\s{3,}\S/g) || []).length >= 2;
  });
  if (columnarLines.length > 5) return false;
  const currency = unpdfText.match(/\$\s?[\d,]+(\.\d+)?/g) || [];
  if (currency.length > 10) return false;
  return true;
}

// Render first page of PDF to PNG
function renderFirstPage(pdfBuf: Buffer, dpi: number = 300): Buffer {
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ba-"));
  fs.writeFileSync(path.join(tmp, "in.pdf"), pdfBuf);
  const out = path.join(tmp, "page.png");
  spawnSync("gs", ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m",
    `-r${dpi}`, "-dFirstPage=1", "-dLastPage=1",
    `-sOutputFile=${out}`, path.join(tmp, "in.pdf")]);
  const buf = fs.readFileSync(out);
  fs.rmSync(tmp, { recursive: true, force: true });
  return buf;
}

async function callNanoWithContext(png: Buffer, unpdfText: string | null, maxTokens: number = 4000): Promise<string> {
  const base64 = png.toString("base64");
  const SYS = "You are a document extraction system. Output clean, compact Markdown. Preserve headings, tables, lists, and formulas. Do not summarize.";
  const prompt = unpdfText
    ? `Extract the full content of this page as Markdown.\n\nFor character fidelity (exact emails, Unicode names, numbers, dates) use this plain text layer:\n"""\n${unpdfText.slice(0, 16000)}\n"""\n\nFrom the image, detect and preserve visual STRUCTURE: headings, table columns, bullet lists, reading order. Output ONLY Markdown.`
    : `Extract the full content of this page as Markdown. Preserve headings, tables, lists. Output ONLY Markdown.`;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4.1-nano",
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
          { type: "text", text: prompt },
        ]},
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`nano ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

interface Row {
  approach: string;
  doc: string;
  corpus: string;
  category: string;
  ms: number;
  chars: number;
  matched: number;
  total: number;
  tables: number;
  error?: string;
}

async function runApproach(name: string, doc: Doc, fn: () => Promise<{ text: string; ms: number }>): Promise<Row> {
  try {
    const t0 = Date.now();
    const r = await fn();
    const wall = Date.now() - t0;
    const s = scoreNormalized(r.text, doc.groundTruth);
    const tables = (r.text.match(/^\s*\|.*\|.*\|/gm) || []).length + (r.text.match(/<tr[^>]*>/gi) || []).length;
    fs.writeFileSync(
      path.join(OUT_DIR, `${doc.label.replace(/[^\w]/g, "_")}__${name}.txt`),
      r.text,
    );
    return { approach: name, doc: doc.label, corpus: doc.corpus, category: doc.category, ms: wall, chars: r.text.length, ...s, tables };
  } catch (err) {
    return { approach: name, doc: doc.label, corpus: doc.corpus, category: doc.category, ms: 0, chars: 0, matched: 0, total: doc.groundTruth.length, tables: 0, error: (err as Error).message.slice(0, 150) };
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const N_RESUME = Number(process.env.N_RESUME || 30);
  const N_INDO = Number(process.env.N_INDO || 10);
  const LOCAL_ONLY = process.env.LOCAL_ONLY === "1";

  if (LOCAL_ONLY) console.log(`LOCAL_ONLY=1 — skipping cloud approaches (nano-ctx, router+D)`);
  console.log(`Loading ${N_RESUME} resumes + ${N_INDO} Indonesian samples...`);
  const resumes = await loadResumes(N_RESUME);
  const indo = await loadIndo(N_INDO);
  const docs = [...resumes, ...indo];
  console.log(`Loaded ${docs.length} documents (${resumes.length} resume / ${indo.length} indo)\n`);

  const unpdf = new UnpdfExtractor();
  const mineru = new MineruExtractor(MINERU_URL);
  const hybrid = new HybridExtractor(mineru, unpdf);

  const rows: Row[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    console.log(`[${i+1}/${docs.length}] ${doc.label} (${doc.groundTruth.length} gt)`);

    // 1. unpdf alone
    const unpdfResult = await runApproach("unpdf", doc, () => unpdf.extract(doc.pdf));
    rows.push(unpdfResult);

    // 2. mineru alone
    const mineruResult = await runApproach("mineru", doc, () => mineru.extract(doc.pdf));
    rows.push(mineruResult);

    // 3. hybrid (current shipped)
    rows.push(await runApproach("hybrid", doc, () => hybrid.extract(doc.pdf)));

    // 4. router: unpdf first, MinerU if needed
    rows.push(await runApproach("router", doc, async () => {
      const t0 = Date.now();
      const u = await unpdf.extract(doc.pdf);
      if (shouldSkipOcr(u.text, 1)) return u;
      const m = await mineru.extract(doc.pdf);
      return { text: m.text, ms: Date.now() - t0 };
    }));

    // 5. nano-ctx (Approach D, cloud-mode, always) — skipped under LOCAL_ONLY
    if (!LOCAL_ONLY) {
      rows.push(await runApproach("nano-ctx", doc, async () => {
        const t0 = Date.now();
        const u = await unpdf.extract(doc.pdf);
        const png = renderFirstPage(doc.pdf);
        const text = await callNanoWithContext(png, u.text || null);
        return { text, ms: Date.now() - t0 };
      }));
    }

    // 6. router+D: unpdf first, nano-ctx on fall-through — skipped under LOCAL_ONLY
    if (!LOCAL_ONLY) {
      rows.push(await runApproach("router+D", doc, async () => {
        const t0 = Date.now();
        const u = await unpdf.extract(doc.pdf);
        if (shouldSkipOcr(u.text, 1)) return u;
        const png = renderFirstPage(doc.pdf);
        const text = await callNanoWithContext(png, u.text || null);
        return { text, ms: Date.now() - t0 };
      }));
    }

    const r = rows.filter(x => x.doc === doc.label);
    for (const x of r) {
      const pct = x.total ? Math.round(x.matched / x.total * 100) : 0;
      console.log(`    ${x.approach.padEnd(10)} ${String(x.ms).padStart(6)}ms ${String(x.chars).padStart(5)}ch t=${String(x.tables).padStart(3)} cov=${x.matched}/${x.total} (${pct}%)${x.error ? " FAIL" : ""}`);
    }
  }

  // Aggregate
  console.log("\n═══ AGGREGATE (by approach, all docs) ═══");
  const approaches = ["unpdf", "mineru", "hybrid", "router", "nano-ctx", "router+D"];
  console.log(`${"Approach".padEnd(12)} | ${"AvgLat(ms)".padEnd(10)} | ${"AvgChars".padEnd(8)} | ${"TotTables".padEnd(9)} | ${"Coverage".padEnd(18)}`);
  console.log("-".repeat(72));
  for (const a of approaches) {
    const rs = rows.filter(r => r.approach === a && !r.error);
    if (rs.length === 0) { console.log(`${a.padEnd(12)} | no results`); continue; }
    const avgLat = Math.round(rs.reduce((s, r) => s + r.ms, 0) / rs.length);
    const avgChars = Math.round(rs.reduce((s, r) => s + r.chars, 0) / rs.length);
    const totTables = rs.reduce((s, r) => s + r.tables, 0);
    const totM = rs.reduce((s, r) => s + r.matched, 0);
    const totT = rs.reduce((s, r) => s + r.total, 0);
    const pct = totT ? Math.round(totM / totT * 100) : 0;
    console.log(`${a.padEnd(12)} | ${String(avgLat).padEnd(10)} | ${String(avgChars).padEnd(8)} | ${String(totTables).padEnd(9)} | ${`${totM}/${totT} (${pct}%)`.padEnd(18)}`);
  }

  // By corpus
  console.log("\n═══ AGGREGATE (by corpus) ═══");
  for (const corpus of ["resume", "indo"]) {
    console.log(`\n--- ${corpus} ---`);
    console.log(`${"Approach".padEnd(12)} | ${"AvgLat(ms)".padEnd(10)} | ${"Coverage".padEnd(18)} | ${"AvgTables".padEnd(9)}`);
    console.log("-".repeat(60));
    for (const a of approaches) {
      const rs = rows.filter(r => r.approach === a && r.corpus === corpus && !r.error);
      if (rs.length === 0) continue;
      const avgLat = Math.round(rs.reduce((s, r) => s + r.ms, 0) / rs.length);
      const avgTables = (rs.reduce((s, r) => s + r.tables, 0) / rs.length).toFixed(1);
      const totM = rs.reduce((s, r) => s + r.matched, 0);
      const totT = rs.reduce((s, r) => s + r.total, 0);
      const pct = totT ? Math.round(totM / totT * 100) : 0;
      console.log(`${a.padEnd(12)} | ${String(avgLat).padEnd(10)} | ${`${totM}/${totT} (${pct}%)`.padEnd(18)} | ${avgTables.padEnd(9)}`);
    }
  }

  // CSV
  const csv = ["approach,doc,corpus,category,ms,chars,tables,matched,total,error"];
  for (const r of rows) csv.push([r.approach, r.doc, r.corpus, r.category, r.ms, r.chars, r.tables, r.matched, r.total, r.error ?? ""].join(","));
  fs.writeFileSync(path.join(OUT_DIR, "summary.csv"), csv.join("\n"));
  console.log(`\n✅ ${path.join(OUT_DIR, "summary.csv")}`);
}

main().catch(e => { console.error(e); process.exit(1); });
