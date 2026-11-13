# Port plan: RantAI-Agents to Rust, starting with agent builder, chat and chat memory

Status: **approved 2026-11-14; in progress.** See the ledger for what is built.
Method: the `port-code` skill (`.agents/skills/port-code/SKILL.md`). The old
TypeScript is the specification, and a module is ported when a script says the
two implementations behave the same. Ledger: `docs/port/ledger.md`.
Deliberate differences: `docs/port/differences.md`.

## 0. Decisions (owner, 2026-11-14)

1. **Reason: make Agents lightweight.** The numbers that show it worked are measured on the same
   machine against the TypeScript server, both against the stubbed LLM in `perf/` of agents-cloud:

   | Metric | Target for `agents-server` |
   |---|---|
   | Resident memory, idle | under 50 MB |
   | Resident memory, 15 VUs of plain chat | under 150 MB |
   | Container image | under 50 MB |
   | Start to `/readyz` | under 1 s |
   | p95 time to first token, 15 VUs | no worse than TypeScript (ceiling 8 s, AGENTS.md §4 of agents-cloud) |

   TypeScript baseline, measured 2026-11-14 on the dev box (production build of `e744680c`,
   `NODE_ENV=production bun server.ts`, Postgres only, no traffic):

   | Metric | TypeScript today |
   |---|---|
   | Resident memory, idle after first request | 283 MB |
   | Resident memory, chat/assistants/memory routes loaded | 291 MB |
   | Start to first response | 4.35 s |
   | Resident memory under 15 VUs, image size, p95 TTFT | not measured yet (need the load harness from agents-cloud `perf/`) |
2. **The Rust code lives in the OSS repository** (`RantAI-Agents/rust/`). Cloud-only behaviour
   (credits, plans, house models) is injected through traits the cloud implements, mirroring
   today's `onUsage` and `modelOverride` hooks.
3. **Bugs are fixed in Rust, not first in TypeScript.** The port does not chase byte-for-byte
   parity: the old code is the *reference* for intended behaviour, and where it is not best
   practice (security, tenancy, validation, error shapes, API shape) the Rust version does it
   properly and records the change in `differences.md`. The UI may change with it: when a route
   group cuts over, the frontend is moved to the new API in the same slice.
4. **Chat cuts over by capability** (D2 plain, D3 tools, D4 RAG, D5 other entry points).
5. Workers: MiniMax M3.1 Flash (coding plan) and GLM 5.3 Flash, one slice each, gated by
   `scripts/check.sh`.

What "parity" means after decision 3: every slice has **contract tests** (HTTP status, `code`,
body shape, database effect) that pass against Rust. Cases are written from the old behaviour,
and each case that intentionally differs links its row in `differences.md`. The oracle scripts
in §2 are still used to *generate* cases for the pure functions, where old and new should agree.

## 1. Shape: a strangler, not a rewrite

```
browser / mobile / widget
        │
      Caddy ──── path rules ───► rust/  (axum, sqlx)   ← grows one route group at a time
        │                            │
        └──► Next.js (UI + BFF) ─────┴──► same Postgres (Prisma still owns migrations)
                                    └──► SurrealDB, S3, OpenRouter/MiniMax
```

- **Next.js stays** the UI, NextAuth's login flows, and every route not yet
  ported. Rust takes over route groups behind Caddy, one at a time.
- **The database does not move.** Prisma stays the owner of
  `apps/cloud/prisma/migrations`. Rust reads and writes the same tables with
  `sqlx`, and CI checks its queries against the migrated schema
  (`cargo sqlx prepare --check`). The table and column names, JSON column
  shapes, cuid ids, the `DashboardMessage.seq` BigInt and the JSON-as-*string*
  in `Message.metadata` are all part of the frozen outside (port-code step 1).
- **Auth is shared, not re-implemented.** Rust verifies what Next issues:
  - the NextAuth v5 session cookie, a JWE (`dir` + `A256CBC-HS512`, key from HKDF over `NEXTAUTH_SECRET` with the cookie name as salt)
  - the mobile HS256 Bearer JWT (`lib/mobile-auth.ts`)
  - `X-Widget-Api-Key`
  - `rantai_sk_…` keys

  Login, OAuth and sign-up stay in Next until a later phase.
