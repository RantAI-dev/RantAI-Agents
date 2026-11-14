# Port ledger: RantAI-Agents (TypeScript) to Rust

Reason and target number: lighter footprint, targets in `plan.md` §0. Oracle:
`bun port/oracle/<module>.ts` (built for `auth` and `memory`; memory reads
`port/cases/memory.in.jsonl` on stdin). Base commit: OSS `e744680c`, cloud `1ffcad9`.

Status is one of: todo, oracle ready, in progress, parity green, shadowed, cut over, old code deleted.
Paths are relative to `src/` in this repository; paths starting with `apps/cloud/` are in agents-cloud.

## Phase A: pure leaves

| Module (old path) | New path | Depends on | Case file | Cases | Status | Differences |
|---|---|---|---|---|---|---|
| `lib/memory/fact-keys.ts` | `rust/crates/agents-core/src/memory/fact_keys.rs` | none | `port/cases/memory.jsonl` | 130 | parity green | JS string semantics (`trim`, UTF-16 length) |
| `lib/memory/long-term-memory.ts` (merge, collapse, apply, forget, fingerprint, `summaryNeedsRefresh`) | `agents-core/src/memory/profile.rs` | fact-keys | `port/cases/memory.jsonl` | 77 | parity green | |
| `lib/memory/long-term-memory.ts` (`extractPermanentFacts`, `extractPreferences`) | not ported | — | — | 0 | out of scope | differences.md row 3 |
| `lib/memory/working-memory.ts` (`extractEntities`, `extractFacts`, `detectContext`) | not ported | — | — | 0 | out of scope | differences.md row 3 |
| `lib/memory/*` `format*ForPrompt`, `index.ts` `buildPromptWithMemory` | `agents-core/src/memory/prompt.rs` | profile | `port/cases/memory.jsonl` | 19 | parity green | `toLocaleDateString` -> ISO (row 5) |
| `lib/memory/memory-tools.ts` (`toFacts`, `toPreferences`, `toEntities`, forget criteria, result messages) | `agents-core/src/memory/tools.rs` | profile | `port/cases/memory.jsonl` | 32 | parity green | TC-1548 (row 4), working memory out of scope (row 3) |
| `features/assistants/core/completeness.ts` | `agents-core/src/assistant/completeness.rs` | none | `port/cases/assistants.jsonl` | 45 | parity green | UTF-16 lengths, JS `trim` |
| `features/assistants/core/schema.ts` + `service.ts` (create/update validation, field paths, the JSON configs the old code took as `z.unknown()`, the built-in field whitelist: `AssistantUpdate::for_built_in`) | `agents-core/src/assistant/input.rs` (`AssistantCreate`/`AssistantUpdate`, `validate_create`, `validate_update`) | config | `port/cases/assistants.jsonl` | 72 | parity green | config validation (differences 28) |
| `features/assistants/core/service.ts` + `bindings/service.ts` + `default/*` (access checks) | `agents-core/src/assistant/access.rs` (`can`) | org | `port/cases/assistants.jsonl` | 42 | parity green | built-ins read-only (25), binding role (26), per-org default (27) |
| `features/assistants/bindings/service.ts:74-80` (hidden-tool merge) | `agents-core/src/assistant/bindings.rs` | none | `port/cases/assistants.jsonl` | 9 | parity green | |
| `features/assistants/wizard/{tools,service}.ts` (`filterKnownIds`, `buildWizardSystemPrompt`, `sanitizeProposal`) | `agents-core/src/assistant/wizard.rs` | none | `port/cases/assistants.jsonl` | 12 | parity green | model/plan logic not ported (29) |
| `apps/cloud/src/lib/model-policy.ts`, `lib/plans.ts`, `lib/llm/house-models.ts` | `agents-core/src/plans.rs` (or a cloud crate, per decision 2) | none | `plans.jsonl` | 0 | todo | |
| `lib/prompts/{guard-rails,variables,response-format,instructions}.ts` (guard rails, variables, response format, tool instruction, live-chat handoff) | `agents-core/src/prompt/{guard_rails,variables,response_format,instructions}.rs` | config, memory text | `port/cases/assistants.jsonl` | 63 | parity green | clock variables print ISO (31); artifact tables stay with the caller (30) |
| `lib/llm/script-guard.ts` (predicates) | `agents-core/src/chat/script_guard.rs` | none | `script-guard.jsonl` | 0 | todo | `\p{…}` classes |
| `features/chat-public/step-budget.ts` | `agents-core/src/chat/step_budget.rs` | none | `step-budget.jsonl` | 0 | todo | env parsing |
| `features/conversations/sessions/session-sync.ts` | `agents-core/src/chat/session_sync.rs` | none | `session-sync.jsonl` | 0 | todo | |
| `features/chat-public/service.ts:139,189,352` (`sanitizeEditHistory`, `buildPersistedUserRow`, content→parts) | `agents-core/src/chat/messages.rs` | none | `chat-messages.jsonl` | 0 | todo | |
| `lib/tools/approval.ts` (`resolveToolApprovalMode`, `toolNeedsApproval`, the exempt set) | `agents-core/src/prompt/approval.rs` | config | `port/cases/assistants.jsonl` | 20 | parity green | pending decisions move to a store (row 2) |
| `features/agent-api/response.ts` (OpenAI chunk and body framing; `estimateTokens`, `fitContext` in `service.ts` still todo) | `agents-contracts/src/openai.rs` | none | `port/cases/streams.jsonl` (OpenAI kinds) | 31 | parity green (frame functions only; frame order, the figure feed and the error path are assembled in the test, and land with D5) | JSON number format: `retrieval_score` prints like JavaScript (`0`, not `0.0`) |
| The chat UI message stream: the AI SDK 6.0.39 chunk types, `JsonToSseTransformStream` framing, `UI_MESSAGE_STREAM_HEADERS`, the `X-Tool-Approval`/`X-RAG-Trace`/`X-Model-Fallback` headers and the legacy `sources` frame (`chat-public/service.ts`) | `agents-contracts/src/ui_stream.rs` | `openai.rs` (`RagSource`) | `port/cases/streams.jsonl` (ui kinds) | 47 | parity green (framing and escaping only) | sources frame replaced by `source-document` chunks before `finish` (differences.md row 32). The oracle's chunk objects are written by hand and only framed by the real `JsonToSseTransformStream`, so field order was checked by reading `ai` 6.0.39, not by the SDK. D2 must add a case that drives `streamText(...).toUIMessageStream()` with a mock model from `ai/test` |
| `lib/auth.ts` (session cookie), `lib/mobile-auth.ts` (Bearer JWT), `features/agent-api-keys/service.ts` (`rantai_sk_` keys), `features/widget/chat/service.ts` (`X-Widget-Api-Key`) | `agents-auth/src/{session,mobile,api_key,widget}.rs` | none | `port/cases/auth.jsonl` | 53 | parity green | a token without `exp` is refused, a session token encrypted with `A256GCM` is refused, an address outside a key's whitelist is `permission_denied` |

