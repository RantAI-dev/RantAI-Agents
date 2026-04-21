# Vision-LLM PDF extraction benchmarks

**Summary of every vision-model extraction benchmark run during the KB audit** (April 2026). All numbers measured on OpenRouter against real PDFs — the arxiv "Attention Is All You Need" (15 pages, mixed prose + tables + equations), Apple Q4 FY24 financial statements (4 pages, table-dominant), and the GPT-4 Technical Report (100 pages, long-doc stress).

Use this doc as the evidence base when choosing between closed-source, open-weight-via-cloud, and open-weight-for-on-prem extraction paths.

---

## TL;DR — what we actually concluded from these numbers

| Question | Answer |
|---|---|
| **Cheapest closed-source default** | `openai/gpt-4.1-nano` — $0.00031/page, 2–4s, 8× cheaper than our original Gemini pick, accuracy sufficient for RAG |
| **Quality-first closed-source fallback** | `google/gemini-3-flash-preview` — best structure+equations, $0.0024/page |
| **Which proprietary models to avoid** | `gemini-2.5-flash` / `gemini-2.5-flash-lite` — bloat tables to 200–400K chars on financial docs even with compact-tables prompt |
| **Open-weight for on-prem, balanced** | **`qwen/qwen3-vl-30b-a3b-instruct`** — Apache 2.0, ~20 GB VRAM (FP8, MoE), matches Gemini's structural output |
| **Open-weight for on-prem, table fidelity** | **`z-ai/glm-4.6v`** — GLM license, ~16 GB VRAM, ~2× Gemini's table-row coverage |
| **Reliable on OpenRouter today** | Only closed models + Qwen3-VL-30B/32B/235B, Nemotron-12B-VL, GLM-4.6V, Pixtral-Large on *apple10k*. The 15-page attention.pdf killed every open-weight route (OR provider jitter) |
| **Not viable for our pipeline** | `llama-3.2-11b-vision` (returns 0 chars on `file` content-type), `ernie-4.5-vl-28b-a3b` (30K context ceiling), `arcee-ai/spotlight` (400 errors), `amazon/nova-lite-v1` (closed + 3× cost), `bytedance-seed/seed-1.6-flash` (0-char failures), `openai/gpt-5-nano` (flaky timeouts) |

**Current production default**: `openai/gpt-4.1-nano` primary → `google/gemini-3-flash-preview` fallback (shipped commit `10edc39`).

---

## Methodology

All runs used the same extraction prompt (compact Markdown, preserve headings + tables + inline/block math + code fences, no summary), `temperature=0`, `max_tokens=16000`. PDF sent via OpenRouter's `file` content-type so models with native PDF support (Gemini, Claude, GPT-5, Qwen3-VL) ingest the doc directly, others get OR-converted images.

Each model measured for:
- **chars** — raw character count of extracted markdown
- **headings** — count of `^#+\s` matches (section hierarchy preserved)
- **tables** — count of `|...|...|` rows (table fidelity)
- **eq_markers** — count of `$…$` / `\frac{}` / `\sqrt{}` / subscript-brace markers (LaTeX math recovery)
- **ms** — wall-clock latency from fetch-start to response
- **cost** — reported OR `usage.cost` in USD
- **license** — for open-weight self-host suitability

Higher structure score (headings + tables + equations) = better retrieval-chunk metadata.

---

## Results — closed-source baselines on `attention.pdf` (15 pages)

Quality + cost comparison that set our production default.

