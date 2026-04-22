/**
 * Merge a structural extractor's output (e.g. MinerU markdown with HTML tables
 * and headings) with a text-layer extractor's output (e.g. unpdf's flat text).
 *
 * Strategy:
 *   - Keep ALL structural blocks (tables, headings, code fences, block LaTeX)
 *     from the structural extractor verbatim. These carry layout semantics the
 *     text-layer extractor cannot reproduce.
 *   - For prose blocks, attempt to substitute the text-layer's character-perfect
 *     version, anchored by the first + last N words of the structural block.
 *     If anchors don't resolve cleanly, keep the structural version (safe fallback).
 *
 * The substitution catches the small OCR slips that even strong vision models
 * occasionally make on born-digital PDFs (Unicode diacritics, emails, unusual
 * numbers) without touching the blocks where vision understanding is required.
 *
 * Complexity: O(n + P·m) where n = structural length, m = text-layer length,
 * P = prose block count. For a typical page (~3 KB each, ~5 prose blocks) the
 * merge completes in single-digit milliseconds.
 */

type Block =
  | { kind: "prose"; raw: string }
  | { kind: "heading" | "table" | "code" | "latex" | "blank"; raw: string };

const ANCHOR_WORDS = 5;
const LENGTH_RATIO_MIN = 0.7;
const LENGTH_RATIO_MAX = 1.5;

function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.split("\n");
  let i = 0;
  let prose: string[] = [];

  const flushProse = () => {
    if (prose.length) {
      blocks.push({ kind: "prose", raw: prose.join("\n") });
      prose = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushProse();
      blocks.push({ kind: "blank", raw: "" });
      i++;
      continue;
    }

    // HTML table — span from <table...> through </table>
    if (trimmed.startsWith("<table") || trimmed.startsWith("<div") && lines.slice(i, i + 3).some(l => l.includes("<table"))) {
      flushProse();
      const buf: string[] = [];
      while (i < lines.length) {
        buf.push(lines[i]);
        if (lines[i].includes("</table>")) {
          i++;
          // Also absorb a closing </div> on the next line if present (MinerU style)
          if (i < lines.length && lines[i].trim().startsWith("</div>")) {
            buf.push(lines[i]);
            i++;
          }
          break;
        }
        i++;
      }
      blocks.push({ kind: "table", raw: buf.join("\n") });
      continue;
    }

    // Markdown pipe table — at least one row with 2+ pipes, AND a separator row
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().startsWith("|")) {
      flushProse();
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "table", raw: buf.join("\n") });
      continue;
    }

    // ATX heading
    if (/^#{1,6}\s/.test(trimmed)) {
      flushProse();
      blocks.push({ kind: "heading", raw: line });
      i++;
      continue;
    }

    // Code fence
    if (trimmed.startsWith("```")) {
      flushProse();
      const buf = [lines[i]];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "code", raw: buf.join("\n") });
      continue;
    }

    // Block LaTeX — line is exactly "$$"
    if (trimmed === "$$") {
      flushProse();
      const buf = [lines[i]];
      i++;
      while (i < lines.length && lines[i].trim() !== "$$") {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "latex", raw: buf.join("\n") });
      continue;
    }

    // Plain prose line — accumulate until a block-starting line or blank line
    prose.push(line);
    i++;
  }

  flushProse();
  return blocks;
}

function extractAnchor(text: string, position: "start" | "end", wordCount: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length <= wordCount) return words.join(" ");
  return (position === "start" ? words.slice(0, wordCount) : words.slice(-wordCount)).join(" ");
}

function normalizeSpace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Case-insensitive, whitespace-normalized search. Returns index into the
 * *normalized* haystack, or -1 if not found.
 */
function findNormalized(normalizedHaystack: string, needle: string, from = 0): number {
  const normNeedle = normalizeSpace(needle).toLowerCase();
  if (!normNeedle) return -1;
  return normalizedHaystack.toLowerCase().indexOf(normNeedle, from);
}

/**
 * Try to find the text-layer equivalent of a prose block. Returns the matched
 * substring from the text-layer (preserving case + Unicode as unpdf returned
 * them), or null if anchors don't resolve or the length ratio is unreasonable.
 */
function trySubstitute(proseRaw: string, normalizedTextLayer: string): string | null {
  const prose = proseRaw.trim();
  const startAnchor = extractAnchor(prose, "start", ANCHOR_WORDS);
  const endAnchor = extractAnchor(prose, "end", ANCHOR_WORDS);
  if (!startAnchor || !endAnchor) return null;

  const startIdx = findNormalized(normalizedTextLayer, startAnchor);
  if (startIdx < 0) return null;

  // Search for end anchor AFTER the start anchor, not before
  const endSearchFrom = startIdx + normalizeSpace(startAnchor).length;
  const endIdx = findNormalized(normalizedTextLayer, endAnchor, endSearchFrom);
  if (endIdx < 0) return null;

  const endAnchorLen = normalizeSpace(endAnchor).length;
  const span = normalizedTextLayer.slice(startIdx, endIdx + endAnchorLen);

  // Quality gate: reject wildly different lengths. Prevents false matches where
  // the anchor coincidentally appears in unrelated text.
  const ratio = span.length / prose.length;
  if (ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX) return null;

  return span;
}

export function mergeStructuralWithTextLayer(
  structural: string,
  textLayer: string,
): string {
  if (!textLayer.trim()) return structural;
  if (!structural.trim()) return textLayer;

  // Pre-normalize text layer once — every substitute call uses this
  const normalizedTextLayer = normalizeSpace(textLayer);

  const blocks = parseBlocks(structural);
  const out: string[] = [];

  for (const block of blocks) {
    if (block.kind === "blank") {
      out.push("");
      continue;
    }
    if (block.kind !== "prose") {
      out.push(block.raw);
      continue;
    }
    const sub = trySubstitute(block.raw, normalizedTextLayer);
    out.push(sub ?? block.raw);
  }

  return out.join("\n");
}

// Exposed for testing
export const __test = { parseBlocks, trySubstitute, extractAnchor, normalizeSpace };