- **Errors.** New Rust handlers use the standard body from `docs/conventions.md`
  only where the old route has no shape callers depend on. Where it does, the old
  body is kept byte for byte and listed in `differences.md`.

Proposed workspace (`rust/`, its own part in `scripts/check.sh`):

| Crate | Holds | I/O |
|---|---|---|
| `agents-core` | Ported pure functions: memory merge/normalise/format, assistant validation and completeness, prompt builders, script-guard, approval-mode resolution | none |
| `agents-contracts` | Request/response types, the AI SDK UI-stream frame types, `error_codes.rs` (from `@emit rust`) | none |
| `agents-store` | `sqlx` repositories for Assistant, its joins, `UserMemory`, `DashboardSession/Message`; the SurrealDB memory adapter | Postgres, SurrealDB |
| `agents-llm` | OpenAI-compatible streaming client (OpenRouter, MiniMax), tool-call loop, usage accounting | HTTP |
| `agents-auth` | NextAuth JWE and mobile JWT verification, org context | none |
| `agents-api` | axum routes and the composition root | all |

The boundary rule is that `core` and `contracts` depend on nothing with I/O.
A `cargo metadata` check enforces it, as `rantai-kb` does.

## 2. The oracles (built before any port)

| Level | Oracle | Case files | Parity test |
|---|---|---|---|
| **Pure functions** | `port/oracle/<module>.ts`: a Bun script that imports the old function, reads one JSON input per line, prints one JSON output per line | `port/cases/<module>.jsonl`, `input => expected`, generated by the oracle and never hand-typed | `rust/crates/agents-core/tests/parity_<module>.rs` reads the same file |
| **HTTP, non-streaming** (assistants, memory, sessions) | `tests/contract/` (already in `.agents/protected-paths`): a black-box suite driven by a base URL. It seeds through Postgres, calls HTTP, and compares normalised JSON (ids and timestamps masked) | `port/cases/http/<group>.jsonl`, recorded from Next | The same suite pointed at the Rust base URL |
| **HTTP, streaming** (`/api/chat`, `/v1/chat/completions`, wizard) | Next running against `perf/mock-llm`, extended into a **scripted** stub: each case names a script of text deltas, reasoning, tool calls and errors, so the stream is deterministic | Recorded SSE frames plus response headers plus the database rows written after the stream | The Rust service replays the same scripts and must produce the same frames, headers and rows |

Every oracle, case file and parity test goes into `.agents/protected-paths` the
day it lands.

**Where LLM output itself is the behaviour** (the memory summary from
gpt-4o-mini, chatflow `generateObject` extraction, whether the model *chooses*
to call `saveMemory`), parity is on the state transition given a stubbed model
response, not on the model's text.

## 3. Order of work

Leaves first, then what depends on them. Phases A and B can run in parallel.

### Phase 0: groundwork (one PR each)
1. The owner's decisions from §0, recorded in this file.
2. Measure the TypeScript baseline for the §0 table.
3. Add tenancy rows for `/api/assistants/[id]` and its binding routes to
   `apps/cloud/src/test/tenancy-cases.ts`, and lower the budget. They are not
   covered today.
4. The `rust/` workspace skeleton: the crates above, lints from
   `stacks/rust/lints.toml`, `@emit rust` for error codes, a `rust` part in
   `scripts/check.sh`, and CI caching.
5. The scripted mock LLM, plus the `tests/contract/` runner that can target
   either implementation.

### Phase A: pure leaves (parity on `port/cases/*.jsonl`)
- **Memory:**
  - `fact-keys.ts` (normalizeMemoryKey and the matchers)
  - the merge/collapse/apply/forget functions and `profileContentFingerprint`, `summaryNeedsRefresh` in `long-term-memory.ts`
  - the regex extractors (`extractEntities`, `extractFacts`, `detectContext`, `extractPermanentFacts`, `extractPreferences`)
  - the three `format*ForPrompt` functions and `buildPromptWithMemory`
