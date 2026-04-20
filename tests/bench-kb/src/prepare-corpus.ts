// Turn raw corpus into chunked knowledge base using SmartChunker.
// Uses unpdf for PDFs (baseline). Will re-run with SOTA extraction later.
import * as fs from "node:fs";
import * as path from "node:path";
import { SmartChunker } from "./smart-chunker";
import { extractWithUnpdf, writeJson } from "./lib";

const DOCS = [
  { id: "attention", path: "./corpus/attention.pdf", kind: "pdf", lang: "en", note: "arxiv: Attention Is All You Need" },
  { id: "apple10k", path: "./corpus/apple-10k-excerpt.pdf", kind: "pdf", lang: "en", note: "Apple FY24 Q4 financial statements" },
  { id: "mdn-fetch", path: "./corpus/mdn-fetch.html", kind: "html", lang: "en", note: "MDN Fetch API docs" },
  { id: "w3c-webauthn", path: "./corpus/w3c-webauthn.html", kind: "html", lang: "en", note: "W3C WebAuthn spec" },
  { id: "rds-proposal", path: "./corpus/rds-proposal-id.md", kind: "md", lang: "id", note: "Indonesian RDS proposal" },
];

function stripHtml(html: string): string {
  // Minimal HTML→markdown-ish strip. Keeps headings + paragraphs.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, body) => {
      const lvl = parseInt(tag[1]);
      return "\n\n" + "#".repeat(lvl) + " " + body.replace(/<[^>]+>/g, "").trim() + "\n\n";
    })
    .replace(/<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|ul|ol|li|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function run() {
  const chunker = new SmartChunker({ maxChunkSize: 800, overlapSize: 200 });
  const corpus: any[] = [];

  for (const d of DOCS) {
    let text: string;
    if (d.kind === "pdf") {
      const { text: t } = await extractWithUnpdf(d.path);
      text = t;
    } else if (d.kind === "html") {
      text = stripHtml(fs.readFileSync(d.path, "utf-8"));
    } else {
      text = fs.readFileSync(d.path, "utf-8");
    }
    const chunks = await chunker.chunk(text);
    corpus.push({
      doc: d.id,
      lang: d.lang,
      note: d.note,
      textLen: text.length,
      chunks: chunks.map(c => ({
        id: `${d.id}_${c.chunkIndex}`,
        doc: d.id,
        idx: c.chunkIndex,
        text: c.text,
        section: c.metadata.section || c.metadata.hierarchyPath?.join(" > ") || null,
        type: c.metadata.chunkType,
      })),
    });
    console.log(`${d.id}: ${text.length} chars → ${chunks.length} chunks`);
  }
  writeJson("./results/corpus-unpdf.json", corpus);
  console.log(`\nTotal chunks: ${corpus.reduce((a, c) => a + c.chunks.length, 0)}`);
}
run().catch(e => { console.error(e); process.exit(1); });
