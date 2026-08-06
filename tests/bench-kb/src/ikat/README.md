# IKAT-Bench

*Indonesian Curriculum Adaptive Tutoring benchmark* — measuring not just **which**
figure a multimodal RAG system retrieves, but **where** it lands in the generated
explanation.

Research artifacts: [`docs/paper/`](../../../../../../docs/paper/) — manuscript,
related-work positioning, benchmark design, and the full experiment log
(every run, including the discarded ones).

## Why

Multimodal RAG is evaluated almost entirely on retrieval. A tutoring system that
shows textbook figures is judged on a second axis too: a correct figure in the
wrong place still fails the reader. Layout parsers already emit each figure at its
position in the document's reading order — and standard ingestion discards that
ordering, forcing placement to be re-predicted at query time.

Measured on this corpus: only **19.3% / 34.3%** of figures carry a printed caption
(the signal caption-matching depends on), while **100%** carry a recoverable
reading-order anchor.

## Layout

```
ikat/
  extract-corpus.ts       hosted OCR -> raw cache, inline figure markers preserved
  build-corpus.ts         page markdown -> ordered blocks -> anchored chunks
  generate-questions.ts   4 question types; figure-dependent adversarially filtered
  systems.ts              S0 text-only, S1 caption-match, S2 co-embedding,
                          S4 anchor, S5 anchor+VLM, S6 anchor+description hybrid
  run-bench.ts            scores every system; writes results/summary/diagnostics
  structural-analysis.ts  A1-A5: corpus analyses that need NO model at all
  render-results.ts       summary JSON -> manuscript tables (never hand-copied)
  providers.ts            openrouter | mistral | ugm (ollama + TEI) backends
  env.ts                  minimal .env loader
  ugm/                    scripts that run INSIDE the on-premise container
    ugm-extract.py          MinerU extraction (needs the sidecar anchor patch)
    ugm-build.py            anchored corpus build, next to the crops
    validate-filter.py      positive + negative control for the adversarial filter
../judge.ts               LLM-as-judge with bias controls enforced in code
../placement-metrics.ts   PD, PA@k, Grounded Figure F1
```

Unit tests: `tests/unit/placement-metrics.test.ts`, `tests/unit/judge.test.ts`.

## Metrics

- **Selection F1** — the right figures, ignoring position.
- **PA@k** — of the *correctly selected* figures, the fraction landing within k
  sentences of ideal. Conditioning on correct selection is what isolates placement
  from retrieval.
- **Grounded Figure F1** — the headline. A figure counts only if it is the right
  figure **and** in the right place.

Ground truth for placement is **structural**: the source document's own reading
order. A textbook places its figures where they belong, so no human scoring is
needed — which is what allows this benchmark to be corpus-sized rather than
annotation-budget-sized.

**Vacuity rule:** a question with no gold figure where none was emitted scores
`null`, not 0. Scoring it 0 measures the question mix rather than the system.

**Answer length is part of the metric's context.** A displacement metric is bounded
by the number of insertion slots, so a one-sentence answer makes every system look
perfect. Median answer length is reported with every placement number. See the
experiment log, run `ugm-v1`.

## Running

```bash
# 1. corpus
bun src/ikat/extract-corpus.ts        # idempotent, caches raw OCR
bun src/ikat/build-corpus.ts

# 2. analyses that need no API, no judge, no GPU
IKAT_CORPUS=built bun src/ikat/structural-analysis.ts

# 3. questions
bun src/ikat/generate-questions.ts --per-doc 6

# 4. scored run
bun src/ikat/run-bench.ts --run v1 --judge 0 --systems text_only,caption_match,co_embed,anchor

# 5. tables
bun src/ikat/render-results.ts v1
```

### On-premise (free, no hosted API)

```bash
IKAT_PROVIDER=ugm \
IKAT_OLLAMA_BASE=http://ollama:11434 \
IKAT_TEI_BASE=http://tei-embed:80 \
IKAT_CORPUS=ugm-built IKAT_FIGURES=ugm-figures IKAT_QUESTIONS=questions-ugm.json \
bun src/ikat/run-bench.ts --run ugm --judge 0
```

`--judge 0` disables every judged measure. The structural metrics are model-free,
so the headline results still come out with no API credit at all.

## Environment

| Variable | Meaning |
|---|---|
| `IKAT_PROVIDER` | `openrouter` \| `mistral` \| `ugm` |
| `IKAT_CORPUS` / `IKAT_FIGURES` / `IKAT_QUESTIONS` | select which corpus to use — the extraction paths produce non-interchangeable figure ids and must never be pooled |
| `IKAT_GEN_MODEL` / `IKAT_EMBED_MODEL` / `IKAT_DESCRIBE_MODEL` | models under test |
| `IKAT_EMBED_DELAY_MS` | pacing for rate-limited providers |

## Judge independence

The judge must not share a vendor with any system under test —
`assertJudgeIndependence` **throws** rather than leaving it to reviewer trust.
With an Anthropic judge, no Anthropic model may appear among the generators.
Pairwise judging runs in both orders and reports the position-bias flip rate;
every judgement is repeated and its agreement rate carried through.

A judge validated only against itself is circular. `HUMAN_SPOTCHECK_NOTE` states
that residual risk in every diagnostics file, and a unit test asserts it is still
there.

## Corpus artifacts are not committed

`corpus/raw`, `corpus/figures`, `corpus/built`, `corpus/ugm-*`, `corpus/results`
and `corpus/embed-cache` are gitignored — large, and fully regenerable from the
scripts above. The PDFs are public Kemendikbud titles fetched from the publisher.
