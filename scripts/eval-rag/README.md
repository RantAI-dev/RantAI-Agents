# RAG eval harness

Phase 1 of the SOTA roadmap. Measures retrieval quality across a curated golden set so quality-affecting changes (intent classifier, query decomposition, reranker tuning, embedding model swap) can be evaluated with numbers instead of vibes.

## What it does today

- **`generate-candidates.ts`** — reads documents in the DB and emits a candidate golden set (lookup / enumerate / followup queries per doc, plus out-of-scope canaries). Output: `tests/fixtures/rag-golden-seed.json` for human curation.
- **`run.ts`** — runs the retrieval pipeline (hybrid → vector fallback) against a curated `tests/fixtures/rag-golden.json` and emits a per-run report in `eval-runs/<timestamp>.json`. Prints per-query result + aggregate to stdout.
- **`lib/metrics.ts`** — pure scoring: context recall, expected-doc hits, latency p50/p95.
- **`lib/types.ts`** — golden-set + run-report TypeScript types.

## What it does not do yet

- A/B compare tool (just `diff` two `eval-runs/*.json` for now)
- CI integration

These are additive on top of the current scaffold. The shape is settled.

## LLM-as-judge faithfulness

`bun scripts/eval-rag/run.ts --with-llm-judge` flips into the expensive mode:

1. Retrieval same as the base run
2. For each query with non-zero chunks: generate an answer using only the retrieved chunks (small fast model — `KB_EVAL_JUDGE_MODEL` env, defaults to `openai/gpt-4.1-nano`)
3. Pass `(question, answer, context)` to the same judge model and ask for a 0..1 faithfulness score with a one-line reason

The summary line gains a `faithfulness (avg): X%` row. Per-query `answerText` + `faithfulness` + `faithfulnessReason` land in `eval-runs/<runId>.json`.

**Cost note**: each judged query is ~2 LLM calls (generate + judge). A 50-entry golden set ≈ 100 model invocations of a cheap small model. Budget accordingly.

## Workflow

```bash
# 1. Seed candidates from your DB (filter by group if you want)
bun scripts/eval-rag/generate-candidates.ts <psak-group-id>

# 2. Hand-curate the seed → golden set
#    - trim entries you don't care about
#    - fill expectedDocs for `enumerate` entries (the full doc list per group)
#    - sanity-check the followup `priorTurns`
mv tests/fixtures/rag-golden-seed.json tests/fixtures/rag-golden.json
$EDITOR tests/fixtures/rag-golden.json

# 3. Baseline measurement
bun scripts/eval-rag/run.ts

# 4. Make a change → re-run → diff the eval-runs/ files
bun scripts/eval-rag/run.ts
diff eval-runs/<before>.json eval-runs/<after>.json
```

## Schema

See `lib/types.ts`. A golden set entry looks like:

```json
{
  "id": "lookup-en-psak-113",
  "query": "What is PSAK 113 about?",
  "kind": "lookup",
  "expectedDocs": ["PSAK 113"],
  "knowledgeBaseGroupIds": ["<group-id>"],
  "notes": "factual lookup against PSAK group"
}
```

Kinds: `lookup`, `enumerate`, `compare`, `followup`, `oos`.

## What "good" looks like (interim targets — refine after baseline)

- **context_recall ≥ 0.85** averaged across non-oos entries
- **retrieval p95 ≤ 1500ms** (will improve when embedding model swap lands)
- **0 errored queries** on a healthy KB
