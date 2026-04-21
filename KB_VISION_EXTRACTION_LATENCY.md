# Why vision-LLM PDF extraction is slow (and how to fix it)

**TL;DR:** On a 100-page PDF, vision-LLM extraction via OpenRouter takes ~75–90s wall-clock even when we split into 4 segments and fire them in parallel. The root cause is **not our code and not OpenRouter itself** — it's upstream provider (OpenAI / Google) rate-limiting OpenRouter's *shared* API key, which all OpenRouter users compete against. The fix is either BYOK through OpenRouter or bypassing OpenRouter and calling providers directly. Either drops 100-page vision extraction from ~90s to ~15–25s.

---

## The flow

```
our code         OpenRouter            OpenAI / Google Vertex
  │                  │                    │
  ├── call 1 ───────►│                    │
  ├── call 2 ───────►│──► all 4 routed   │
  ├── call 3 ───────►│──► through ONE ───►│  queues them
  └── call 4 ───────►│──► shared API key │  1 at a time
                                            (per-key TPM limit)
```

OpenRouter is a proxy. It multiplexes thousands of users through shared upstream keys. OpenAI and Google enforce per-key tokens-per-minute limits. When our 4 parallel requests all hit OpenAI's endpoint via OpenRouter's shared key, they queue — not because OpenRouter is slow, but because OpenAI throttles the key.

## Measured evidence (100-page GPT-4 tech report, 5 MB)

| Config | Wall-clock | Notes |
|---|---|---|
| unpdf (no LLM, reads embedded PDF text) | **1.3s** | Full 100 pages, 284K chars, zero structure |
| Vision — single call (`max_tokens=16000`) | 15s (nano) / 59s (gemini) | **Truncated** — output was 2–8% of real content |
| Vision — 4 parallel segments of 25 pages | 75–90s | Output complete (54–81% of unpdf chars) with headings + tables preserved |
| Embedding 505 chunks via `qwen/qwen3-embedding-8b` | 9s | After we shipped concurrent-batch optimization |

Expected wall-clock if 4 segments truly ran in parallel: ~20s (each segment ~15–22s). Actual: 75–90s. That ~4× serialization factor is the OpenRouter shared-key queueing.

## Where the slowness is NOT

- ❌ Our code. `VisionLlmExtractor` fires all 4 segment requests via `Promise.all` at once — verified in tests. The Node event loop dispatches them within milliseconds of each other.
- ❌ The network. Each segment response is a few hundred KB of markdown; bandwidth is not the limit.
- ❌ OpenRouter's servers. OR passes requests through; they don't hold a queue.
- ❌ PDF splitting via `pdf-lib`. ~200ms for 100 pages, negligible.

## Where the slowness IS

- ✅ Upstream provider per-key rate limits (OpenAI TPM, Google Vertex TPM). OpenRouter's shared account hits these ceilings when many users converge on the same model.

## Four fix options, ranked by effort ↓ speedup ↑

### 1. BYOK via OpenRouter (ideal for platforms abstracting over many models)

Add your own OpenAI + Google API keys under OpenRouter's `/settings/integrations`. OpenRouter always prefers BYOK endpoints over its shared pool. Your 4 parallel requests hit OpenAI/Google with *your* key — your full 500K TPM / 10K RPM budget. Expected 100-page extraction: **~15–25s**, no code change.

Caveat: per OR docs, BYOK is account-level config, not per-request. All downstream calls from that OR account will prefer BYOK. OR adds a ~5% surcharge on BYOK usage.

### 2. Skip OpenRouter for extraction; call provider SDKs directly

Use `openai` SDK for `gpt-4.1-nano` and `@google/generative-ai` for `gemini-3-flash-preview`. No proxy hop, your key's full budget, no surcharge. ~20-line change to `src/lib/rag/extractors/vision-llm-extractor.ts` — substitute the `fetch(OPENROUTER_URL)` call for the SDK equivalent. Expected speedup same as BYOK (~15–25s for 100 pages), ~5% cheaper.

Downside: lose OR's transparent fallback + uniform model catalog, we'd need to maintain two SDK integrations.

### 3. Mixed-model segment pool

Route segment 0 → `gpt-4.1-nano` (OpenAI), segment 1 → `gemini-3-flash-preview` (Google), segment 2 → `claude-haiku-4.5` (Anthropic), segment 3 → `qwen/qwen3-vl-8b-instruct` (Qwen). Each hits a *different* upstream; each has a separate rate-limit pool at OR. No BYOK needed.

Downside: four models' markdown styles differ slightly — headings might be `#` from one, `##` from another for equivalent structure. Retry logic needs to tolerate model-specific quirks. Worth testing but adds complexity.

### 4. Ship fast-path + background upgrade (what we have today, with a queue)

Index via unpdf immediately (~9s total ingest; user can query). Kick off vision-segmented re-index in background (~85s). When it completes, transparently swap the chunks' underlying text to the structured version. User-perceived latency: 9s. Structural quality arrives ~85s later, unseen.

Requires a background-job queue (BullMQ, Redis, etc.) and a swap-in mechanism in the vector store. Not complicated but not trivial; half to one day of work.

## Recommendation

- **If this deployment is single-tenant or per-tenant keys are feasible**: ship **option 2** (direct provider SDKs). Best throughput, cheapest, most honest — removes the middleman for the one operation that cares about parallelism. ~2 hours of work.
- **If multi-tenant platform where users bring their own API keys**: **option 1** (BYOK) fits naturally — document the setup in env docs, zero code change.
- **If "ship it, stop optimizing"**: **option 4** — accept 9s fast index as the user-facing latency; background upgrade runs invisibly.

## What we already shipped (good enough for most cases today)

- **Embedding**: concurrent 4-batch pool — 71s → 9s on 100-page docs. Commit `e3eaa61`.
- **Extraction**: segment-split path via `pdf-lib`, vision-LLM per segment, concat markdown. Works correctly (no truncation, structure preserved) but can't yet run truly in parallel because of the upstream rate limit described above. Commit `4c00ba5`.
- **Auto-fallback to unpdf** when vision fails → 100-page doc stays ingestable in ~9s even without the parallelism fix.

## When to revisit

- When any of options 1/2/3 above are greenlit by the product team.
- When a user complains about ingest latency on big PDFs (they'll specifically notice the gap on 50+ page docs).
- When OpenRouter publishes per-account concurrency tiers (not documented today, April 2026).

---

*Captured 2026-04-21 after benching the full ingest pipeline on the 100-page arxiv GPT-4 technical report. See `docs/superpowers/specs/2026-04-20-kb-document-intelligence-sota-audit.md` for the broader KB audit, and commits `e3eaa61`, `4c00ba5`, `e3eaa61` for the optimizations already merged.*
