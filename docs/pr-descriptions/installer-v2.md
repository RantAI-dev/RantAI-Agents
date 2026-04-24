# Installer v2 — Profile-aware with sidecar support

## Why

The installer was last updated 2026-04-01 and drifted from the platform:

- Stale `.env` template wrote `OCR_PROVIDER=ollama` / `OCR_MODEL=glm-ocr` which the app no longer reads in that shape. Did not write any `KB_*` keys.
- Also wrote wrong names for runtime vars: `VECTOR_DB_URL` (app reads `SURREAL_DB_URL`), `S3_ACCESS_KEY` (app reads `S3_ACCESS_KEY_ID`), `CODE_INTERPRETER_URL` (app reads `PISTON_URL`).
- No awareness of the MinerU or rerank GPU sidecars — operators had to hand-install those plus hand-edit `.env`.
- Single-host assumed; no story for cross-machine deployment (app server + GPU box).

## What this adds

- **InstallProfile axis** — AppOnly / SidecarOnly / AllInOne, orthogonal to InstallMode.
- **`.env` template overhaul** — all current `KB_EXTRACT_*`, `KB_EMBEDDING_*`, `KB_RERANK_*`, `KB_HYBRID_BM25_*`, `KB_CONTEXTUAL_RETRIEVAL_*`, `KB_QUERY_EXPANSION_*` keys. Correct runtime key names for SurrealDB, S3, Piston. Legacy OCR_* removed, per-task OCR model keys added. Twilio keys present but commented (optional).
- **Profile picker UI** — new `Screen::ProfileSelect` between Welcome and ModeSelect.
- **Profile-aware config screen** — SidecarOnly hides DB/auth, AppOnly asks for sidecar URLs, AllInOne shows everything.
- **`Phase::SidecarInstall`** — new phase between Services and Verification. Runs venv creation + pip install + HF model pre-download + systemd unit install.
- **Preflight GPU + Python check** — only runs when profile includes sidecars.
- **Config validation** — rejects malformed sidecar URLs, absurd GPU device IDs.
- **Verify `/health`** — confirms both sidecars respond after install.
- **Complete screen** — prints paste-ready `KB_*` URL lines for cross-machine hand-off.
- **Sidecar requirements.txt** — `services/mineru-server/requirements.txt` and `services/rerank-server/requirements.txt` pin the glue deps.
- **README cross-links** — both sidecar READMEs now point at the installer as the recommended path.

## Benchmark context

Default rerank model is `nvidia/llama-nemotron-rerank-1b-v2` based on the 2026-04-24 bench at `docs/artifact-plans/reranker-bench-2026-04-24.md`: within 1 pt of Cohere v4-pro on hit@1, 2.6× faster, $0/query.

## Tests

- 26 unit / integration tests (+15 from Phase A/B/C/D — profile types, phase skipping, env template key coverage, config field assembly, validation; +4 sidecar unit file coverage; +7 existing).
- All tests pass: `cd installer && cargo test` → 26 passed.
- Clippy clean: `cargo clippy --release -- -D warnings`.
- Format clean: `cargo fmt --check`.

## Manual verification (to run before merge)

1. **SidecarOnly on GPU box** — walk through installer, confirm GPU preflight passes, `rantai-agents-mineru.service` + `rantai-agents-rerank.service` start, `/health` on both endpoints returns 200.
2. **AppOnly pointing at GPU box** — walk through installer, set sidecar base URLs to the GPU box hostname, confirm `.env` has the right URLs and no OCR_PROVIDER, confirm chat + KB upload work end-to-end with remote sidecars.
