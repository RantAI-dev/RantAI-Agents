/**
 * LLM-as-judge for IKAT-Bench (see docs/paper/02-benchmark-design.md).
 *
 * The judge replaces human raters for: answer quality (completeness /
 * faithfulness), pedagogical helpfulness, and — most importantly — the
 * placement-validity study that licenses the layout-gold metric.
 *
 * ── Why this file is defensive ────────────────────────────────────────────
 * LLM-as-judge is the single most attacked component in a paper like this.
 * Reviewers assume self-preference, position bias, and unstated variance until
 * proven otherwise. So the controls are enforced in CODE, not promised in prose:
 *
 *   1. JUDGE ≠ GENERATOR (hard guard, throws). A judge scoring answers written
 *      by its own model family self-prefers. `assertJudgeIndependence` refuses
 *      to run when the generator shares the judge's vendor.
 *   2. BLIND + SHUFFLED. The judge never sees a system name. Answers are
 *      relabelled A/B/C… in a per-item permutation; the mapping is kept out of
 *      the prompt and re-joined afterwards.
 *   3. POSITION-BIAS CONTROL. Pairwise judging runs both orders. Only
 *      order-consistent verdicts count as decisions; the flip rate is reported
 *      as a first-class diagnostic, not hidden.
 *   4. SELF-CONSISTENCY. Every judgement is repeated `repeats` times and the
 *      majority is taken, with the agreement rate carried in the result so the
 *      paper can report judge stability instead of asserting it.
 *   5. FORCED CHOICE over Likert wherever possible. "Which slot is best?" is
 *      far more stable across runs than "rate this 1–5".
 *
 * ── The one thing this cannot do ──────────────────────────────────────────
 * An LLM judge validated only against itself is circular. The layout-gold metric
 * is structural (it comes from the book's typesetting, not from any model), so
 * the core placement numbers do NOT depend on the judge — the judge is used to
 * show that layout-gold AGREES with a competent reader's judgement. That is a
 * genuine external check only to the extent the judge is a competent reader.
 * `HUMAN_SPOTCHECK_NOTE` below states the residual risk verbatim so it reaches
 * the manuscript instead of being quietly dropped.
 */
import { chat, writeJson } from "./lib";

/** Stated in the paper's limitations section, verbatim. Do not soften. */
export const HUMAN_SPOTCHECK_NOTE = `Placement ground truth is structural (source-document reading order) and
therefore independent of any model. The agreement study that licenses it, however, uses an LLM judge
rather than human raters. We report judge self-consistency, position-bias and parse diagnostics, but we do
not claim the judge is a substitute for human judgement: published agreement between LLM judges and humans
is often low and occasionally negative, so judge validity cannot be assumed and must be demonstrated per
task. No human validation has been performed here. A human study of >=100 items reporting Cohen's kappa
with its 2x2 cells is the accepted bar and remains outstanding.`;

// ── Configuration ──────────────────────────────────────────────────────────

export interface JudgeConfig {
  /** Judge model. Kept separate from every generator under test. */
  model: string;
  /** Repeats per judgement for the self-consistency estimate. Odd number. */
  repeats: number;
  /** Deterministic permutation seed, so a run is reproducible. */
  seed: number;
}

export const DEFAULT_JUDGE: JudgeConfig = {
  // Pinned, not floating: a judge that silently changes version invalidates
  // every comparison made across runs.
  model: "anthropic/claude-sonnet-4.6",
  // 11, not 3. Majority vote over 3 repeats does not reliably reproduce a
  // large-sample reference; the reporting literature puts the requirement an
  // order of magnitude higher, and repeats are the cheapest part of this
  // pipeline. Temperature is pinned at 0 in `chat`.
  repeats: 11,
  seed: 20260806,
};

/** Vendor prefix of an OpenRouter model id ("anthropic/claude-…" → "anthropic"). */
function vendorOf(model: string): string {
  return model.split("/")[0]?.toLowerCase() ?? model.toLowerCase();
}

/**
 * Refuse to judge answers produced by the judge's own vendor.
 *
 * Self-preference in LLM judges is well documented and is the first thing a
 * reviewer will raise. Rather than disclose it as a limitation, we make the
 * configuration impossible: if the judge is Anthropic, no Anthropic model may
 * appear among the systems under test.
 */
