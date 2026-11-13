# Port ledger: RantAI-Agents (TypeScript) to Rust

Reason and target number: lighter footprint, targets in `plan.md` §0. Oracle:
`bun port/oracle/<module>.ts < port/cases/<module>.in.jsonl` (not built yet). Base commit: OSS
`e744680c`, cloud `1ffcad9`.

Status is one of: todo, oracle ready, in progress, parity green, shadowed, cut over, old code deleted.
Paths are relative to `src/` in this repository; paths starting with `apps/cloud/` are in agents-cloud.

## Phase A: pure leaves

| Module (old path) | New path | Depends on | Case file | Cases | Status | Differences |
|---|---|---|---|---|---|---|
| `lib/memory/fact-keys.ts` | `rust/crates/agents-core/src/memory/fact_keys.rs` | none | `port/cases/memory-fact-keys.jsonl` | 0 | todo | |
| `lib/memory/long-term-memory.ts` (merge, collapse, apply, forget, fingerprint, `summaryNeedsRefresh`) | `agents-core/src/memory/profile.rs` | fact-keys | `memory-profile.jsonl` | 0 | todo | |
| `lib/memory/long-term-memory.ts` (`extractPermanentFacts`, `extractPreferences`) | `agents-core/src/memory/extract_profile.rs` | none | `memory-extract-profile.jsonl` | 0 | todo | regex dialect |
| `lib/memory/working-memory.ts` (`extractEntities`, `extractFacts`, `detectContext`) | `agents-core/src/memory/extract_working.rs` | none | `memory-extract-working.jsonl` | 0 | todo | regex dialect |
| `lib/memory/*` `format*ForPrompt`, `index.ts` `buildPromptWithMemory`, `getMemoryStats` | `agents-core/src/memory/prompt.rs` | profile | `memory-prompt.jsonl` | 0 | todo | `toLocaleDateString` |
| `lib/memory/memory-tools.ts` (`toFacts`, `toPreferences`, `toEntities`, forget criteria, result messages) | `agents-core/src/memory/tools.rs` | profile | `memory-tools.jsonl` | 0 | todo | |
| `features/assistants/core/completeness.ts` | `agents-core/src/assistants/completeness.rs` | none | `assistants-completeness.jsonl` | 0 | todo | |
| `features/assistants/core/service.ts` (field copy, built-in whitelist, `toNullableJson*`) | `agents-core/src/assistants/update.rs` | none | `assistants-update.jsonl` | 0 | todo | |
| `features/assistants/bindings/service.ts:74-80` (hidden-tool merge) | `agents-core/src/assistants/bindings.rs` | none | `assistants-bindings.jsonl` | 0 | todo | |
| `features/assistants/wizard/{tools,service}.ts` (`filterKnownIds`, `buildWizardSystemPrompt`, `sanitizeProposal`) | `agents-core/src/assistants/wizard.rs` | none | `assistants-wizard.jsonl` | 0 | todo | |
| `apps/cloud/src/lib/model-policy.ts`, `lib/plans.ts`, `lib/llm/house-models.ts` | `agents-core/src/plans.rs` (or a cloud crate, per decision 2) | none | `plans.jsonl` | 0 | todo | |
| `lib/prompts/{guard-rails,variables,response-format,instructions}.ts` | `agents-core/src/prompts/` | none | `prompts.jsonl` | 0 | todo | |
| `lib/llm/script-guard.ts` (predicates) | `agents-core/src/chat/script_guard.rs` | none | `script-guard.jsonl` | 0 | todo | `\p{…}` classes |
| `features/chat-public/step-budget.ts` | `agents-core/src/chat/step_budget.rs` | none | `step-budget.jsonl` | 0 | todo | env parsing |
| `features/conversations/sessions/session-sync.ts` | `agents-core/src/chat/session_sync.rs` | none | `session-sync.jsonl` | 0 | todo | |
| `features/chat-public/service.ts:139,189,352` (`sanitizeEditHistory`, `buildPersistedUserRow`, content→parts) | `agents-core/src/chat/messages.rs` | none | `chat-messages.jsonl` | 0 | todo | |
| `lib/tools/approval.ts` (`resolveToolApprovalMode`, `toolNeedsApproval`) | `agents-core/src/tools/approval.rs` | none | `tool-approval.jsonl` | 0 | todo | |
| `features/agent-api/{response,service}.ts` (OpenAI chunk framing, `estimateTokens`, `fitContext`) | `agents-contracts/src/openai.rs` | none | `agent-api-framing.jsonl` | 0 | todo | JSON number format |

## Phases B–D: services

| Surface (old path) | New path | Depends on | Case file | Cases | Status | Differences |
|---|---|---|---|---|---|---|
| `app/api/assistants/**` and the cloud overrides, `/api/user/default-assistant`, `/api/mobile/assistants/**` | `agents-api/src/assistants/` | Phase A assistants rows, `agents-auth`, `agents-store` | `port/cases/http/assistants.jsonl` | 0 | todo | |
| `app/api/assistants/wizard/stream` | `agents-api/src/assistants/wizard.rs` | `agents-llm`, the UI-stream encoder | `http/wizard-stream.jsonl` | 0 | todo | |
| `app/api/dashboard/memory/**`, `/api/mobile/memories/**` | `agents-api/src/memory/` | Phase A memory rows, `agents-store` | `http/memory.jsonl` | 0 | todo | |
| Memory store: `UserMemory` rows, SurrealDB `conversation_memory`, `lib/rag/embeddings.ts` | `agents-store/src/memory/` | none | `http/memory-drain.jsonl` | 0 | todo | per-user lock (see plan Phase C) |
| `app/api/dashboard/chat/sessions/**` | `agents-api/src/sessions/` | `agents-store` | `http/sessions.jsonl` | 0 | todo | |
| `POST /api/chat`, plain capability (D2) | `agents-api/src/chat/` | everything above, `agents-llm` | `http/chat-plain.jsonl` | 0 | todo | |
| `POST /api/chat` with tools and the approval gate (D3) | `agents-api/src/chat/tools/` | D2 | `http/chat-tools.jsonl` | 0 | todo | shared approval store |
| `POST /api/chat` with KB, RAG and attachments (D4) | `agents-api/src/chat/rag/` | D2 | `http/chat-rag.jsonl` | 0 | todo | |
| Widget, mobile, `/v1/chat/completions`, Socket.io `api:chat` (D5) | `agents-api/src/chat/entry/` | D2–D4 | `http/chat-entry.jsonl` | 0 | todo | |

Rules: a row moves to "parity green" only on the output of `scripts/check.sh`. Nobody ports a module
whose dependencies are not yet "parity green". No feature work lands in a module that is "in progress".