- **Assistants:**
  - `core/completeness.ts`
  - the create/update field-copy, the built-in whitelist and the `toNullableJson*` helpers
  - `bindings` hidden-tool merge
  - `wizard` `filterKnownIds`, `buildWizardSystemPrompt`, `sanitizeProposal`
  - cloud `model-policy` and `plans`
- **Chat:**
  - `script-guard` predicates, `house-models`, `step-budget`
  - `session-sync`, `sanitizeEditHistory`, `buildPersistedUserRow`
  - the content→parts normalisation
  - `lib/prompts/*` (guard rails, variables, response format, instructions)
  - `lib/tools/approval.ts` (mode resolution and `toolNeedsApproval`)
  - `agent-api` `response.ts` framing and `estimateTokens`/`fitContext`

### Phase B: agent builder service (first HTTP cutover)
This is the smallest real surface: about 20 routes, plain CRUD, no streaming.
It proves the auth, tenancy, sqlx and Caddy plumbing before chat depends on it.
- `/api/assistants` (GET, POST), `/[id]` (GET, PUT, DELETE), `/[id]/{tools,skills,mcp-servers,workflows}`, `/[id]/default`, `/api/user/default-assistant`, and the `/api/mobile/assistants/**` mirror.
- Cloud overrides ported with them: the plan cap and the model-plan 402 (`apps/cloud/src/app/api/assistants/**`).
- The wizard stream comes last in this phase. It needs `agents-llm` and the UI-stream encoder from Phase D, so it can move to D.

### Phase C: chat memory service
- `/api/dashboard/memory` and `/[id]`, `/api/mobile/memories` and `/[id]`.
- Store adapters: `UserMemory` working and long-term rows (including the compare-and-swap on `updatedAt` with 8 retries); SurrealDB `conversation_memory` recall and store; embeddings with an LRU cache.
- **The concurrency property must be tested with N parallel writers** (AGENTS.md §3): the profile is never lost under concurrent updates. The in-process `profile-lock.ts` does not survive more than one instance, so Rust uses `SELECT … FOR UPDATE` or the compare-and-swap alone. Record that as difference #1 once agreed.

### Phase D: chat
This is the biggest piece: `runChat` is one function of about 1,370 lines
(`features/chat-public/service.ts:262-1635`), and RUST.md in the OSS repo
advised doing it last. To keep it shippable, it is cut over **by capability**,
not all at once:
1. **D1: dashboard sessions and messages CRUD** (`/api/dashboard/chat/sessions/**`). Plain HTTP.
2. **D2: plain chat.** `POST /api/chat` for an assistant with no KB, no tools, no chatflow and no attachments. That covers memory injection, guard rails, the prompt pipeline, streaming, the post-stream memory drain, persistence, usage and credits. The BFF (or Caddy, by a header Next sets) routes only those requests to Rust; everything else stays on Next.
3. **D3: tools.** The registry, the approval gate, built-in tools, then MCP, then workflows-as-tools. The approval gate is an in-process `Map` of pending promises today (`lib/tools/approval.ts:71-120`), so it must move to Postgres or Redis before more than one instance can serve it.
4. **D4: KB and RAG** (hybrid search, the out-of-scope gate, citations, the trailing `sources` frame), then attachments.
5. **D5: the other chat entry points**: widget, mobile (non-streaming), `/v1/chat/completions` (OpenAI SSE framing, which already has wire-format tests), and the Socket.io `api:chat` proxy.

**The streaming contract to hold** is what `@ai-sdk/react` 3.0.41 parses: the
UI-message-stream part types (text, reasoning and tool-input/output start, delta
and end, then `finish-step`, then `[DONE]`), plus the frames and headers this
app adds. These are the non-standard `sources` frame **after** `[DONE]` and the
`X-Tool-Approval`, `X-RAG-Trace` and `X-Model-Fallback` headers. Record them in
Phase 0 and freeze them in `agents-contracts`.

## 4. Gating each slice