## Phases B–D: services

| Surface (old path) | New path | Depends on | Case file | Cases | Status | Differences |
|---|---|---|---|---|---|---|
| `lib/llm/provider.ts`, `lib/llm/house-models.ts`, the `streamText` call and the tool loop in `features/chat-public/service.ts` | `rust/crates/agents-llm/src/{provider,types,sse,client,agent_loop}.rs` | `agents-contracts` (the error codes) | `port/cases/http/chat-stream.jsonl` | 0 | in progress | 12, 13, 14, 15, 16 |
| `app/api/assistants/**` and the cloud overrides, `/api/user/default-assistant`, `/api/user/preferences`, `/api/mobile/assistants/**` | `agents-server/src/routes/assistants/` (+ `agents-server/src/policy.rs`, the binding reads in `agents-store/src/assistants.rs`) | Phase A assistants rows, `agents-auth`, `agents-store` | `agents-server/tests/assistant_routes.rs`, `agents-server/tests/user_preferences.rs` (contract) | 8 + 4 tests | in progress: built and tested (the preferences visibility check seen failing when removed); **not cut over** until the frontend moves with it | differences 33–45, 60, 64 |
| `app/api/assistants/wizard/stream` + `features/assistants/wizard/{service,tools,schema}.ts` | `agents-server/src/routes/assistants/wizard{,_bodies,_tools}.rs` (+ `WizardModel` in `agents-server/src/policy.rs`, the catalogue reads in `agents-store/src/catalog.rs`) | the Phase A wizard row, `agents-llm`, `agents-contracts::ui_stream`, `agents-store` | `agents-server/tests/wizard_stream.rs` (contract, against a stub model server) | 6 tests | in progress: built and tested (catalogue org filter and disconnect cancel seen failing when removed); **not cut over** | differences 29, 61–64 |
| `app/api/dashboard/memory/**`, `/api/mobile/memories/**` | `agents-server/src/routes/memory.rs` | agents-store, agents-auth | `agents-server/tests/memory_routes.rs` (contract) | 3 tests | in progress: built and tested; **not cut over** until chat is, because clearing SEMANTIC no longer reaches SurrealDB | differences 9–11 |
| Memory store: `UserMemory` rows, SurrealDB `conversation_memory`, `lib/rag/embeddings.ts` | `agents-store/src/memory/` | none | `http/memory-drain.jsonl` | 0 | todo | per-user lock (see plan Phase C) |
| `app/api/dashboard/chat/sessions/**` (D1) | `agents-server/src/routes/sessions.rs` (+ `sessions/bodies.rs`), `agents-store/src/sessions.rs` | `agents-store`, `agents-auth` | `agents-server/tests/session_routes.rs` (contract), `agents-store/tests/sessions.rs` | 14 tests | in progress: built and tested; **not cut over** until the frontend moves with it | differences 17–24 |
| `POST /api/chat`, plain capability (D2) | `agents-api/src/chat/` | everything above, `agents-llm` | `http/chat-plain.jsonl` | 0 | todo | |
| `POST /api/chat` with tools and the approval gate (D3) | `agents-api/src/chat/tools/` | D2 | `http/chat-tools.jsonl` | 0 | todo | shared approval store |
| `POST /api/chat` with KB, RAG and attachments (D4) | `agents-api/src/chat/rag/` | D2 | `http/chat-rag.jsonl` | 0 | todo | sources as chunks (differences.md row 32): **ships with the dashboard reader change**, or the dashboard loses its citations |
| Widget, mobile, `/v1/chat/completions`, Socket.io `api:chat` (D5) | `agents-api/src/chat/entry/` | D2–D4 | `http/chat-entry.jsonl` | 0 | todo | |

Rules: a row moves to "parity green" only on the output of `scripts/check.sh`. Nobody ports a module
whose dependencies are not yet "parity green". No feature work lands in a module that is "in progress".

## Shared server pieces

| Piece | Path | Status |
|---|---|---|
| Request auth (session cookie, mobile Bearer, suspension check every request) and active organisation | `agents-server/src/auth.rs` | built; tests in `memory_routes.rs`, seen failing with the suspension check removed |
| Standard error body, request id, JSON body extractor, 404 fallback | `agents-server/src/http/` | built |
| Store: assistants, bindings, defaults, orgs, users, memory, sessions | `agents-store` | built; integration tests seen failing with the CAS and the tenant filter removed; the sessions store was seen failing with its user filter removed |