| Model | chars | ms | headings | tables? | eq markers | cost | weight |
|---|---|---|---|---|---|---|---|
| unpdf (no LLM) | 39,605 | **2,142** | **0** | ❌ | **0** | free | — |
| google/gemini-2.5-flash-lite | 44,361 | 6,011 | 24 | ✅ | 220 | ~$0.005 | closed |
| google/gemini-2.5-flash | 37,257 | 4,176 | 24 | ✅ | 15 (lazy) | ~$0.01 | closed |
| google/gemini-2.5-pro | 40,518 | 10,068 | **27** | ✅ | 18 (lazy) | ~$0.04 | closed |
| **google/gemini-3-flash-preview** | 42,046 | **5,576** | 26 | ✅ | 214 | ~$0.02 | closed |
| google/gemini-3.1-pro-preview | 39,419 | 9,502 | 25 | ✅ | 219 | ~$0.08 | closed |
| anthropic/claude-haiku-4.5 | 37,401 | 10,341 | **31** (most) | ✅ | 172 | ~$0.06 | closed |
| anthropic/claude-sonnet-4.6 | 38,722 | 10,332 | 26 | ✅ | 166 | ~$0.15 | closed |
| **openai/gpt-4.1-nano** | 34,636 | **2,143** | 19 | — | 109 | **$0.005** | closed |
| x-ai/grok-4-fast | 40,903 | **2,067** | 27 | ✅ | 46 | ~$0.008 | closed |
| qwen/qwen3-vl-8b-instruct (open) | 39,130 | 8,106 | 26 | ✅ | 194 | ~$0.008 | **open** (Apache 2.0) |
| mistralai/pixtral-large-2411 | — | timeout | — | — | — | — | open (Mistral Research) |
| qwen/qwen3-vl-32b / 235b | — | timeout | — | — | — | — | open |
| openai/gpt-4o-mini | 7,968 (truncated) | 4,936 | — | — | — | broken via OR | closed |
| google/gemini-3.1-flash-lite-preview | 11,091 (truncated) | 10,375 | 9 | ❌ | 40 | broken | closed |

---

## Results — cost-optimized closed-weight re-bench (`attention.pdf` + `apple-10k`)

After the user flagged cost concern for 5K pages/day workloads, re-benched the cheap end. Determined the production default.

### On `attention.pdf` (15 pages, mostly prose)

| Model | ms | chars | cost/doc |
|---|---|---|---|
| **openai/gpt-4.1-nano** 🥇 | 2,143 | 34,636 | **$0.0047** |
| google/gemini-2.5-flash-lite | 5,568 | 43,142 | $0.0050 |
| x-ai/grok-4-fast | 4,463 | 12,840 (truncated) | $0.0078 |
| google/gemini-2.5-flash | 4,848 | 41,421 | $0.0296 |
| google/gemini-3-flash-preview | 4,808 | 39,701 | $0.0358 |
| amazon/nova-lite-v1 | 7,788 | 21,485 | $0.0322 |
| bytedance-seed/seed-1.6-flash | — | 0 chars | failed |
| openai/gpt-5-nano | — | timeout | failed |

### On `apple-10k` (4 pages, table-dominant stress test)

| Model | ms | chars | cost/doc | notes |
|---|---|---|---|---|
| **openai/gpt-4.1-nano** 🥇 | 3,842 | 8,610 | **$0.0023** | clean markdown, all numerical data preserved |
| openai/gpt-5-nano | 2,913 | 8,894 | $0.0057 | worked here but failed on attention.pdf |
| google/gemini-2.5-flash-lite | 4,461 | **255,282** 🔥 | $0.0065 | **BLOAT**: 25× oversized tables |
| google/gemini-2.5-flash | 3,467 | **223,875** 🔥 | $0.0403 | **BLOAT** same pattern |
| openai/gpt-4.1-nano (compact prompt) | 3,842 | 8,610 | $0.0023 | no bloat |
| anthropic/claude-haiku-4.5 | 6,306 | 9,535 | ~$0.06 | clean |
| google/gemini-3-flash-preview | 4,291 | 10,402 | $0.0135 | clean |

Key negative finding: gemini-2.5-flash/flash-lite cannot be used on table-heavy PDFs — they emit padded tables with hundreds of spaces per cell. Prompt engineering doesn't fix it. Avoid regardless of price.

---

## Results — open-weight models for enterprise on-prem (April 21, 2026)

Goal: identify open-weight VLMs an enterprise customer can self-host on their own GPU via vLLM/SGLang, with Apache 2.0 or permissive licenses.

### Scoreboard on `apple-10k` (the only doc where OR's open-weight routes held up today)