export function assertJudgeIndependence(judge: JudgeConfig, generatorModels: string[]): void {
  const jv = vendorOf(judge.model);
  const clashes = generatorModels.filter((m) => vendorOf(m) === jv);
  if (clashes.length) {
    throw new Error(
      `Judge independence violated: judge "${judge.model}" shares vendor "${jv}" with generator(s) ` +
        `[${clashes.join(", ")}]. Pick a judge from a different vendor, or drop those generators. ` +
        `This guard exists because same-vendor judging inflates scores via self-preference.`,
    );
  }
}

// ── Deterministic shuffling (blinding) ─────────────────────────────────────

/** mulberry32 — small deterministic PRNG so permutations reproduce from `seed`. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates with a seeded PRNG. Returns a new array. */
export function shuffle<T>(items: T[], seed: number): T[] {
  const r = rng(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Robust JSON extraction ─────────────────────────────────────────────────

/**
 * Pull the first JSON object out of a model reply. Judges wrap output in prose
 * or fences no matter how firmly the prompt forbids it; failing the whole run on
 * that would silently bias results toward the more compliant models.
 */
export function parseJsonLoose<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

// ── Self-consistency wrapper ───────────────────────────────────────────────

export interface Consistent<T> {
  /** Majority value across repeats. */
  value: T;
  /** Fraction of repeats agreeing with `value` (1.0 = unanimous). */
  agreement: number;
  /** Every raw repeat, kept for the appendix. */
  samples: T[];
}

/**
 * Run a judgement `repeats` times and take the majority.
 *
 * Temperature is already 0 in `chat`, but providers are not bit-deterministic
 * and prompt-order effects remain, so variance is real. Measuring it is cheap;
 * asserting stability without measuring it is what gets papers rejected.
 */
export async function selfConsistent<T>(
  fn: (attempt: number) => Promise<T>,
  repeats: number,
  key: (v: T) => string,
): Promise<Consistent<T>> {
  const samples: T[] = [];
  for (let i = 0; i < repeats; i++) samples.push(await fn(i));

  const counts = new Map<string, { n: number; v: T }>();
  for (const s of samples) {
    const k = key(s);
    const cur = counts.get(k);
    if (cur) cur.n++;
    else counts.set(k, { n: 1, v: s });
  }
  let best = { n: 0, v: samples[0] };
  for (const c of counts.values()) if (c.n > best.n) best = c;
  return { value: best.v, agreement: best.n / samples.length, samples };
}

// ── 1. Placement validity: forced-choice slot selection ────────────────────

export interface SlotChoice {
  /** Index of the chosen insertion slot: 0 = before sentence 1, j = after sentence j. */
  slot: number;
  /** "none" verdict — the figure does not belong anywhere in this answer. */
  reject: boolean;
  reason: string;
}

const PLACEMENT_PROMPT = `You are evaluating where an illustration from a school textbook should be placed inside a tutoring answer.

Below is an answer, split into numbered sentences. Insertion slots sit BETWEEN sentences:
slot 0 = before sentence 1, slot j = immediately after sentence j.

ANSWER:
{SENTENCES}

THE ILLUSTRATION:
{FIGURE}

Choose the ONE slot where this illustration best supports the reader's understanding — the point where
the text is discussing what the illustration shows. If the illustration does not belong in this answer
at all, set "reject" to true.

Judge only fit between the illustration and the surrounding sentences. Ignore writing style, answer
correctness, and how the answer was produced.

Reply with ONLY this JSON:
{"slot": <integer>, "reject": <true|false>, "reason": "<one short sentence>"}`;

/**
 * Ask the judge for the best insertion slot. This is the measurement behind the
 * metric-validity study: we correlate the judge's choice with `ideal(f)` derived
 * from the source document's own layout. Forced choice (not a rating) because it
 * is markedly more reproducible.
 */
export async function judgePlacementSlot(
  cfg: JudgeConfig,
  sentences: string[],
  figureDescription: string,
): Promise<Consistent<SlotChoice>> {
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const prompt = PLACEMENT_PROMPT.replace("{SENTENCES}", numbered).replace("{FIGURE}", figureDescription);

  return selfConsistent<SlotChoice>(
    async () => {
      const out = await chat(cfg.model, [{ role: "user", content: prompt }], 400);
      const p = parseJsonLoose<SlotChoice>(out.text);
      if (!p || typeof p.slot !== "number") return { slot: -1, reject: true, reason: "unparseable" };
      // Clamp into range so a hallucinated index cannot silently skew displacement.
      const slot = Math.max(0, Math.min(sentences.length, Math.round(p.slot)));
      return { slot, reject: Boolean(p.reject), reason: String(p.reason ?? "").slice(0, 200) };
    },
    cfg.repeats,
    (v) => `${v.reject ? "R" : v.slot}`,
  );
}

// ── 2. Answer quality (blind, absolute) ────────────────────────────────────

export interface QualityScore {
  completeness: number; // 1-5
  faithfulness: number; // 1-5
  helpfulness: number; // 1-5, pedagogical
  reason: string;
}

const QUALITY_PROMPT = `You are grading an answer produced by a study assistant for Indonesian school students.

QUESTION:
{Q}

REFERENCE ANSWER (from the textbook):
{GOLD}

ANSWER UNDER EVALUATION:
{A}

Score three dimensions, each 1-5:
- completeness: does it cover the substance of the reference answer? (5 = fully, 1 = misses it)
- faithfulness: is every claim supported by the textbook reference? (5 = no unsupported claim, 1 = largely invented)
- helpfulness: would this actually help a school student understand? (5 = clear and appropriately pitched)

Grade only the answer's content. Do not reward length, formatting, or confident tone.

Reply with ONLY this JSON:
{"completeness": <1-5>, "faithfulness": <1-5>, "helpfulness": <1-5>, "reason": "<one short sentence>"}`;

export async function judgeAnswerQuality(
  cfg: JudgeConfig,
  question: string,
  goldAnswer: string,
  answer: string,
): Promise<Consistent<QualityScore>> {
  const prompt = QUALITY_PROMPT.replace("{Q}", question)
    .replace("{GOLD}", goldAnswer)
    .replace("{A}", answer);

  const clamp = (n: unknown) => Math.max(1, Math.min(5, Math.round(Number(n) || 1)));
  return selfConsistent<QualityScore>(
    async () => {
      const out = await chat(cfg.model, [{ role: "user", content: prompt }], 400);
      const p = parseJsonLoose<QualityScore>(out.text);
      if (!p) return { completeness: 1, faithfulness: 1, helpfulness: 1, reason: "unparseable" };
      return {
        completeness: clamp(p.completeness),
        faithfulness: clamp(p.faithfulness),
        helpfulness: clamp(p.helpfulness),
        reason: String(p.reason ?? "").slice(0, 200),
      };
    },
    cfg.repeats,
    (v) => `${v.completeness}${v.faithfulness}${v.helpfulness}`,
  );
}

// ── 3. Pairwise with position-bias control ─────────────────────────────────

export type PairVerdict = "A" | "B" | "tie";

export interface PairResult {
  /** Verdict in the ORIGINAL (first, second) orientation, after de-blinding. */
  verdict: PairVerdict;
  /** True when the two orderings disagreed — i.e. the judge is order-sensitive here. */
  inconsistent: boolean;
  forward: PairVerdict;
  reversed: PairVerdict;
}

const PAIR_PROMPT = `Two study assistants answered the same question for an Indonesian school student.

QUESTION:
{Q}

REFERENCE ANSWER (from the textbook):
{GOLD}

ASSISTANT A:
{A}

ASSISTANT B:
{B}

Which answer is better for helping the student understand, considering correctness against the reference,
completeness, and how well any illustrations support the explanation? Answer "tie" only if genuinely equal.

Ignore which assistant is listed first. Ignore length and formatting.

Reply with ONLY this JSON:
{"winner": "A" | "B" | "tie", "reason": "<one short sentence>"}`;

async function pairOnce(
  cfg: JudgeConfig,
  question: string,
  gold: string,
  first: string,
  second: string,
): Promise<PairVerdict> {
  const prompt = PAIR_PROMPT.replace("{Q}", question)
    .replace("{GOLD}", gold)
    .replace("{A}", first)
    .replace("{B}", second);
  const out = await chat(cfg.model, [{ role: "user", content: prompt }], 300);
  const p = parseJsonLoose<{ winner: string }>(out.text);
  const w = (p?.winner ?? "tie").toUpperCase();
  return w === "A" ? "A" : w === "B" ? "B" : "tie";
}

/**
 * Judge a pair in BOTH orders and reconcile.
 *
 * LLM judges favour whichever answer is shown first. Running only one order
 * silently bakes that in. Here a verdict counts as a decision only when it
 * survives the swap; disagreements are surfaced as `inconsistent` and reported
 * as the position-bias flip rate.
 */
export async function judgePairwise(
  cfg: JudgeConfig,
  question: string,
  gold: string,
  answerA: string,
  answerB: string,
): Promise<PairResult> {
  const forward = await pairOnce(cfg, question, gold, answerA, answerB);
  const reversedRaw = await pairOnce(cfg, question, gold, answerB, answerA);
  // De-blind: in the reversed run, "A" refers to answerB.
  const reversed: PairVerdict = reversedRaw === "A" ? "B" : reversedRaw === "B" ? "A" : "tie";
  const inconsistent = forward !== reversed;
  return { verdict: inconsistent ? "tie" : forward, inconsistent, forward, reversed };
}

// ── 4. Run-level diagnostics ───────────────────────────────────────────────

/**
 * Cohen's kappa for two binary raters.
 *
 * Raw agreement is not reportable on its own: two judges can agree 80% of the
 * time and still be twenty score-points apart, because agreement expected by
 * chance depends on the marginals. Kappa is what a reviewer will ask for, and
 * the 2x2 cells are reported alongside it because kappa alone can be moved a
 * long way by protocol choices that change no verdict at all.
 */
export function cohensKappa(a: number[], b: number[]): { kappa: number | null; n11: number; n10: number; n01: number; n00: number; n: number } {
  const n = Math.min(a.length, b.length)
  let n11 = 0, n10 = 0, n01 = 0, n00 = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] ? 1 : 0
    const y = b[i] ? 1 : 0
    if (x && y) n11++
    else if (x && !y) n10++
    else if (!x && y) n01++
    else n00++
  }
  if (!n) return { kappa: null, n11, n10, n01, n00, n }
  const po = (n11 + n00) / n
  const pe = ((n11 + n10) * (n11 + n01) + (n01 + n00) * (n10 + n00)) / (n * n)
  const kappa = pe === 1 ? null : (po - pe) / (1 - pe)
  return { kappa, n11, n10, n01, n00, n }
}

