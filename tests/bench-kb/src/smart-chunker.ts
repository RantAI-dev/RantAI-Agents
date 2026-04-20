// Mirror of RantAI-Agents src/lib/rag/smart-chunker.ts — frozen for the bench (full version w/ sentence fallback).
export interface SmartChunk { chunkIndex: number; metadata: { chunkType: string; section?: string; hierarchyPath?: string[] }; text: string; }

export class SmartChunker {
  private opts: { maxChunkSize: number; overlapSize: number };
  constructor(opts: { maxChunkSize?: number; overlapSize?: number } = {}) {
    this.opts = { maxChunkSize: opts.maxChunkSize ?? 800, overlapSize: opts.overlapSize ?? 200 };
  }

  async chunk(md: string): Promise<SmartChunk[]> {
    let blocks = this.splitBlocks(md);
    const total = md.length;
    const avg = blocks.length ? total / blocks.length : total;
    if (avg > this.opts.maxChunkSize * 2 && total > this.opts.maxChunkSize) {
      blocks = this.splitBySentences(md);
    }
    const out: SmartChunk[] = [];
    let cur = "", meta: any = { chunkType: "text" }, hier: string[] = [], idx = 0;
    for (const block of blocks) {
      const m = this.detect(block);
      if (m.chunkType === "heading" && m.headingLevel) {
        hier = hier.slice(0, m.headingLevel - 1); hier.push(block.replace(/^#+\s+/, "").trim());
        m.hierarchyPath = [...hier];
      }
      const flushHeading = m.chunkType === "heading" && cur.length > 0;
      if (flushHeading) { out.push({ chunkIndex: idx++, metadata: { ...meta }, text: cur.trim() }); cur = ""; }
      if (cur.length + block.length > this.opts.maxChunkSize && cur.length > 0) {
        out.push({ chunkIndex: idx++, metadata: { ...meta }, text: cur.trim() });
        cur = cur.slice(-this.opts.overlapSize);
      }
      cur += (cur ? "\n\n" : "") + block;
      meta = { ...m, hierarchyPath: m.hierarchyPath || hier };
    }
    if (cur.trim()) out.push({ chunkIndex: idx++, metadata: meta, text: cur.trim() });
    return out;
  }

  private splitBySentences(text: string): string[] {
    const re = /(?<=[.!?])\s+(?=[A-Z0-9])/g;
    const sents = text.split(re).filter(s => s.trim().length);
    if (sents.length <= 1) return this.splitByFixed(text);
    const blocks: string[] = [];
    let cur = "";
    for (const s of sents) {
      if (cur.length + s.length > this.opts.maxChunkSize && cur.length > 0) {
        blocks.push(cur.trim()); cur = s;
      } else cur += (cur ? " " : "") + s;
    }
    if (cur.trim()) blocks.push(cur.trim());
    return blocks;
  }

  private splitByFixed(text: string): string[] {
    const out: string[] = []; const size = this.opts.maxChunkSize;
    for (let i = 0; i < text.length; i += size) {
      let end = Math.min(i + size, text.length);
      if (end < text.length) {
        const sp = text.lastIndexOf(" ", end);
        if (sp > i + size / 2) end = sp;
      }
      out.push(text.slice(i, end).trim());
      if (end !== i + size) i = end - size;
    }
    return out.filter(Boolean);
  }

  private splitBlocks(text: string): string[] {
    const blocks: string[] = [];
    const lines = text.split("\n");
    let cur = "", inCode = false, inTable = false;
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        inCode = !inCode; cur += line + "\n";
        if (!inCode) { blocks.push(cur.trim()); cur = ""; }
        continue;
      }
      if (line.includes("|") && line.includes("---")) inTable = true;
      if (inCode || inTable) {
        cur += line + "\n";
        if (inTable && !line.includes("|")) { inTable = false; blocks.push(cur.trim()); cur = ""; }
        continue;
      }
      if (line.trim() === "") {
        if (cur.trim()) { blocks.push(cur.trim()); cur = ""; }
      } else cur += line + "\n";
    }
    if (cur.trim()) blocks.push(cur.trim());
    return blocks.filter(b => b.length > 0);
  }

  private detect(block: string): any {
    const h = block.match(/^(#{1,6})\s+(.+)/);
    if (h) return { chunkType: "heading", headingLevel: h[1].length, section: h[2].trim() };
    if (block.includes("|") && block.includes("---")) return { chunkType: "table" };
    if (block.startsWith("```")) return { chunkType: "code" };
    if (/^[\d*+.-]\s+/.test(block)) return { chunkType: "list" };
    return { chunkType: "text" };
  }
}
