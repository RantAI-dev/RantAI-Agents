/**
 * Pure heuristic functions that classify an unpdf text-layer extraction as
 * "sufficient" for retrieval purposes. Used by SmartRouterExtractor to decide
 * whether to return unpdf's output directly or fall through to a vision-LLM
 * OCR fallback.
 *
 * Every function is a pure predicate. Signals are ordered cheapest-first so
 * early false-returns avoid unnecessary work.
 *
 * Thresholds were chosen empirically against the 40-doc all-approaches bench.
 * See docs/superpowers/specs/2026-04-22-smart-router-extractor-design.md.
 */

export interface RouterOpts {
  /** Min chars per PDF page that unpdf must produce to be trusted. Below this
   * signals a scanned / image-only PDF whose text layer is empty or junk. */
  minCharsPerPage: number;
  /** Max lines that look columnar (multi-cell tabular data flattened by unpdf).
   * If the text-layer has more than this, the doc probably has tables that
   * need vision OCR to preserve structure. */
  maxColumnarLines: number;
  /** Max `$X,XXX` currency patterns. Financial tables contain many; prose rarely
   * exceeds this. Over the threshold → route to OCR. */
  maxCurrencyMatches: number;
}

export const DEFAULT_ROUTER_OPTS: RouterOpts = {
  minCharsPerPage: 300,
  maxColumnarLines: 5,
  maxCurrencyMatches: 10,
};

/**
 * Count lines that look columnar: 2+ runs of 3+ whitespace chars between
 * visible text tokens. Tables flatten to these when extracted as text layer.
 * Returns true if the count exceeds `threshold`.
 */
export function hasColumnarLines(text: string, threshold: number): boolean {
  const lines = text.split("\n");
  let count = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 10) continue;
    const matches = line.match(/\S\s{3,}\S/g);
    if (matches && matches.length >= 2) {
      count++;
      if (count > threshold) return true;
    }
  }
  return false;
}

export function isUnpdfSufficient(
  text: string,
  pageCount: number,
  opts: RouterOpts = DEFAULT_ROUTER_OPTS,
): boolean {
  if (!text || text.length < opts.minCharsPerPage * pageCount) return false;
  if (hasColumnarLines(text, opts.maxColumnarLines)) return false;
  return true;
}
