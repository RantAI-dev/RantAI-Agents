/**
 * Tree-walker that resolves `unsplash:keyword` src values in a DocumentAst
 * to real Unsplash photo URLs (with placehold.co fallback).
 *
 * Resolution is best-effort: failures never throw, they become placeholders.
 * Identical keywords are deduped so each triggers at most one API call.
 */

import { resolveQueries } from "@/lib/unsplash/resolver"
import type { BlockNode, DocumentAst, ListItem } from "./schema"

// ─── helpers ────────────────────────────────────────────────────────────────

const UNSPLASH_PREFIX = "unsplash:"

function isUnsplash(src: string): boolean {
  return src.startsWith(UNSPLASH_PREFIX)
}

/** Normalize a raw unsplash: src into a search keyword. */
function extractKeyword(raw: string): string {
  return raw
    .slice(UNSPLASH_PREFIX.length)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 50)
}

function fallback(keyword: string): string {
  const q = encodeURIComponent(keyword || "image")
  return `https://placehold.co/1200x800/f1f5f9/64748b?text=${q}`
}

// ─── collect phase ──────────────────────────────────────────────────────────

function collectFromBlocks(blocks: BlockNode[], acc: Set<string>): void {
  for (const block of blocks) {
    if (block.type === "image" && isUnsplash(block.src)) {
      acc.add(block.src)
    } else if (block.type === "list") {
      for (const item of block.items) collectFromListItem(item, acc)
    } else if (block.type === "table") {
      for (const row of block.rows)
        for (const cell of row.cells)
          collectFromBlocks(cell.children, acc)
    } else if (block.type === "blockquote") {
      collectFromBlocks(block.children, acc)
    }
    // paragraph, heading, codeBlock, horizontalRule, pageBreak, toc
    // — none can contain image nodes, skip
  }
}

function collectFromListItem(item: ListItem, acc: Set<string>): void {
  collectFromBlocks(item.children, acc)
  if (item.subList) {
    for (const sub of item.subList.items) collectFromListItem(sub, acc)
  }
}

// ─── replace phase ──────────────────────────────────────────────────────────

function replaceInBlocks(blocks: BlockNode[], map: Map<string, string>): void {
  for (const block of blocks) {
    if (block.type === "image" && map.has(block.src)) {
      block.src = map.get(block.src)!
    } else if (block.type === "list") {
      for (const item of block.items) replaceInListItem(item, map)
    } else if (block.type === "table") {
      for (const row of block.rows)
        for (const cell of row.cells)
          replaceInBlocks(cell.children, map)
    } else if (block.type === "blockquote") {
      replaceInBlocks(block.children, map)
    }
  }
}

function replaceInListItem(item: ListItem, map: Map<string, string>): void {
  replaceInBlocks(item.children, map)
  if (item.subList) {
    for (const sub of item.subList.items) replaceInListItem(sub, map)
  }
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Resolve all `unsplash:keyword` src values in `ast` to real URLs.
 * Returns a deep clone; the original is never mutated.
 */
export async function resolveUnsplashInAst(ast: DocumentAst): Promise<DocumentAst> {
  // 1. Collect unique raw unsplash: values
  const rawSrcs = new Set<string>()

  collectFromBlocks(ast.body, rawSrcs)
  if (ast.header) collectFromBlocks(ast.header.children, rawSrcs)
  if (ast.footer) collectFromBlocks(ast.footer.children, rawSrcs)
  if (ast.coverPage?.logoUrl && isUnsplash(ast.coverPage.logoUrl)) {
    rawSrcs.add(ast.coverPage.logoUrl)
  }

  // 2. Resolve each unique raw src via the shared cache-backed resolver.
  // Mapping: rawSrc → keyword → resolved URL. Going through resolveQueries
  // gives us the same 30-day Prisma cache + concurrent-safe upsert that the
  // HTML and slides paths use.
  const rawByKeyword = new Map<string, string[]>()
  for (const raw of rawSrcs) {
    const kw = extractKeyword(raw)
    if (!kw) continue
    const list = rawByKeyword.get(kw) ?? []
    list.push(raw)
    rawByKeyword.set(kw, list)
  }
  const keywords = [...rawByKeyword.keys()]
  const resolved = keywords.length > 0 ? await resolveQueries(keywords) : new Map<string, string>()
  const map = new Map<string, string>()
  for (const raw of rawSrcs) {
    const kw = extractKeyword(raw)
    if (!kw) {
      map.set(raw, fallback(""))
      continue
    }
    map.set(raw, resolved.get(kw) ?? fallback(kw))
  }

  // 3. Deep-clone then replace
  const out: DocumentAst = structuredClone(ast)

  replaceInBlocks(out.body, map)
  if (out.header) replaceInBlocks(out.header.children, map)
  if (out.footer) replaceInBlocks(out.footer.children, map)
  if (out.coverPage?.logoUrl && map.has(out.coverPage.logoUrl)) {
    out.coverPage.logoUrl = map.get(out.coverPage.logoUrl)!
  }

  return out
}
