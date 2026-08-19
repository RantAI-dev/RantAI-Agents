/**
 * The VLM gate: let a vision model veto figures before a student sees them.
 *
 * Measured on 48 human-annotated questions, the shipped selector puts the right
 * figure on screen 2.8% of the time. Adding this stage takes that to 54.2% —
 * roughly one in two instead of one in thirty-five (docs/paper/10-improvement-
 * experiments.md). The gain is not a better ranker; it is that something finally
 * LOOKS at the picture. A cross-encoder reads a 300-character caption written
 * before anyone knew the question; it cannot tell a diagram of the water cycle
 * from a photograph of a river.
 *
 * Three things about the design are load-bearing, and each was the losing side
 * of an experiment before it was the winning side:
 *
 *  - JUDGE ONE FIGURE AT A TIME, never as a list. Shown a numbered list, the
 *    model picks a winner even when nothing fits; that failure once emitted 261
 *    figures on questions with no correct figure at all.
 *  - JUDGE ONLY THE TOP FEW. Prefill cost scales with images, not calls, so the
 *    cross-encoder's ordering is used to cut the candidate set first. At two
 *    candidates the pipeline scores within 0.02 F1 of seeing all six, at a third
 *    of the latency. The correct figure is still present in the top 2 for 87% of
 *    links, so the cut costs far less than it saves.
 *  - THE PROMPT IS STRICT, and that is the single largest gain in the whole
 *    study: +12 points of precision over a permissive wording, for free — same
 *    model, same call, different words. Carried verbatim from the benchmark,
 *    because the number belongs to this exact text.
 *
 * Off unless KB_FIGURE_VLM_ENABLED is set. It adds a per-figure model call to
 * the answer path (~1.0 s each on the partner's GPU), so switching it on is an
 * operator's decision about latency, not a default.
 */
import { kb } from "@/lib/kb-runtime/runtime"

/** A figure the reranker has already ranked; `text` is what it ranked on. */
export interface GateCandidate {
  /** Stable id for logging and for mapping the verdict back. */
  id: string
  /** Object key of the PNG crop. */
  assetKey: string
  /** Caption, used only for the log line. */
  caption: string
}

export interface GateConfig {
  base: string
  model: string
  /** How many of the ranked candidates the model is allowed to see. */
  topN: number
  /** How many survivors may actually be shown. One, in the measured design:
   *  emitting a second figure cost precision without adding recall. */
  maxKeep: number
  /** Per-call budget. A slow gate must not hold up an answer. */
  timeoutMs: number
}

/**
 * Verbatim from the benchmark. Do not "improve" the wording without re-running
 * the evaluation: the permissive variant of this same prompt scores 12 points
 * lower on precision, and the difference is entirely in how often the model
 * declines.
 */
const PROMPT_STRICT = `Kamu menilai apakah sebuah gambar dari buku pelajaran WAJIB ditampilkan untuk menjawab pertanyaan siswa.

Pertanyaan siswa: {Q}

Lihat gambar di atas.

Jawab "YA" HANYA jika gambar ini memuat informasi yang DIBUTUHKAN untuk menjawab pertanyaan itu —
misalnya angka, bentuk, langkah, atau bagian berlabel yang tidak bisa dijelaskan dengan kata-kata saja.

Jawab "TIDAK" untuk semua kasus lain, termasuk:
- gambar yang topiknya berhubungan tetapi tidak dibutuhkan untuk menjawab
- foto orang, suasana, atau kegiatan sebagai hiasan
- gambar pembuka bab atau latar halaman
- gambar yang hanya "cocok temanya"

Patokan penting: dari setiap 20 gambar dalam buku, biasanya HANYA 1 yang benar-benar dibutuhkan
untuk sebuah pertanyaan tertentu. Kalau kamu menjawab YA lebih sering dari itu, kamu terlalu longgar.

Kalau ragu sedikit pun, jawab TIDAK.

Jawab HANYA satu kata: YA atau TIDAK.`

/** Config from env, or null when the gate is switched off or under-configured. */
export function gateConfig(env: NodeJS.ProcessEnv = process.env): GateConfig | null {
  if (env.KB_FIGURE_VLM_ENABLED !== "1" && env.KB_FIGURE_VLM_ENABLED !== "true") return null
  const base = env.KB_FIGURE_VLM_BASE?.replace(/\/+$/, "")
  const model = env.KB_FIGURE_VLM_MODEL
  if (!base || !model) return null
  const topN = Number(env.KB_FIGURE_VLM_TOPN ?? 2)
  const maxKeep = Number(env.KB_FIGURE_VLM_MAX ?? 1)
  const timeoutMs = Number(env.KB_FIGURE_VLM_TIMEOUT_MS ?? 4000)
  return {
    base,
    model,
    topN: Number.isFinite(topN) && topN > 0 ? topN : 2,
    maxKeep: Number.isFinite(maxKeep) && maxKeep > 0 ? maxKeep : 1,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 4000,
  }
}

/**
 * "YA" only when the model said yes and did not also say no.
 *
 * Anything unparseable is a NO. Failing toward silence is the asymmetry the
 * product needs — a wrong diagram costs a student more than a missing one — and
 * it stops a truncated or broken reply from becoming a positive.
 */
export function parseVerdict(reply: string): boolean {
  const t = reply.trim().toUpperCase()
  return /\bYA\b/.test(t) && !/\bTIDAK\b/.test(t)
}

/** One judgement. Resolves false on any failure; never throws. */
async function judge(
  cfg: GateConfig,
  query: string,
  imageBase64: string,
): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs)
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 8,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
              { type: "text", text: PROMPT_STRICT.replace("{Q}", query) },
            ],
          },
        ],
      }),
    })
    if (!res.ok) return false
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return parseVerdict(body.choices?.[0]?.message?.content ?? "")
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Keep only the figures the vision model will vouch for, preserving the order
 * it was given (which is the cross-encoder's ranking, so the first survivor is
 * still the best-ranked one).
 *
 * Candidates beyond `topN` are dropped WITHOUT being judged — that is the
 * latency saving, and it is safe because they are the ones the cross-encoder
 * ranked last. Judgements run concurrently: at topN = 2 the stage costs about
 * one call's latency, not two.
 */
export async function gateFigures(
  query: string,
  candidates: GateCandidate[],
  cfg: GateConfig,
): Promise<GateCandidate[]> {
  if (!candidates.length) return []
  const seen = candidates.slice(0, cfg.topN)

  const verdicts = await Promise.all(
    seen.map(async (c) => {
      let b64: string
      try {
        b64 = (await kb("blob").download(c.assetKey)).toString("base64")
      } catch (err) {
        // A figure we cannot fetch cannot be shown anyway.
        console.warn(`[RAG] figure gate: fetch failed for ${c.assetKey}: ${(err as Error).message?.slice(0, 80)}`)
        return false
      }
      return judge(cfg, query, b64)
    }),
  )

  const kept = seen.filter((_, i) => verdicts[i]).slice(0, cfg.maxKeep)
  console.log(
    `[RAG] figure gate (${cfg.model}, topN=${cfg.topN}): ` +
      seen.map((c, i) => `${verdicts[i] ? "YA" : "no"}:${c.caption.slice(0, 22)}`).join(" | ") +
      ` -> ${kept.length}/${candidates.length}`,
  )
  return kept
}
