/**
 * IKAT-Bench placement metrics (docs/paper/02-benchmark-design.md §5).
 *
 * Everything here is a pure function over already-computed inputs (sentences,
 * embeddings, id sets) so the metric suite can be unit-tested without touching
 * a model. The only judgement call that needs a network is `idealSlot`, and it
 * takes the similarity as data rather than computing it, for the same reason.
 *
 * Vocabulary:
 *   - a figure's ANCHOR is its reading-order index in the parsed source document
 *   - `ctx(f)` is the prose adjacent to that anchor, i.e. what the textbook's own
 *     authors chose to wrap the figure in — this is the free gold label
 *   - a SLOT is an insertion point in the generated answer: slot 0 = before the
 *     first sentence, slot j = immediately after sentence j
 */

// ── Sentence segmentation ──────────────────────────────────────────────────

/**
 * Split an answer into sentences.
 *
 * Deliberately conservative: it must not split on the abbreviations and ordinals
 * that pepper Indonesian textbook prose ("hal. 12", "No. 3", "Gambar 2.1"), since
 * an over-eager split inflates the sentence count and therefore every
 * displacement measured in sentences. Markdown structure (headings, list items)
 * counts as a boundary because a figure legitimately sits between list items.
 */
export function splitSentences(text: string): string[] {
  if (!text?.trim()) return [];
  // Swap protected dots for a sentinel that cannot occur in real prose, split on
  // what remains, then restore. Deleting the dots instead would corrupt the
  // sentence text itself ("Gambar 2.1" -> "Gambar 21").
  const DOT = "\u0001";
  const protectedText = text
    // "hal. 12", "No. 3", "dll. " — abbreviation dots, not sentence ends.
    .replace(/\b(hal|no|dll|dsb|tsb|apt|drs|prof|dr|ir|hlm)\.(\s)/gi, `$1${DOT}$2`)
    // Decimal and figure numbering: "Gambar 2.1", "3.14".
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`);

  const parts: string[] = [];
  for (const line of protectedText.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Markdown headings and list items are their own units: a figure can
    // legitimately sit between two list items.
    if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(trimmed)) {
      parts.push(trimmed);
      continue;
    }
    for (const s of trimmed.split(/(?<=[.!?])\s+/)) {
      if (s.trim()) parts.push(s.trim());
    }
  }
  // Generators commonly emit the citation marker AFTER the full stop
  // ("…meteran gulung. [1]"), which the sentence split above turns into a
  // standalone "[1]" fragment. Left alone that inflates the slot count, shifts
  // every displacement after it, and feeds a contentless token into the
  // similarity that decides ideal(). Fold such fragments back onto the sentence
  // they belong to.
  const ONLY_CITES = /^(\s*\[\d+\]\s*)+$/;
  const LEADING_CITES = /^((?:\s*\[\d+\])+)\s*/;
  const merged: string[] = [];
  for (const part of parts) {
    // A fragment that is nothing but markers belongs to the sentence before it.
    if (ONLY_CITES.test(part) && merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${part.trim()}`;
      continue;
    }
    // More common: the split leaves the marker at the START of the next
    // sentence ("…penggaris." / "[1] Lalu meteran."). Move the leading markers
    // back where the generator meant them.
    const m = merged.length ? part.match(LEADING_CITES) : null;
    if (m) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${m[1].trim()}`;
      const rest = part.slice(m[0].length).trim();
      if (rest) merged.push(rest);
      continue;
    }
    merged.push(part);
  }
  return merged.map((s) => s.split(DOT).join("."));
}

// ── Ideal slot ─────────────────────────────────────────────────────────────

/**
 * The slot whose surrounding sentence best matches the figure's source context.
 *
 * `sims[j]` is the similarity between answer sentence j and `ctx(f)`. The ideal
 * slot is *after* the best-matching sentence, because a textbook figure follows
 * the prose that introduces it — matching how the books themselves are set.
 *
 * Returns -1 when there is nothing to match against, which callers must treat as
 * "not scoreable" rather than as slot 0; silently coercing would fabricate
 * perfect placements for empty answers.
 */
export function idealSlot(sims: number[]): number {
  if (!sims.length) return -1;
  let best = 0;
  for (let j = 1; j < sims.length; j++) if (sims[j] > sims[best]) best = j;
  return best + 1;
}

// ── Displacement ───────────────────────────────────────────────────────────

export interface PlacedFigure {
  figureId: string;
  /** Slot the system actually inserted the figure at. */
  predictedSlot: number;
  /** Slot derived from the source document's layout via `idealSlot`. */
  idealSlot: number;
}

/** Signed displacement in sentences. Positive = placed later than ideal. */
export function displacement(f: PlacedFigure): number {
  return f.predictedSlot - f.idealSlot;
}

/** Mean |PD| over scoreable placements. Returns null when nothing is scoreable. */
export function meanAbsDisplacement(figs: PlacedFigure[]): number | null {
  const ok = figs.filter((f) => f.idealSlot >= 0 && f.predictedSlot >= 0);
  if (!ok.length) return null;
  return ok.reduce((a, f) => a + Math.abs(displacement(f)), 0) / ok.length;
}

/**
 * PA@k — of the figures that were CORRECTLY SELECTED, the fraction landing
 * within k sentences of ideal.
 *
 * Conditioning on correct selection is the whole point: it isolates placement
 * from retrieval so the two failure modes can be reported separately (claim C2).
 * Callers must pass only correctly-selected figures; `groundedFigureF1` below
 * does that filtering for the combined metric.
 */
export function placementAccuracy(figs: PlacedFigure[], k: number): number | null {
  const ok = figs.filter((f) => f.idealSlot >= 0 && f.predictedSlot >= 0);
  if (!ok.length) return null;
  return ok.filter((f) => Math.abs(displacement(f)) <= k).length / ok.length;
}

// ── Selection ──────────────────────────────────────────────────────────────

export interface PRF {
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Precision/recall/F1, or null when the case is VACUOUS — nothing expected and
 * nothing emitted.
 *
 * This distinction is load-bearing. Most questions over a textbook corpus have
 * no associated figure at all; scoring "correctly emitted nothing" as F1 = 0
 * drags every system's macro-average toward zero in proportion to how many
 * text-only questions the set happens to contain — which measures the question
 * mix, not the system. Vacuous cases are skipped. Emitting a figure where none
 * belongs still scores precision 0, so a false positive keeps costing.
 */
function prf(tp: number, nPred: number, nGold: number): PRF | null {
  if (nPred === 0 && nGold === 0) return null;
  const precision = nPred ? tp / nPred : 0;
  const recall = nGold ? tp / nGold : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

/**
 * Figure selection P/R/F1 against the gold figure set F*(q).
 * Null when nothing was expected and nothing emitted (see `prf`).
 */
export function figureSelection(predicted: string[], gold: string[]): PRF | null {
  const g = new Set(gold);
  const p = new Set(predicted);
  let tp = 0;
  for (const id of p) if (g.has(id)) tp++;
  return prf(tp, p.size, g.size);
}

// ── Headline metric ────────────────────────────────────────────────────────

/**
 * Grounded Figure F1 — a figure counts only if it is the RIGHT figure AND in the
 * RIGHT place (|PD| <= tolerance).
 *
 * This is what separates this benchmark from retrieval-only multimodal RAG
 * evaluation: a system that retrieves perfectly but places badly is penalised
 * exactly as much as its reader would penalise it.
 */
export function groundedFigureF1(
  predicted: PlacedFigure[],
  gold: string[],
  tolerance = 1,
): { grounded: PRF | null; selection: PRF | null; placementAccuracy: number | null } {
  const g = new Set(gold);
  const selected = predicted.filter((f) => g.has(f.figureId));
  const hits = selected.filter(
    (f) => f.idealSlot >= 0 && f.predictedSlot >= 0 && Math.abs(displacement(f)) <= tolerance,
  );
  return {
    grounded: prf(hits.length, predicted.length, g.size),
    selection: figureSelection(
      predicted.map((f) => f.figureId),
      gold,
    ),
    placementAccuracy: placementAccuracy(selected, tolerance),
  };
}

// ── Aggregation ────────────────────────────────────────────────────────────

/**
 * Macro-average a per-question metric.
 *
 * Macro (not micro) because questions differ wildly in figure count and a
 * micro-average would let a handful of figure-dense pages dominate the headline
 * number. Nulls are skipped rather than treated as zero — a question with no
 * scoreable figure is absent evidence, not a failure.
 */
export function macroAverage(values: Array<number | null>): number | null {
  const ok = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!ok.length) return null;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

/** Correlation between judge-chosen slots and layout-gold ideal slots (metric validity). */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}