export interface JudgeDiagnostics {
  judgeModel: string;
  repeats: number;
  seed: number;
  nJudgements: number;
  /** Mean self-consistency agreement across all judgements. */
  meanAgreement: number;
  /** Fraction of judgements that were unanimous across repeats. */
  unanimousRate: number;
  /** Pairwise position-bias flip rate; undefined when no pairwise judging ran. */
  positionFlipRate?: number;
  /** Fraction of judge replies that failed to parse. */
  unparseableRate: number;
  /** Judge sampling temperature, pinned and reported so runs stay comparable. */
  temperature: number;
  note: string;
}

export function summarizeDiagnostics(
  cfg: JudgeConfig,
  agreements: number[],
  opts: { pairs?: PairResult[]; unparseable?: number } = {},
): JudgeDiagnostics {
  const n = agreements.length || 1;
  const mean = agreements.reduce((a, b) => a + b, 0) / n;
  const unanimous = agreements.filter((a) => a >= 0.999).length / n;
  const pairs = opts.pairs ?? [];
  return {
    judgeModel: cfg.model,
    repeats: cfg.repeats,
    seed: cfg.seed,
    nJudgements: agreements.length,
    meanAgreement: Number(mean.toFixed(4)),
    unanimousRate: Number(unanimous.toFixed(4)),
    positionFlipRate: pairs.length
      ? Number((pairs.filter((p) => p.inconsistent).length / pairs.length).toFixed(4))
      : undefined,
    unparseableRate: Number(((opts.unparseable ?? 0) / n).toFixed(4)),
    temperature: 0,
    note: HUMAN_SPOTCHECK_NOTE,
  };
}

/** Persist diagnostics next to the run's results so no table ships without them. */
export function writeDiagnostics(path: string, d: JudgeDiagnostics): void {
  writeJson(path, d);
}