| Rank | Model | h | tables | eq | ms | cost | license | self-host size |
|---|---|---|---|---|---|---|---|---|
| — | google/gemini-3-flash-preview (closed baseline) | 5 | 123 | 34 | 4,817 | $0.0134 | — | — |
| — | openai/gpt-4.1-nano (closed baseline) | 5 | 149 | 105 | 3,146 | $0.0025 | — | — |
| **🥇** | **z-ai/glm-4.6v** | **10** | **231** | **71** | 10,427 | $0.0155 | GLM (open-ish, commercial OK) | ~16 GB |
| 🥈 | **qwen/qwen3-vl-30b-a3b-instruct** | 8 | 125 | 34 | **3,912** | $0.0111 | **Apache 2.0** | ~20 GB (FP8, MoE) |
| 🥉 | qwen/qwen3-vl-235b-a22b-instruct | 8 | 125 | 34 | 4,063 | $0.0132 | Apache 2.0 | ~150 GB |
| 4 | mistralai/pixtral-large-2411 | 5 | 125 | 34 | 6,074 | $0.0448 | Mistral AI Research | ~250 GB |
| 5 | nvidia/nemotron-nano-12b-v2-vl | 5 | 125 | 34 | 10,627 | $0.0117 | NVIDIA Open | ~24 GB |
| 6 | qwen/qwen3-vl-32b-instruct | 5 | 125 | 34 | 5,797 | $0.0101 | Apache 2.0 | ~64 GB |

### Unreachable / unreliable on OpenRouter today

