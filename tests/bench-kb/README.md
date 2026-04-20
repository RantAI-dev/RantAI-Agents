# tests/bench-kb — KB Pipeline SOTA Benchmark

The evidence harness that produced the numbers in
[`docs/superpowers/specs/2026-04-20-kb-document-intelligence-sota-audit.md`](../../docs/superpowers/specs/2026-04-20-kb-document-intelligence-sota-audit.md).

**Standalone** — does not require the app's Postgres or SurrealDB. Only calls OpenRouter.

## Quick run

```bash
export OPENROUTER_API_KEY=<key>

# Fetch the corpus (first time only — docs are NOT committed)
curl -sL -o tests/bench-kb/corpus/attention.pdf https://arxiv.org/pdf/1706.03762
curl -sL -o tests/bench-kb/corpus/apple-10k-excerpt.pdf "https://www.apple.com/newsroom/pdfs/fy2024-q4/FY24_Q4_Consolidated_Financial_Statements.pdf"
curl -sL -o tests/bench-kb/corpus/mdn-fetch.html "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch"
curl -sL -o tests/bench-kb/corpus/w3c-webauthn.html "https://www.w3.org/TR/webauthn-2/"
# Add a Bahasa markdown if you want the ID signal — any `.md` file in corpus/ works.

# Ingest corpus through current chunker
bun tests/bench-kb/src/prepare-corpus.ts

# Generate Q/A if results/qa.json missing (one-shot; costs ~$0.05)
bun tests/bench-kb/src/generate-qa.ts

# Then run each layer
bun run bench:kb:extraction
bun run bench:kb:embedding
bun run bench:kb:rerank
bun run bench:kb:e2e
```

Results are written to `tests/bench-kb/results/` (gitignored).

## CI smoke bench

```bash
bun run bench:kb:smoke
```

Uses `results/corpus-unpdf.json` + first 10 Q/A from `results/qa.json`. Enforces:
- `hit@1 >= 0.85`
- `recall@5 >= 0.95`

Exits non-zero on regression. ~90s + \~\$0.05 per run.

## Why not in vitest?

These benches hit real OpenRouter APIs (slow + cost money). Unit tests in `tests/unit/rag/` cover the code paths with mocked fetch; these benches measure the real stack end-to-end.