- A worker gets the `port-brief.md` brief: the old source, the target file, the case file and the oracle command.
- A slice is accepted when `scripts/check.sh` passes **and** fresh oracle cases aimed at the "what differs" list pass. That is a script, not a review.
- **What to generate cases for here:**
  - JS regex versus Rust `regex`: no look-around or backreferences, `\p{L}` and `/i` semantics. This matters for the memory extractors and script-guard.
  - `toLocaleDateString()` in the profile formatter
  - Map key order in the JSON columns
  - `undefined`, `null` and absent keys in `memoryConfig`, `modelConfig` and `guardRails` (`z.unknown()` today, so anything goes)
  - UTF-16 versus byte lengths in the 200-char snippet truncation and the `wizard` limits (≤4000 chars)
  - `Date.now()` and `nanoid`: inject them so outputs are reproducible

## 5. Run both, then cut over

| Surface | Shadow method | Cutover order |
|---|---|---|
| Assistants and memory GETs | Next calls Rust in the background for a sample and logs every mismatch | Reads, then writes, then delete the TS route |
| Writes | No shadow writes. Contract suite plus staging, compared at the database row level | Behind a Caddy path rule, so rollback is one line |
| Chat | Replay recorded transcripts through the scripted stub nightly. Never shadow live chats, because that doubles LLM cost | Per capability (D2 to D5), staging first, then a percentage of orgs |

Keep the rollback until the agreed number of clean days has passed. Delete the
TS code in the same week as cutover (port-code step 8). Make the Rust code
idiomatic only after that.

## 6. Bugs found in these modules

Per decision 3, all of these are fixed **in the Rust version**, each recorded in
`differences.md`. The TypeScript routes keep them until their group cuts over.

| Fix in Rust | Source |
|---|---|
| Working memory is keyed on a client-supplied `threadId` alone, so it can be read and overwritten across users (`lib/memory/working-memory.ts:77-84, 138-155, 534-541`) | memory map |
| Any logged-in user can edit **built-in** assistants and their bindings (`assistants/core/service.ts:203-233`, `bindings/service.ts:39`) | assistants map |
| Binding PUTs check the org but not the role | assistants map |
| Setting a system default clears it for **every** org (`default/repository.ts:12-16`) | assistants map |
| The mobile assistant create, duplicate and PUT routes skip the cloud plan cap and model-plan check | assistants map, QA TC-1685 pattern |
| Conversation message list not scoped to the tenant | QA TC-1294 |
| Widget `visitorId` not namespaced by embed or org (`features/widget/chat/service.ts:162-164`) | memory map |

**Also fixed in Rust** (not carried over):
- TC-1548 (memory tools fire uninvited: they are approval-exempt and the prompt says "you MUST call")
- TC-1545 (script-guard strips requested scripts)
- TC-1546 (regenerate truncates)
- TC-1549 (relative timestamps)
- TC-944 (edit history not persisted)
- TC-1032 (chat after the assistant is deleted)
- TC-1038 (opening message not shown)
- invalid `?type=` on `/api/dashboard/memory` returns 500
- the dashboard memory DELETE ignores `parsed.success`

Full list: `docs/port/qa-backlog.md`.

## 7. Risks

- **The AI SDK does a lot for free**: message conversion, the multi-step tool loop with `stepCountIs`, `experimental_transform` (think-extraction, the script-guard repair call), and `totalUsage` summed across steps. Each has to be rebuilt and held to parity. This is why D2 excludes tools.
- **Fire-and-forget work after the stream** (memory drain, persistence, credits) relies on Node's promise lifetime. In Rust it must be explicit spawned tasks with shutdown draining, or writes get lost on deploy.
- **Two implementations drift** if feature work keeps landing in TS modules marked "in progress". The ledger rule forbids it, so the owner has to hold the line.
- **Scope creep.** Mastra memory (`MASTRA_MEMORY_ENABLED`) and the digital-employee `EmployeeMemory` are out of scope. Port only what is on by default.

## 8. Not started, on purpose

Auth flows (login, OAuth, sign-up), billing and Midtrans, workflows, Design
(Od), Media Studio, the knowledge-base ingestion pipeline and Socket.io stay in
TypeScript until these three modules are cut over and the number from §0 has
been measured.

## 9. Decisions waiting for the owner

None. See §0.