These may still be fine on self-hosted vLLM — failure here is OR-routing-specific, not a model verdict:
- **qwen/qwen3-vl-8b-instruct** — timeout today; *worked at 8.1s earlier in the session with 26 headings and 194 equations captured*
- qwen/qwen2.5-vl-72b-instruct — timeout (stale-gen anyway)
- **z-ai/glm-4.5v** — timeout (the v4.5; v4.6 works)
- meta-llama/llama-3.2-11b-vision-instruct — **returns 0 chars on PDF `file` input**; confirmed broken for our pipeline (would need image-per-page conversion, bypasses OR's convenience)
- nvidia/nemotron-nano-12b-v2-vl:free — rate-limit timeout (free tier, unusable at any volume)
- baidu/ernie-4.5-vl-28b-a3b — **30K context ceiling** cuts off any real-sized PDF; disqualified
- arcee-ai/spotlight — 400 errors on PDF input
- amazon/nova-2-lite-v1 — **closed weights**; also 3-4× cost of gpt-4.1-nano for same quality
- bytedance-seed/seed-1.6-flash — 0-char failures on attention; flaky on apple10k

---

## Results — 100-page stress test (GPT-4 tech report)

What happens when a user uploads a real long PDF.

| Path | Wall time | Chars | Structure | Cost | Notes |
|---|---|---|---|---|---|
| **unpdf (no LLM)** | **1.3s** | 284,610 | 0 headings | free | full text, no structure |
| Single-call `openai/gpt-4.1-nano` | 15s | 6,078 (2%) | — | $0.010 | **TRUNCATES** at ~10 output pages |
| Single-call `google/gemini-3-flash-preview` | 59s | 22,990 (8%) | — | ~$0.04 | **TRUNCATES** — model's own budget ceiling |
| Segmented (4 × 25 pages) `openai/gpt-4.1-nano` | 90.7s | 154,270 (54%) | 197 h, 223 rows | $0.024 | OR serializes calls — see latency doc |
| Segmented (4 × 25 pages) `google/gemini-3-flash-preview` | 75.5s | 231,305 (81%) | 112 h, 234 rows | $0.194 | best structure recovery |
| Concurrent embedding (`qwen3-emb-8b`, 4×128) | 9.1s wall | — | 505 chunks ready | $0.004 | after the concurrent-batch fix |

**Production path today**: `unpdf + concurrent embed` = **~9s end-to-end ingest** on 100-page docs. Vision path is opt-in (slower but preserves structure). See `KB_VISION_EXTRACTION_LATENCY.md` for why the vision path stays at ~75-90s despite segment parallelism (upstream provider per-key rate limits).

---

## Cost at scale — 5K pages/day projection

Assumes 15-page-doc equivalents.

| Option | $/page | $/month (5K pg/day) | notes |
|---|---|---|---|
| openai/gpt-4.1-nano (current prod) | $0.00031 | **$46** | shipped default |
| google/gemini-2.5-flash-lite | $0.00067 (safe on prose) | $101 | bloat risk on tables |
| google/gemini-3-flash-preview (quality tier) | $0.0024 | $362 | fallback when nano fails |
| anthropic/claude-sonnet-4.6 (premium) | $0.010 | $1,500 | reserved for highest-stakes docs |
| **Self-host qwen3-vl-30b-a3b / glm-4.6v** (on-prem) | **~$0.00009** | **~$13** (electricity + amortized GPU) | per HuggingFace / Modal estimates, A100-class GPU ~$0.09/1000 pages |

At real scale, self-hosted open-weight wins on cost by ~4-100× depending on the cloud baseline.

---

## Recommendations per use case

### Startup / small-org default (shipped today)
- **Extractor**: `openai/gpt-4.1-nano` primary, `google/gemini-3-flash-preview` fallback
- **Embedding**: `qwen/qwen3-embedding-8b` via OpenRouter (4096-dim, multilingual)
- **Total cost** at 5K pg/day: ~$50/month compute + ~$1/month embedding
- **Ingest latency**: ~5s for a 15-page doc, ~9s for a 100-page doc (via unpdf auto-fallback + concurrent batch embeddings)

### Enterprise / on-prem deployment (planned; see migration path below)
- **Extractor**: self-hosted `qwen/qwen3-vl-30b-a3b-instruct` via vLLM with FP8 quantization
  - Apache 2.0 license, no commercial friction
  - ~20 GB VRAM → fits on single A6000 / L40S
  - Matches gemini-3-flash-preview structural output
  - Alternative: `z-ai/glm-4.6v` (9B, ~16 GB VRAM) if table fidelity is the priority over heading hierarchy
- **Embedding**: self-hosted `qwen/qwen3-embedding-8b` via Text Embedding Inference (TEI) or equivalent
  - Same model as cloud path → zero-drift migration
- **Total cost**: dominated by GPU amortization; ~$0.09/1000 pages at A100-class hardware
- **Ingest latency**: 3-5s per 15-page doc when not sharing a key with thousands of other OpenRouter users — **true parallelism** via on-prem

### Migration path (no code change)
Our `VisionLlmExtractor` (`src/lib/rag/extractors/vision-llm-extractor.ts`) speaks the OpenAI-compatible chat/completions API. vLLM exposes that same API shape. For on-prem deployment, point `KB_EXTRACT_PRIMARY` at the customer's vLLM endpoint via a new `KB_EXTRACT_VISION_BASE_URL` env var. No Typescript changes needed — just config.

---

## Known OpenRouter limitations that affected these numbers

Documented in `KB_VISION_EXTRACTION_LATENCY.md`:

1. **Shared upstream provider keys**: OpenRouter multiplexes all users through a single OpenAI/Google key per model, so our 4 "parallel" segment calls actually queue behind each other at the upstream provider's TPM limit. Wall-clock on 100-page segmented extraction was 75-90s instead of the ~15-25s that direct-to-provider or BYOK would give.

2. **Provider availability jitter**: On April 21, 2026, *every* Qwen3-VL route failed on the 15-page attention.pdf despite succeeding on the shorter apple10k. This is an OR-side transient, not a model quality signal — self-hosted vLLM will not have this issue.

3. **Rate-limited free tiers**: The `:free` suffixes on OR are effectively unusable for any real benchmark (20 RPM or less). All open-weight candidates here were benched on paid endpoints.

4. **Per-call output ceiling**: Vision models truncate single-call output at ~30-40 pages of markdown regardless of `max_tokens` setting, because they hit internal generation budgets. This is why we ship segment-split extraction (25 pages per segment) via commit `4c00ba5`.

---

## Raw data

Every bench that produced these numbers is runnable from the repo:

- `tests/bench-kb/src/bench-extraction.ts` — initial SOTA audit (14 closed+open vision models on attention.pdf + apple10k)
- `tests/bench-kb/src/bench-extraction-cheap.ts` — cost-focused re-bench
- `tests/bench-kb/src/bench-open-weight-vision.ts` — open-weight enterprise pass (this doc's main source)
- `tests/bench-kb/src/bench-100page-latency.ts` — stress test on 100-page PDF
- `tests/bench-kb/src/bench-100page-segmented.ts` — validates the shipped segment-split fix

Raw JSONs in `tests/bench-kb/results/extraction*/*.json` (local, gitignored).

---

*Captured 2026-04-21. Reflects the shipped state of the KB pipeline: Phase 1–8 complete, concurrent-batch embedding + parallel segment extraction merged. See `docs/superpowers/specs/2026-04-20-kb-document-intelligence-sota-audit.md` for the full audit spec and `KB_VISION_EXTRACTION_LATENCY.md` for the related latency root-cause doc.*
